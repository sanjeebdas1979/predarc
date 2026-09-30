"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import type { EIP1193Provider } from "viem";
import { mainnet } from "viem/chains";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { arcMainnet } from "@/lib/daily";
import ConnectWallet from "../components/wallet/ConnectWallet";

type Direction = "arc-eth" | "eth-arc";
type CircleChain = "Arc" | "Ethereum";

export default function BridgePage() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [route, setRoute] = useState<Direction>("arc-eth");
  const [amount, setAmount] = useState("0.01");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const fromArc = route === "arc-eth";
  const fromChain: CircleChain = fromArc ? "Arc" : "Ethereum";
  const toChain: CircleChain = fromArc ? "Ethereum" : "Arc";
  const fromLabel = fromArc ? "Arc Mainnet" : "Ethereum Mainnet";
  const toLabel = fromArc ? "Ethereum Mainnet" : "Arc Mainnet";
  const fromId = fromArc ? arcMainnet.id : mainnet.id;
  async function bridge() {
    setMessage("");

    if (!isConnected || !address || !connector) {
      setMessage("Connect your wallet first.");
      return;
    }

    if (
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) ||
      Number(amount) <= 0
    ) {
      setMessage("Enter a valid USDC amount.");
      return;
    }

    setBusy(true);

    try {
      if (chainId !== fromId) {
        setMessage("Switching to " + fromLabel + "...");
        await switchChainAsync({ chainId: fromId });
      }

      setMessage("Confirm the bridge transaction in MetaMask.");

      const provider =
        (await connector.getProvider()) as EIP1193Provider;

      const adapter =
        await createViemAdapterFromProvider({ provider });

      const kit = new AppKit();

      const result = await kit.bridge({
        from: { adapter, chain: fromChain },
        to: { adapter, chain: toChain },
        amount,
      });

      const state =
        typeof result === "object" &&
        result !== null &&
        "state" in result
          ? String(
              (result as { state?: unknown }).state ??
                "submitted"
            )
          : "submitted";

      setMessage(
        "Bridge submitted: " +
          fromLabel +
          " → " +
          toLabel +
          " (" +
          state +
          ")"
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Bridge failed."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#080c12] px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <nav className="mb-8 flex justify-between text-orange-300">
          <Link href="/">Predarc</Link>
          <Link href="/arena">Forecast Arena</Link>
        </nav>

        <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6">
          <p className="font-black uppercase tracking-[0.2em] text-orange-400">
            Arc Tools
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Bridge USDC
          </h1>

          <p className="mt-3 text-gray-400">
            Bridge native USDC between Arc Mainnet and Ethereum Mainnet.
          </p>

          <div className="mt-6">
            <ConnectWallet />
          </div>

          <label className="mt-6 block text-sm text-gray-400">
            Route
            <select
              value={route}
              onChange={(event) =>
                setRoute(event.target.value as Direction)
              }
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-black/30 p-3 text-white"
            >
              <option value="arc-eth">
                Arc Mainnet → Ethereum Mainnet
              </option>
              <option value="eth-arc">
                Ethereum Mainnet → Arc Mainnet
              </option>
            </select>
          </label>

          <label className="mt-4 block text-sm text-gray-400">
            USDC amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl bg-black/30 p-3 text-white"
            />
          </label>

          <button
            type="button"
            onClick={() => void bridge()}
            disabled={!isConnected || busy}
            className="predarc-gradient-button mt-6 w-full disabled:opacity-50"
          >
            {busy ? "Bridge in progress..." : "Bridge USDC"}
          </button>

          {message && (
            <p className="mt-5 rounded-xl border border-orange-400/20 p-4 text-sm text-orange-100">
              {message}
            </p>
          )}

          <p className="mt-5 text-xs text-amber-200">
            Real mainnet USDC is used. Start with a very small amount.
          </p>
        </section>
      </div>
    </main>
  );
}
