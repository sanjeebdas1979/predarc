"use client";

import { usePredarcNetwork } from "@/app/components/providers/PredarcNetworkProvider";
import PredarcNetworkSelector from "@/app/components/wallet/PredarcNetworkSelector";

export default function GuideNetworkContext() {
  const { forecastRegistryAddress, network } = usePredarcNetwork();
  const swapAssets =
    network.key === "arc" ? "USDC · EURC · cirBTC" : "USDC · EURC · WETH";

  return (
    <section className="mt-8 max-w-3xl rounded-[1.6rem] border border-cyan-300/15 bg-cyan-300/[0.04] p-4 sm:p-5">
      <PredarcNetworkSelector compact />
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <dt className="text-gray-500">Selected guide network</dt>
          <dd className="mt-1 font-black text-white">{network.label}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <dt className="text-gray-500">Gas token</dt>
          <dd className="mt-1 font-black text-white">
            {network.nativeCurrency}
          </dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <dt className="text-gray-500">Swap assets</dt>
          <dd className="mt-1 font-black text-white">{swapAssets}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <dt className="text-gray-500">Forecasting status</dt>
          <dd className="mt-1 font-black text-white">
            {forecastRegistryAddress
              ? "Verified registry configured"
              : "Waiting for verified network contract"}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-cyan-100/70">
        Predarc keeps sign-in, markets, agent permissions, research limits and
        receipts bound to this selected network. It never falls back to the Arc
        contract while Base is selected.
      </p>
    </section>
  );
}
