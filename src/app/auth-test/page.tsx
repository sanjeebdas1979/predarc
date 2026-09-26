"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConfig, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { forecastChainId, forecastNetworkLabel } from "@/lib/forecast-network";
import { getAccount } from "wagmi/actions";

type Session = { wallet: string; chainId: number; expiresAt: string };

const chain = forecastChainId;
const button = "rounded-xl bg-purple-300 hover:bg-purple-200 px-5 py-3 font-bold text-black disabled:opacity-40";

export default function AuthTestPage() {
  const config = useConfig();
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState<{ wallet: string; balance: string } | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState("Checking session…");
  const sequence = useRef(0);
  const refreshSession = useCallback(async () => {
    const current = ++sequence.current;
    setSession(null);
    setSessionStatus("Checking session…");
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error("Lookup failed");
      if (current !== sequence.current) return;
      if (result.authenticated === true && typeof result.wallet === "string"
        && result.chainId === chain && Date.parse(result.expiresAt) > Date.now()) {
        setSession(result);
        setSessionStatus("Signed in");
      } else { setAccount(null); setSessionStatus("Not signed in"); }
    } catch {
      if (current === sequence.current) setSessionStatus("Session check failed. Retry Refresh session.");
    }
  }, []);
  useEffect(() => {
    void refreshSession();
    const refresh = () => { if (!lock.current) void refreshSession(); };
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { ++sequence.current; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [refreshSession]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => void refreshSession(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session, refreshSession]);

  async function logout() {
    ++sequence.current;
    setAccount(null);
    setSessionStatus("Signing out…");
    let response: Response;
    try {
      response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      setSessionStatus("Logout could not be confirmed. Retry Logout.");
      throw new Error("Connection failed. Your session may still be active. Retry Logout.");
    }
    if (!response.ok) {
      setSessionStatus("Logout failed. Retry Logout.");
      throw new Error("Logout failed. Your session may still be active. Retry Logout.");
    }
    setSession(null);
    setSessionStatus("Not signed in");
    try {
      await disconnectAsync();
      setMessage("Logged out and wallet disconnected from Predarc.");
    } catch {
      setMessage("Logged out successfully. Wallet disconnect failed; disconnect it in your wallet if needed.");
    }
  }

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    ++sequence.current;
    try { await action(); }
    catch (error) {
      setMessage(error instanceof Error && error.message.length < 250
        ? error.message : "Request cancelled or failed. Start sign-in again.");
    } finally { lock.current = false; setBusy(false); }
  }

  async function signIn() {
    if (session || sessionStatus !== "Not signed in") return;
    setAccount(null);
    const initial = getAccount(config);
    if (!initial.address || initial.chainId !== chain) throw new Error(`Connect on ${forecastNetworkLabel} first.`);
    const wallet = initial.address;
    function checkWallet() {
      const current = getAccount(config);
      if (current.address !== wallet || current.chainId !== chain) {
        throw new Error("Wallet or network changed. Start sign-in again.");
      }
    }
    const response = await fetch("/api/auth/challenge", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const challenge = await response.json();
    if (!response.ok) throw new Error(challenge.error || "Could not create challenge.");
    if (challenge.chainId !== chain || typeof challenge.message !== "string"
      || typeof challenge.challengeId !== "string") throw new Error("Unexpected challenge response.");
    checkWallet();
    setMessage("Review the sign-in message in your wallet. No transaction is requested.");
    const signature = await signMessageAsync({ account: wallet, message: challenge.message });
    checkWallet();
    setMessage("Checking your signature…");
    const verified = await fetch("/api/auth/verify", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
    });
    const result = await verified.json();
    if (!verified.ok) throw new Error(result.error || "Signature verification failed.");
    if (result.authenticated !== true || result.chainId !== chain
      || result.wallet !== wallet.toLowerCase()) throw new Error("Unexpected verification response.");
    await refreshSession();
    checkWallet();
    setMessage(`Sign-in succeeded for ${result.wallet}. Session expires at ${result.expiresAt}.`);
  }

  async function checkBalance() {
    setAccount(null);
    if (!session || sessionStatus !== "Signed in") {
      throw new Error("Sign in with your wallet first.");
    }
    const expectedWallet = session.wallet;
    const current = sequence.current;
    const connected = getAccount(config);
    if (!connected.isConnected || connected.address?.toLowerCase() !== expectedWallet
      || connected.chainId !== chain) {
      throw new Error(`Connect the signed-in wallet on ${forecastNetworkLabel} first.`);
    }
    setMessage("Checking your server demo balance…");
    const response = await fetch("/api/account", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (current !== sequence.current) return;
    if (response.status === 401) {
      setSession(null);
      setSessionStatus("Not signed in");
      throw new Error("Your session has ended. Sign in again.");
    }
    if (!response.ok) {
      throw new Error(`Balance check failed (HTTP ${response.status}). Please retry.`);
    }
    if (!result || result.authenticated !== true || result.wallet !== expectedWallet
      || result.chainId !== chain || typeof result.balance !== "string"
      || !/^(0|[1-9][0-9]*)$/.test(result.balance)) {
      throw new Error("Unexpected account response. Please refresh the session.");
    }
    const latest = getAccount(config);
    if (!latest.isConnected || latest.address?.toLowerCase() !== expectedWallet
      || latest.chainId !== chain || Date.parse(session.expiresAt) <= Date.now()) {
      throw new Error("Wallet, network or session changed. Refresh the session before retrying.");
    }
    setAccount({ wallet: expectedWallet, balance: result.balance });
    setMessage("Balance checked successfully (HTTP 200).");
  }

  return (
    <main className="min-h-screen bg-[#080c12] px-5 py-12 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/arena" className="text-purple-300">← Prediction arena</Link>
        <h1 className="text-3xl font-bold">Predarc sign in</h1>
        <p>Arc Testnet · Sign a login message. No gas fee, payment or token approval.</p>
        <p className="text-gray-400">Login lasts up to one hour. Connecting your wallet is the first step; signing the message logs you in. Logout ends this session and disconnects your wallet from Predarc.</p>
        {!session && <p className="break-all">{address
          ? `Wallet ready to sign in: ${address}` : "Connect your wallet to begin."}</p>}
        <section className="space-y-2 rounded-xl border border-white/15 p-4" aria-live="polite">
          <p>Login status: {sessionStatus}</p>
          {session && <>
            <p className="break-all">Signed-in wallet: {session.wallet}</p>
            <p>Expires: {session.expiresAt}</p>
            <p>{address?.toLowerCase() === session.wallet && chainId === session.chainId
              ? "Connected wallet matches this session."
              : "Connected wallet or network does not match this session. Sign out before signing in with another wallet."}</p>
          </>}
          <div className="flex flex-wrap gap-3">
            <button className={button} disabled={busy} onClick={() => void run(refreshSession)}>Refresh session</button>
            {(session || sessionStatus.startsWith("Logout")) &&
              <button className={button} disabled={busy} onClick={() => void run(logout)}>Logout</button>}
          </div>
        </section>
        {session && sessionStatus === "Signed in" && (
          <section className="space-y-3 rounded-xl border border-purple-300/25 p-4" aria-live="polite">
            <h2 className="text-lg font-bold">Server demo balance</h2>
            <p className="text-sm text-gray-400">Your first check creates 1,000 testnet demo points once per wallet. Checking again does not add more points. These points have no cash value and are separate from the current arena demo balance.</p>
            <button type="button" className={button}
              disabled={busy || !isConnected || address?.toLowerCase() !== session.wallet || chainId !== chain}
              onClick={() => void run(checkBalance)}>Check balance</button>
            {account?.wallet === session.wallet && isConnected
              && address?.toLowerCase() === session.wallet && chainId === chain && (
              <p className="text-xl font-bold text-purple-200">
                Server balance: {account.balance} demo points
              </p>
            )}
          </section>
        )}
        <div className="flex flex-wrap gap-3">
          {!session && sessionStatus === "Not signed in" && !isConnected && connectors.map(connector => (
            <button className={button} key={connector.uid} disabled={busy}
              onClick={() => void run(async () => { await connectAsync({ connector }); })}>
              Connect {connector.name}
            </button>
          ))}
          {!session && sessionStatus === "Not signed in" && isConnected && chainId !== chain && <button className={button} disabled={busy}
            onClick={() => void run(async () => { await switchChainAsync({ chainId: chain }); })}>Switch to {forecastNetworkLabel}</button>}
          {!session && sessionStatus === "Not signed in" && isConnected && chainId === chain &&
            <button className={button} disabled={busy}
              onClick={() => void run(signIn)}>{busy ? "Please wait…" : "Sign in with wallet"}</button>}
        </div>
        {!isConnected && connectors.length === 0 && <p>Open this page in your wallet-enabled browser.</p>}
        <p role="status" className="break-words text-purple-200">{message}</p>
      </div>
    </main>
  );
}
