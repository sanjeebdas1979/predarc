"use client";

import { useAccount } from "wagmi";

import { usePredarcNetwork } from "@/app/components/providers/PredarcNetworkProvider";
import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getPredarcNetwork,
  type PredarcChainId,
} from "@/lib/predarc-networks";

const OPTIONS = [ARC_MAINNET_CHAIN_ID, BASE_MAINNET_CHAIN_ID] as const;

export default function PredarcNetworkSelector({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { isConnected } = useAccount();
  const {
    selectedChainId,
    forecastRegistryAddress,
    isSwitching,
    selectNetwork,
  } = usePredarcNetwork();

  if (!isConnected) return null;

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-black/20 ${
        compact ? "p-2" : "p-3"
      }`}
      aria-label="Predarc network"
    >
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
        Active Predarc network
      </p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((chainId) => {
          const option = getPredarcNetwork(chainId);
          const active = selectedChainId === chainId;
          return (
            <button
              key={chainId}
              type="button"
              aria-pressed={active}
              disabled={isSwitching}
              onClick={() => void selectNetwork(chainId as PredarcChainId)}
              className={`rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
                active
                  ? "border-orange-400/60 bg-orange-400/15 text-orange-100"
                  : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/25 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {!forecastRegistryAddress && selectedChainId === BASE_MAINNET_CHAIN_ID ? (
        <p className="mt-2 text-[11px] leading-4 text-amber-300">
          Base forecasting activates after the verified Base contract address is configured.
        </p>
      ) : null}
    </div>
  );
}
