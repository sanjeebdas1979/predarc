"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { arcMainnet } from "@/lib/daily";

export default function BridgePage() {
  const { isConnected, chainId, address } = useAccount();

  return (
    <main className="min-h-screen bg-[#080c12] px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <nav className="mb-10 flex justify-between text-sm text-orange-300">
          <Link href="/">Predarc</Link>
          <Link href="/arena">Forecast Arena</Link>
        </nav>

        <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6 sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-400">
            Arc Tools
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Bridge USDC
          </h1>

          <p className="mt-4 leading-7 text-gray-400">
            Move native USDC from Arc Mainnet to another supported chain.
          </p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-gray-400">Wallet</p>
            <p className="mt-2 font-mono text-sm">
              {address
                ? `${address.slice(0, 6)}...${address.slice(-4)}`
                : "Not connected"}
            </p>

            <p className="mt-5 text-sm text-gray-400">Network</p>
            <p className="mt-2 font-bold">
              {!isConnected
                ? "Connect wallet first"
                : chainId === arcMainnet.id
                  ? "Arc Mainnet ready"
                  : "Switch to Arc Mainnet"}
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
            Bridge transfers may be irreversible. Always verify the
            destination chain, amount and wallet before signing.
          </div>

          <button
            type="button"
            disabled
            className="predarc-gradient-button mt-6 w-full"
          >
            Bridge integration loading
          </button>
        </section>
      </div>
    </main>
  );
}
