"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useAccount,
  useBalance,
  useChainId,
} from "wagmi";
import { formatUnits } from "viem";
import { arcTestnet } from "viem/chains";

import { useDemoPoints } from "../providers/DemoPointsProvider";

function formatDisplayedBalance(
  value: bigint | undefined,
  decimals: number | undefined
): string {
  if (
    value === undefined ||
    decimals === undefined
  ) {
    return "0.0000";
  }

  const formatted = Number(
    formatUnits(value, decimals)
  );

  if (!Number.isFinite(formatted)) {
    return "0.0000";
  }

  return formatted.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

const SERVER_BALANCE_EVENT =
  "predarc:server-balance";

export default function DemoBalanceCard() {
  const { balance, resetPoints } = useDemoPoints();
  const [
    serverBalance,
    setServerBalance,
  ] = useState<string | null>(null);
  const [
    serverBalanceMessage,
    setServerBalanceMessage,
  ] = useState("");
  const [
    isCheckingServerBalance,
    setIsCheckingServerBalance,
  ] = useState(false);

  const {
    address,
    isConnected,
  } = useAccount();

  const connectedChainId = useChainId();

  const isArcTestnet =
    connectedChainId === arcTestnet.id;

  const {
    data: walletBalance,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(address),
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  });

  const displayedWalletBalance =
    formatDisplayedBalance(
      walletBalance?.value,
      walletBalance?.decimals
    );

  const balanceSymbol =
    walletBalance?.symbol || "USDC";

  async function refreshWalletBalance(): Promise<void> {
    await refetch();
  }

  async function checkServerBalance(): Promise<void> {
    setIsCheckingServerBalance(true);
    setServerBalanceMessage("");

    try {
      const response =
        await fetch("/api/account", {
          method: "POST",
          credentials: "same-origin",
        });

      const result =
        await response.json();      const nextServerBalance =
        typeof result?.points === "number" && Number.isFinite(result.points)
          ? String(result.points)
          : typeof result?.balance === "string" &&
              /^(0|[1-9][0-9]*)$/.test(result.balance)
            ? result.balance
            : null;

      if (!response.ok || nextServerBalance === null) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Server balance check failed."
        );
      }

      setServerBalance(nextServerBalance);

      setServerBalanceMessage(
        `Server balance checked successfully (HTTP ${response.status}).`
      );
    } catch (error) {
      setServerBalanceMessage(
        error instanceof Error
          ? error.message
          : "Server balance check failed."
      );
    } finally {
      setIsCheckingServerBalance(false);
    }
  }

  useEffect(() => {
    function handleServerBalance(
      event: Event
    ) {
      const detail =
        (event as CustomEvent<{
          balance?: unknown;
          message?: unknown;
        }>).detail;

      if (
        typeof detail?.balance !==
          "string" ||
        !/^(0|[1-9][0-9]*)$/.test(
          detail.balance
        )
      ) {
        void checkServerBalance();
        return;
      }

      setServerBalance(
        detail.balance
      );

      setServerBalanceMessage(
        typeof detail.message ===
          "string"
          ? detail.message
          : "Server balance updated after prediction."
      );
    }

    window.addEventListener(
      SERVER_BALANCE_EVENT,
      handleServerBalance
    );

    return () => {
      window.removeEventListener(
        SERVER_BALANCE_EVENT,
        handleServerBalance
      );
    };
  }, []);

  useEffect(() => {
    void checkServerBalance();
  }, []);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
      {/* Server demo balance */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400">
            Server Demo Balance
          </p>

          <h2 className="mt-2 text-3xl font-black text-white">
            {serverBalance !== null
              ? Number(
                  serverBalance
                ).toLocaleString()
              : "—"}

            <span className="ml-2 text-sm text-purple-200">
              POINTS
            </span>
          </h2>
        </div>

        <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-purple-200">
          Server
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-gray-500">
        Supabase-backed testnet points are used for the
        current Predarc demo. They have no cash value and
        cannot be transferred or redeemed.
      </p>

      <div className="mt-4 rounded-2xl border border-purple-300/20 bg-purple-300/5 p-4">
        <button
          type="button"
          onClick={() => {
            void checkServerBalance();
          }}
          disabled={isCheckingServerBalance}
          className="mt-3 w-full rounded-xl bg-purple-300 px-4 py-3 text-sm font-bold text-black transition hover:bg-purple-200 disabled:cursor-wait disabled:opacity-50"
        >
          {isCheckingServerBalance
            ? "Checking Balance..."
            : "Check Server Balance"}
        </button>

        {serverBalanceMessage ? (
          <p className="mt-3 text-xs leading-5 text-purple-100">
            {serverBalanceMessage}
          </p>
        ) : null}

        <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Legacy local balance
          </p>

          <p className="mt-1 text-xs text-gray-400">
            {balance.toLocaleString()} local points remain in
            this browser for old demo history only.
          </p>
        </div>
      </div>

      {/* Arc wallet balance */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Arc Testnet Gas Balance
            </p>

            {!isConnected ? (
              <p className="mt-2 text-sm font-semibold text-gray-400">
                Connect wallet to view balance
              </p>
            ) : !isArcTestnet ? (
              <p className="mt-2 text-sm font-semibold text-orange-400">
                Switch your wallet to Arc Testnet
              </p>
            ) : isLoading ? (
              <p className="mt-2 text-sm font-semibold text-gray-400">
                Loading wallet balance...
              </p>
            ) : error ? (
              <p className="mt-2 text-sm font-semibold text-rose-400">
                Wallet balance unavailable
              </p>
            ) : (
              <p className="mt-2 text-2xl font-black text-white">
                {displayedWalletBalance}

                <span className="ml-2 text-sm text-blue-300">
                  {balanceSymbol}
                </span>
              </p>
            )}
          </div>

          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              isConnected && isArcTestnet
                ? "bg-emerald-400"
                : "bg-orange-400"
            }`}
          />
        </div>

        {isConnected && isArcTestnet ? (
          <button
            type="button"
            onClick={() => {
              void refreshWalletBalance();
            }}
            disabled={isFetching}
            className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-gray-300 transition hover:border-blue-500/40 hover:text-blue-300 disabled:cursor-wait disabled:opacity-50"
          >
            {isFetching
              ? "Refreshing Balance..."
              : "Refresh Wallet Balance"}
          </button>
        ) : null}
      </div>

      {/* Actions */}
      <div className="mt-4 grid gap-2">
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 transition hover:border-blue-400 hover:bg-blue-500/20"
        >
          💧 Get Arc Testnet USDC ↗
        </a>

        <button
          type="button"
          onClick={resetPoints}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-400 transition hover:border-purple-300/50 hover:text-purple-200"
        >
          Reset Legacy Local Points
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] leading-4 text-gray-500">
          Arc Testnet USDC is used only for test-network
          transaction gas. It has no real-world value.
        </p>
      </div>
    </section>
  );
}

