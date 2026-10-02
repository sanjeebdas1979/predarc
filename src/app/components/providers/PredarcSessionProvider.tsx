"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useConfig,
  useDisconnect,
  useSignMessage,
} from "wagmi";
import { getAccount } from "wagmi/actions";

import { forecastChainId } from "@/lib/forecast-network";
import {
  parsePredarcAccount,
  parsePredarcSession,
  sessionMatchesWallet,
  type PredarcSession,
} from "@/lib/predarc-session-core";

const SERVER_BALANCE_EVENT = "predarc:server-balance";

type SessionStatus =
  | "checking"
  | "signed-out"
  | "signed-in"
  | "error";

type PredarcSessionContextValue = {
  session: PredarcSession | null;
  status: SessionStatus;
  accountBalance: string | null;
  message: string;
  isBusy: boolean;
  isAuthenticated: boolean;
  isSignedIn: boolean;
  hasWalletMismatch: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const PredarcSessionContext =
  createContext<PredarcSessionContextValue | null>(null);

function safeMessage(
  error: unknown,
  fallback: string
): string {
  if (
    error instanceof Error &&
    error.message.length > 0 &&
    error.message.length < 250
  ) {
    return error.message;
  }

  return fallback;
}

async function readJson(
  response: Response
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function PredarcSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [session, setSession] =
    useState<PredarcSession | null>(null);
  const [status, setStatus] =
    useState<SessionStatus>("checking");
  const [accountBalance, setAccountBalance] =
    useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const requestSequence = useRef(0);
  const actionLock = useRef(false);

  const loadAccount = useCallback(
    async (
      expectedSession: PredarcSession,
      requestId?: number
    ): Promise<string> => {
      const response = await fetch("/api/account", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readJson(response);

      if (
        requestId !== undefined &&
        requestId !== requestSequence.current
      ) {
        throw new Error("A newer session check replaced this request.");
      }

      if (response.status === 401) {
        setSession(null);
        setAccountBalance(null);
        setStatus("signed-out");
        throw new Error("Your Predarc session ended. Sign in again.");
      }

      if (!response.ok) {
        const error =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Server points are temporarily unavailable.";
        throw new Error(error);
      }

      const account = parsePredarcAccount(
        result,
        expectedSession
      );

      if (!account) {
        throw new Error("Predarc returned an unexpected account response.");
      }

      setAccountBalance(account.balance);
      window.dispatchEvent(
        new CustomEvent(SERVER_BALANCE_EVENT, {
          detail: {
            balance: account.balance,
            message: "Server points synced.",
          },
        })
      );

      return account.balance;
    },
    []
  );

  const refreshSession = useCallback(async () => {
    if (actionLock.current) return;

    const requestId = ++requestSequence.current;

    setStatus((current) =>
      current === "signed-in" ? current : "checking"
    );

    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await readJson(response);

      if (requestId !== requestSequence.current) return;

      if (!response.ok) {
        throw new Error("Predarc sign-in status is temporarily unavailable.");
      }

      const nextSession = parsePredarcSession(
        result,
        forecastChainId
      );

      if (!nextSession) {
        setSession(null);
        setAccountBalance(null);
        setStatus("signed-out");
        setMessage("");
        return;
      }

      setSession(nextSession);
      setStatus("signed-in");
      setMessage("");

      try {
        await loadAccount(nextSession, requestId);
      } catch (error) {
        if (requestId === requestSequence.current) {
          setMessage(
            safeMessage(
              error,
              "Signed in, but server points could not be loaded."
            )
          );
        }
      }
    } catch (error) {
      if (requestId !== requestSequence.current) return;

      setStatus((current) =>
        current === "signed-in" ? current : "error"
      );
      setMessage(
        safeMessage(
          error,
          "Predarc sign-in status is temporarily unavailable."
        )
      );
    }
  }, [loadAccount]);

  const signIn = useCallback(async () => {
    if (actionLock.current) return;

    actionLock.current = true;
    setIsBusy(true);
    setMessage("");

    try {
      const initial = getAccount(config);

      if (!initial.isConnected || !initial.address) {
        throw new Error("Connect your wallet first.");
      }

      const wallet = initial.address;
      const normalizedWallet = wallet.toLowerCase();

      if (session && session.wallet !== normalizedWallet) {
        throw new Error(
          "A different wallet is signed in. Sign out before continuing."
        );
      }

      function checkWallet() {
        const current = getAccount(config);

        if (
          !current.isConnected ||
          current.address?.toLowerCase() !== normalizedWallet
        ) {
          throw new Error("Wallet changed. Start sign-in again.");
        }
      }

      const challengeResponse = await fetch(
        "/api/auth/challenge",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet }),
        }
      );
      const challenge = await readJson(challengeResponse);

      if (!challengeResponse.ok) {
        const error =
          typeof challenge === "object" &&
          challenge !== null &&
          "error" in challenge &&
          typeof challenge.error === "string"
            ? challenge.error
            : "Could not start Predarc sign-in.";
        throw new Error(error);
      }

      if (
        typeof challenge !== "object" ||
        challenge === null ||
        !("chainId" in challenge) ||
        challenge.chainId !== forecastChainId ||
        !("message" in challenge) ||
        typeof challenge.message !== "string" ||
        !("challengeId" in challenge) ||
        typeof challenge.challengeId !== "string"
      ) {
        throw new Error("Predarc returned an unexpected sign-in challenge.");
      }

      checkWallet();
      setMessage(
        "Review the Predarc sign-in message. It has no gas fee or token approval."
      );

      const signature = await signMessageAsync({
        account: wallet,
        message: challenge.message,
      });

      checkWallet();
      setMessage("Verifying your wallet signature…");

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          signature,
        }),
      });
      const verified = await readJson(verifyResponse);

      if (!verifyResponse.ok) {
        const error =
          typeof verified === "object" &&
          verified !== null &&
          "error" in verified &&
          typeof verified.error === "string"
            ? verified.error
            : "Predarc could not verify this signature.";
        throw new Error(error);
      }

      const nextSession = parsePredarcSession(
        verified,
        forecastChainId
      );

      if (!nextSession || nextSession.wallet !== normalizedWallet) {
        throw new Error("Predarc returned an unexpected sign-in response.");
      }

      ++requestSequence.current;
      setSession(nextSession);
      setStatus("signed-in");

      const balance = await loadAccount(nextSession);
      checkWallet();
      setMessage(
        `Signed in. ${BigInt(balance).toLocaleString()} server points are ready.`
      );
    } catch (error) {
      setMessage(
        safeMessage(
          error,
          "Sign-in was cancelled or failed. Please try again."
        )
      );
    } finally {
      actionLock.current = false;
      setIsBusy(false);
    }
  }, [config, loadAccount, session, signMessageAsync]);

  const signOut = useCallback(async () => {
    if (actionLock.current) return;

    actionLock.current = true;
    setIsBusy(true);
    setMessage("Signing out…");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(
          "Sign-out could not be confirmed. Your session may still be active."
        );
      }

      ++requestSequence.current;
      setSession(null);
      setAccountBalance(null);
      setStatus("signed-out");

      try {
        await disconnectAsync();
        setMessage("Signed out and wallet disconnected from Predarc.");
      } catch {
        setMessage(
          "Signed out. Disconnect the wallet manually if it still appears connected."
        );
      }
    } catch (error) {
      setMessage(
        safeMessage(
          error,
          "Sign-out failed. Please retry."
        )
      );
    } finally {
      actionLock.current = false;
      setIsBusy(false);
    }
  }, [disconnectAsync]);

  const refreshAccount = useCallback(async () => {
    if (actionLock.current || !session) {
      if (!session) setMessage("Sign in to load server points.");
      return;
    }

    actionLock.current = true;
    setIsBusy(true);
    setMessage("Refreshing server points…");

    try {
      const balance = await loadAccount(session);
      setMessage(
        `Server points updated: ${BigInt(balance).toLocaleString()}.`
      );
    } catch (error) {
      setMessage(
        safeMessage(
          error,
          "Server points could not be refreshed."
        )
      );
    } finally {
      actionLock.current = false;
      setIsBusy(false);
    }
  }, [loadAccount, session]);

  useEffect(() => {
    const refresh = () => {
      if (!actionLock.current) void refreshSession();
    };
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 5 * 60 * 1000);

    window.addEventListener("focus", refresh);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshSession]);

  useEffect(() => {
    function handleBalance(event: Event) {
      const detail = (
        event as CustomEvent<{ balance?: unknown }>
      ).detail;

      if (
        typeof detail?.balance === "string" &&
        /^(0|[1-9][0-9]*)$/.test(detail.balance)
      ) {
        setAccountBalance(detail.balance);
      }
    }

    window.addEventListener(SERVER_BALANCE_EVENT, handleBalance);

    return () => {
      window.removeEventListener(SERVER_BALANCE_EVENT, handleBalance);
    };
  }, []);

  const isAuthenticated = session !== null;
  const isSignedIn =
    isConnected && sessionMatchesWallet(session, address);
  const hasWalletMismatch = Boolean(
    isConnected && session && !isSignedIn
  );

  const value = useMemo(
    () => ({
      session,
      status,
      accountBalance,
      message,
      isBusy,
      isAuthenticated,
      isSignedIn,
      hasWalletMismatch,
      signIn,
      signOut,
      refreshSession,
      refreshAccount,
    }),
    [
      session,
      status,
      accountBalance,
      message,
      isBusy,
      isAuthenticated,
      isSignedIn,
      hasWalletMismatch,
      signIn,
      signOut,
      refreshSession,
      refreshAccount,
    ]
  );

  return (
    <PredarcSessionContext.Provider value={value}>
      {children}
    </PredarcSessionContext.Provider>
  );
}

export function usePredarcSession(): PredarcSessionContextValue {
  const context = useContext(PredarcSessionContext);

  if (!context) {
    throw new Error(
      "usePredarcSession must be used inside PredarcSessionProvider."
    );
  }

  return context;
}
