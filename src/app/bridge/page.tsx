"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { EIP1193Provider } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { arcMainnet } from "@/lib/daily";
import PredarcSessionCard from "../components/auth/PredarcSessionCard";
import { usePredarcSession } from "../components/providers/PredarcSessionProvider";

type Direction = "arc-eth" | "eth-arc" | "arc-base" | "base-arc" | "arc-arbitrum" | "arbitrum-arc" | "arc-polygon" | "polygon-arc";
type CircleChain = "Arc" | "Ethereum" | "Base" | "Arbitrum" | "Polygon";
type MessageTone = "info" | "success" | "error";

export default function BridgePage() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isSignedIn } = usePredarcSession();

  const currentNetwork =
    chainId === arcMainnet.id
      ? "Arc Mainnet"
      : chainId === mainnet.id
        ? "Ethereum Mainnet"
        : chainId === base.id
          ? "Base Mainnet"
          : chainId === arbitrum.id
            ? "Arbitrum One"
            : chainId === polygon.id
              ? "Polygon PoS"
              : chainId === 5042002
                ? "Arc Testnet"
                : "Unknown network (" + chainId + ")";

  const [route, setRoute] = useState<Direction>("arc-eth");
  const [amount, setAmount] = useState("0.01");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [busy, setBusy] = useState(false);

  const fromChain: CircleChain = route.startsWith("arc")
    ? "Arc"
    : route.startsWith("eth")
      ? "Ethereum"
      : route.startsWith("base")
        ? "Base"
        : route.startsWith("arbitrum")
          ? "Arbitrum"
          : "Polygon";

  const toChain: CircleChain = route.endsWith("arc")
    ? "Arc"
    : route.endsWith("eth")
      ? "Ethereum"
      : route.endsWith("base")
        ? "Base"
        : route.endsWith("arbitrum")
          ? "Arbitrum"
          : "Polygon";

  const chainLabel: Record<CircleChain, string> = {
    Arc: "Arc Mainnet",
    Ethereum: "Ethereum Mainnet",
    Base: "Base Mainnet",
    Arbitrum: "Arbitrum One",
    Polygon: "Polygon PoS",
  };

  const chainIdByName: Record<CircleChain, number> = {
    Arc: arcMainnet.id,
    Ethereum: mainnet.id,
    Base: base.id,
    Arbitrum: arbitrum.id,
    Polygon: polygon.id,
  };

  const fromLabel = chainLabel[fromChain];
  const toLabel = chainLabel[toChain];
  const fromId = chainIdByName[fromChain];
  async function bridge() {
    setMessage("");
    setMessageTone("info");

    if (!isSignedIn) {
      setMessage("Sign in to Predarc before starting a bridge.");
      return;
    }

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

      setMessage(
        "Step 1 of 2: Approve exactly " +
          amount +
          " USDC in MetaMask. The bridge confirmation will follow."
      );

      const provider =
        (await connector.getProvider()) as EIP1193Provider;

      const adapter =
        await createViemAdapterFromProvider({ provider });

      const kit = new AppKit();

      const result = await kit.bridge({
        from: { adapter, chain: fromChain },
        to: { adapter, chain: toChain },
        amount,
        config: {
          // Keep approval and transfer reviewable as separate wallet prompts.
          batchTransactions: false,
        },
      });

      if (result.state === "success") {
        setMessageTone("success");
        setMessage("Bridge success: " + fromLabel + " → " + toLabel + ".");
      } else if (result.state === "error") {
        setMessageTone("error");
        setMessage("Bridge failed. Please retry.");
      } else {
        setMessage(
          "Bridge submitted: " +
            fromLabel +
            " → " +
            toLabel +
            ". Confirmation is pending."
        );
      }
    } catch (error) {
      setMessageTone("error");
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
            Bridge
          </h1>

          <p className="mt-3 text-gray-400">
            Bridge native USDC between Arc Mainnet, Ethereum Mainnet, Base Mainnet, Arbitrum One and Polygon PoS.
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-gray-400">Connected wallet</p>
            <p className="mt-2 break-all font-mono text-sm">
              {address ?? "Not connected"}
            </p>

            <p className="mt-4 text-sm text-gray-400">
              Connected network
            </p>
            <p className="mt-2 font-bold text-orange-300">
              {isConnected ? currentNetwork : "Not connected"}
            </p>

            <button
              type="button"
              onClick={() => {
                if (isConnected) {
                  disconnect();
                } else if (connectors[0]) {
                  connect({ connector: connectors[0] });
                }
              }}
              className="predarc-gradient-button mt-5 w-full"
            >
              {isConnected ? "Disconnect" : "Connect wallet"}
            </button>
          </div>

          <div className="mt-4">
            <PredarcSessionCard feature="Bridge" />
          </div>

          <label className="mt-6 block text-sm text-gray-400">
            Route
            <select
              value={route}
              onChange={(event) =>
                setRoute(event.target.value as Direction)
              }
              disabled={!isSignedIn || busy}
              className="mt-2 w-full rounded-xl bg-black/30 p-3 text-white"
            >
              <option value="arc-eth">
                Arc Mainnet → Ethereum Mainnet
              </option>
              <option value="eth-arc">
                Ethereum Mainnet → Arc Mainnet
              </option>
              <option value="arc-base">
                Arc Mainnet -&gt; Base Mainnet
              </option>
              <option value="base-arc">
                Base Mainnet -&gt; Arc Mainnet
              </option>
              <option value="arc-arbitrum">
                Arc Mainnet -&gt; Arbitrum One
              </option>
              <option value="arbitrum-arc">
                Arbitrum One -&gt; Arc Mainnet
              </option>
              <option value="arc-polygon">
                Arc Mainnet -&gt; Polygon PoS
              </option>
              <option value="polygon-arc">
                Polygon PoS -&gt; Arc Mainnet
              </option>
            </select>
          </label>

          <label className="mt-4 block text-sm text-gray-400">
            USDC amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={!isSignedIn || busy}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl bg-black/30 p-3 text-white"
            />
          </label>

          <details className="group relative mt-4">
            <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1 border-b border-dashed border-sky-300/50 text-xs text-sky-200 outline-none transition hover:text-sky-100 focus-visible:ring-2 focus-visible:ring-sky-300/60 [&::-webkit-details-marker]:hidden">
              Details
            </summary>

            <div className="absolute bottom-full left-0 z-10 mb-2 hidden w-full rounded-2xl border border-sky-400/20 bg-[#101923] p-4 shadow-2xl group-hover:block group-focus-within:block group-open:block">
              <p className="font-bold text-sky-200">
                What MetaMask will ask you to do
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>
                  Approve exactly {amount || "the entered amount"} USDC for
                  Circle&apos;s bridge contract.
                </li>
                <li>Confirm the bridge transfer.</li>
              </ol>
              <p className="mt-3 text-xs leading-5 text-gray-400">
                MetaMask may label the Circle contract as an &quot;unknown
                address&quot; on Arc. Treat that as a security review: continue
                only when the approval amount matches the amount entered above.
                Predarc never asks for an unlimited approval in this flow.
              </p>
            </div>
          </details>

          <button
            type="button"
            onClick={() => void bridge()}
            disabled={!isConnected || !isSignedIn || busy}
            className="predarc-gradient-button mt-3 w-full disabled:opacity-50"
          >
            {busy
              ? "Waiting for wallet..."
              : !isSignedIn
                ? "Sign in to activate bridge"
                : "Start 2-step bridge"}
          </button>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-5 rounded-xl border p-4 text-sm ${
                messageTone === "success"
                  ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200"
                  : messageTone === "error"
                    ? "border-red-400/30 bg-red-400/[0.08] text-red-200"
                    : "border-orange-400/20 bg-orange-400/[0.06] text-orange-100"
              }`}
            >
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
