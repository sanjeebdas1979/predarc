"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import type { EIP1193Provider } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { arcMainnet } from "@/lib/daily";
import PredarcSessionCard from "../components/auth/PredarcSessionCard";
import { usePredarcSession } from "../components/providers/PredarcSessionProvider";
import { usePredarcNetwork } from "../components/providers/PredarcNetworkProvider";
import WalletConnectOptions from "../components/wallet/WalletConnectOptions";
import { withBaseBuilderAttribution } from "@/lib/base-builder-code";
import {
  CIRCLE_BRIDGE_CHAIN_LABELS,
  getBridgeRouteLabel,
  getDefaultBridgeRoute,
  getOrderedBridgeRoutes,
  getPredarcBridgeRoute,
  PREDARC_BRIDGE_ROUTES,
  type CircleBridgeChain,
  type PredarcBridgeRouteKey,
} from "@/lib/predarc-bridge-routes";

type MessageTone = "info" | "success" | "error";

export default function BridgePage() {
  const { selectedChainId } = usePredarcNetwork();
  return <BridgePageContent key={selectedChainId} />;
}

function BridgePageContent() {
  const { network } = usePredarcNetwork();
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
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
            : chainId === optimism.id
              ? "OP Mainnet"
              : chainId === polygon.id
                ? "Polygon PoS"
                : chainId === avalanche.id
                  ? "Avalanche"
                  : chainId === 5042002
                    ? "Arc Testnet"
                    : "Unknown network (" + chainId + ")";

  const [routeKey, setRouteKey] = useState<PredarcBridgeRouteKey>(
    getDefaultBridgeRoute(network.key)
  );
  const [amount, setAmount] = useState("0.01");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [busy, setBusy] = useState(false);

  const route =
    getPredarcBridgeRoute(routeKey) ?? PREDARC_BRIDGE_ROUTES[0];
  const fromChain: CircleBridgeChain = route.from;
  const toChain: CircleBridgeChain = route.to;

  const chainIdByName: Record<CircleBridgeChain, number> = {
    Arc: arcMainnet.id,
    Ethereum: mainnet.id,
    Base: base.id,
    Arbitrum: arbitrum.id,
    Optimism: optimism.id,
    Polygon: polygon.id,
    Avalanche: avalanche.id,
  };

  const fromLabel = CIRCLE_BRIDGE_CHAIN_LABELS[fromChain];
  const toLabel = CIRCLE_BRIDGE_CHAIN_LABELS[toChain];
  const fromId = chainIdByName[fromChain];
  const orderedRoutes = getOrderedBridgeRoutes(network.key);
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
          " USDC in your connected wallet. The bridge confirmation will follow."
      );

      const provider =
        (await connector.getProvider()) as EIP1193Provider;

      const attributedProvider = withBaseBuilderAttribution(
        provider,
        fromId
      );

      const adapter =
        await createViemAdapterFromProvider({
          provider: attributedProvider,
        });

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
            Mainnet Tools
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Bridge
          </h1>

          <p className="mt-3 text-gray-400">
            Bridge USDC between Arc Mainnet, Base Mainnet, Ethereum Mainnet,
            Arbitrum One, OP Mainnet, Polygon PoS and Avalanche.
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

            {isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                className="predarc-gradient-button mt-5 w-full"
              >
                Disconnect
              </button>
            ) : (
              <WalletConnectOptions className="mt-5" />
            )}
          </div>

          <div className="mt-4">
            <PredarcSessionCard feature="Bridge" />
          </div>

          <label className="mt-6 block text-sm text-gray-400">
            Route
            <select
              value={routeKey}
              onChange={(event) =>
                setRouteKey(event.target.value as PredarcBridgeRouteKey)
              }
              disabled={!isSignedIn || busy}
              className="mt-2 w-full rounded-xl bg-black/30 p-3 text-white"
            >
              {orderedRoutes.map((bridgeRoute) => (
                <option key={bridgeRoute.key} value={bridgeRoute.key}>
                  {getBridgeRouteLabel(bridgeRoute)}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-2 text-xs text-gray-500">
            Popular routes from the active Predarc network are listed first.
          </p>

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
                What your wallet will ask you to do
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-300">
                <li>
                  Approve exactly {amount || "the entered amount"} USDC for
                  Circle&apos;s bridge contract.
                </li>
                <li>Confirm the bridge transfer.</li>
              </ol>
              <p className="mt-3 text-xs leading-5 text-gray-400">
                Your wallet may label the Circle contract as an &quot;unknown
                address&quot; on the source network. Treat that as a security review: continue
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
