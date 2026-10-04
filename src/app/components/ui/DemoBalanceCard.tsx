"use client";

import { colorfulButtonClass } from "./button-colorful";

import {
  useAccount,
  useBalance,
  useChainId,
} from "wagmi";
import { formatUnits } from "viem";

import {
  forecastChainId,
  forecastNetwork,
  forecastNetworkLabel,
} from "@/lib/forecast-network";

import { useDemoPoints } from "../providers/DemoPointsProvider";
import { usePredarcSession } from "../providers/PredarcSessionProvider";

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

export default function DemoBalanceCard() {
  const { balance, resetPoints } = useDemoPoints();
  const {
    accountBalance,
    status,
    message: sessionMessage,
    isBusy: isSessionBusy,
    isAuthenticated,
    isSignedIn,
    hasWalletMismatch,
    signIn,
    signOut,
    refreshAccount,
  } = usePredarcSession();

  const {
    address,
    isConnected,
  } = useAccount();

  const connectedChainId = useChainId();

  const isForecastNetwork =
    connectedChainId === forecastChainId;

  const {
    data: walletBalance,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useBalance({
    address,
    chainId: forecastChainId,
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

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
      {/* Server demo balance */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400">
            Server Demo Balance
          </p>

          <h2 className="mt-2 text-3xl font-black text-white">
            {isSignedIn && accountBalance !== null
              ? BigInt(
                  accountBalance
                ).toLocaleString()
              : "—"}

            <span className="ml-2 text-sm text-orange-200">
              POINTS
            </span>
          </h2>
        </div>

        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-orange-200">
          Server
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-gray-500">
        Your first Predarc sign-in creates 1,000 server points once per
        wallet. They load automatically and are used for predictions.
      </p>

      <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
        <button
          type="button"
          onClick={() => {
            if (hasWalletMismatch) {
              void signOut();
            } else if (!isAuthenticated) {
              void signIn();
            } else {
              void refreshAccount();
            }
          }}
          disabled={
            isSessionBusy ||
            status === "checking" ||
            !isConnected
          }
          className={`${colorfulButtonClass} mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-wait disabled:opacity-50`}
        >
          {status === "checking"
            ? "Checking Sign-in..."
            : isSessionBusy
              ? "Check Your Wallet..."
              : !isConnected
                ? "Connect Wallet Above"
                : hasWalletMismatch
                  ? "Sign Out Different Wallet"
                  : !isAuthenticated
                    ? "Sign In & Load Server Points"
                    : "Refresh Server Points"}
        </button>

        {sessionMessage ? (
          <p className="mt-3 text-xs leading-5 text-orange-100">
            {sessionMessage}
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
              {forecastNetworkLabel} Gas Balance
            </p>

            {!isConnected ? (
              <p className="mt-2 text-sm font-semibold text-gray-400">
                Connect wallet to view balance
              </p>
            ) : !isForecastNetwork ? (
              <p className="mt-2 text-sm font-semibold text-orange-400">
                Switch your wallet to {forecastNetworkLabel}
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
              isConnected && isForecastNetwork
                ? "bg-emerald-400"
                : "bg-orange-400"
            }`}
          />
        </div>

        {isConnected && isForecastNetwork ? (
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
        {forecastNetwork === "mainnet" ? (
          <a
            href="/bridge"
            className="flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 transition hover:border-blue-400 hover:bg-blue-500/20"
          >
            Bridge to Arc Mainnet ↗
          </a>
        ) : (
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 transition hover:border-blue-400 hover:bg-blue-500/20"
          >
            💧 Get Arc Testnet USDC ↗
          </a>
        )}

        <button
          type="button"
          onClick={resetPoints}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-400 transition hover:border-orange-500/50 hover:text-orange-200"
        >
          Reset Legacy Local Points
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
        <p className="text-[10px] leading-4 text-gray-500">
          {forecastNetwork === "mainnet"
            ? "Arc Mainnet uses native USDC for transaction gas. Mainnet USDC has real-world value."
            : "Arc Testnet USDC is used only for test-network transaction gas. It has no real-world value."}
        </p>
      </div>
    </section>
  );
}
