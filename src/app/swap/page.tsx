"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";
import { arcMainnet } from "@/lib/daily";

type TokenKey = "USDC" | "EURC" | "cirBTC";

const tokens: Record<
  TokenKey,
  {
    name: string;
    color: string;
  }
> = {
  USDC: {
    name: "USD Coin",
    color: "bg-blue-500",
  },
  EURC: {
    name: "Euro Coin",
    color: "bg-emerald-500",
  },
  cirBTC: {
    name: "Circle Bitcoin",
    color: "bg-orange-500",
  },
};

type QuoteState = {
  amount: string;
  fromToken: TokenKey;
  toToken: TokenKey;
  slippage: string;
  estimatedOutput: string;
  gasFee: string;
};

function TokenIcon({ token }: { token: TokenKey }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white ${tokens[token].color}`}
    >
      {token === "USDC" ? "$" : token === "EURC" ? "E" : "B"}
    </span>
  );
}

function TokenInput({
  label,
  token,
  amount,
  readOnly,
  onAmountChange,
  onTokenChange,
}: {
  label: string;
  token: TokenKey;
  amount: string;
  readOnly?: boolean;
  onAmountChange?: (value: string) => void;
  onTokenChange?: (value: TokenKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#080d14] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <span className="text-xs text-gray-600">Balance --</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          value={amount}
          readOnly={readOnly}
          onChange={(event) => onAmountChange?.(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder:text-gray-700"
        />

        <select
          value={token}
          onChange={(event) =>
            onTokenChange?.(event.target.value as TokenKey)
          }
          className="rounded-xl border border-white/10 bg-[#151d29] px-3 py-2 text-sm font-bold text-white outline-none"
        >
          <option value="USDC">USDC</option>
          <option value="EURC">EURC</option>
          <option value="cirBTC">cirBTC</option>
        </select>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <TokenIcon token={token} />
        <span>{tokens[token].name}</span>
      </div>
    </div>
  );
}

export default function SwapPage() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const [fromToken, setFromToken] = useState<TokenKey>("USDC");
  const [toToken, setToToken] = useState<TokenKey>("EURC");
  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const onArcMainnet = chainId === arcMainnet.id;
  const validAmount =
    Number.isFinite(Number(amount)) && Number(amount) > 0;

  function connectWallet() {
    if (connectors[0]) {
      connect({ connector: connectors[0] });
    }
  }

  function clearQuote() {
    setQuote(null);
    setStatus("");
  }

  function reverseTokens() {
    setFromToken(toToken);
    setToToken(fromToken);
    clearQuote();
  }

  async function handleSwap() {
    setStatus("");

    if (!isConnected) {
      connectWallet();
      return;
    }

    if (!onArcMainnet) {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: arcMainnet.id });
        setStatus("Wallet switched to Arc Mainnet.");
      }
      return;
    }

    if (!validAmount) {
      setStatus("Enter a valid amount first.");
      return;
    }

    if (fromToken === toToken) {
      setStatus("Choose two different tokens.");
      return;
    }

    if (slippage === "custom") {
      setStatus("Choose a fixed slippage option first.");
      return;
    }

    setBusy(true);

    try {
      const browserProvider = (
        window as Window & {
          ethereum?: EIP1193Provider;
        }
      ).ethereum;

      const provider = connector
        ? ((await connector.getProvider()) as EIP1193Provider)
        : browserProvider;

      if (!provider) {
        throw new Error("No connected wallet provider found.");
      }

      const adapter = await createViemAdapterFromProvider({
        provider,
      });

      const kit = new AppKit();

      const params = {
        from: {
          adapter,
          chain: "Arc" as const,
        },
        tokenIn: fromToken,
        tokenOut: toToken,
        amountIn: amount,
        config: {
          slippageBps: Math.round(Number(slippage) * 100),
        },
      };

      const quoteMatches =
        quote &&
        quote.amount === amount &&
        quote.fromToken === fromToken &&
        quote.toToken === toToken &&
        quote.slippage === slippage;

      if (!quoteMatches) {
        const estimate = (await kit.estimateSwap(params)) as {
          estimatedOutput?: string | { amount?: string };
          fees?: Array<{
            amount?: string;
            type?: string;
          }>;
        };

        const estimatedOutput =
          typeof estimate.estimatedOutput === "string"
            ? estimate.estimatedOutput
            : estimate.estimatedOutput?.amount ?? "--";

        const gasFee =
          estimate.fees?.find((fee) => fee.type === "gas")?.amount ?? "--";

        setQuote({
          amount,
          fromToken,
          toToken,
          slippage,
          estimatedOutput,
          gasFee,
        });

        setStatus("Quote ready. Review the details, then execute the swap.");
        return;
      }

      const result = (await kit.swap(params)) as {
        txHash?: string;
        explorerUrl?: string;
      };

      setQuote(null);

      const receiptLink = result.explorerUrl ?? result.txHash;

      setStatus(
        receiptLink
          ? "Swap submitted: " + receiptLink
          : "Swap submitted. Confirm it in your wallet."
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Swap failed. Please retry."
      );
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = !isConnected
    ? "Connect wallet"
    : !onArcMainnet
      ? isSwitching
        ? "Switching network..."
        : "Switch to Arc Mainnet"
      : quote
        ? "Execute swap"
        : "Get live quote";

  return (
    <main className="min-h-screen bg-[#060a11] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
          <Link href="/" className="text-lg font-black tracking-tight">
            <span className="text-orange-400">Pred</span>arc
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <Link href="/arena" className="transition hover:text-white">
              Forecast Arena
            </Link>
            <Link href="/bridge" className="transition hover:text-white">
              Bridge
            </Link>
            <Link href="/swap" className="text-white">
              Swap
            </Link>

            {isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold transition hover:border-white/25"
              >
                {address
                  ? `${address.slice(0, 6)}...${address.slice(-4)}`
                  : "Disconnect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                className="predarc-gradient-button px-4 py-2 text-xs"
              >
                Connect wallet
              </button>
            )}
          </nav>
        </header>

        <div className="mx-auto max-w-2xl py-12">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.08] px-3 py-1.5 text-xs font-bold text-orange-300">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              {onArcMainnet ? "Arc Mainnet" : "Arc Mainnet required"}
            </div>

            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Arc DEX Swap
            </h1>

            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-gray-500">
              Swap supported tokens on Arc Mainnet with a live quote,
              slippage controls and wallet confirmation.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-2xl border border-white/[0.08] bg-[#0d121a] p-1">
            <button
              type="button"
              className="rounded-xl bg-white/[0.08] px-4 py-3 text-sm font-bold text-white"
            >
              Token Swap
            </button>

            <button
              type="button"
              disabled
              className="rounded-xl px-4 py-3 text-sm font-bold text-gray-600"
            >
              Liquidity Pools
            </button>
          </div>

          <section className="rounded-3xl border border-white/[0.09] bg-[#0d121a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Swap tokens</p>
                <p className="mt-1 text-xs text-gray-500">
                  Powered by Arc Mainnet liquidity
                </p>
              </div>

              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                Live network
              </span>
            </div>

            <TokenInput
              label="You pay"
              token={fromToken}
              amount={amount}
              onAmountChange={(value) => {
                setAmount(value);
                clearQuote();
              }}
              onTokenChange={(value) => {
                setFromToken(value);
                clearQuote();
              }}
            />

            <div className="relative z-10 -my-3 flex justify-center">
              <button
                type="button"
                onClick={reverseTokens}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#182231] text-lg text-orange-300 transition hover:border-orange-400/40 hover:text-white"
                aria-label="Reverse tokens"
              >
                ↕
              </button>
            </div>

            <TokenInput
              label="You receive"
              token={toToken}
              amount="--"
              readOnly
              onTokenChange={(value) => {
                setToToken(value);
                clearQuote();
              }}
            />

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">
                  Slippage tolerance
                </span>
                <span className="text-xs font-bold text-orange-300">
                  {slippage}%
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {["0.1", "0.5", "1", "2.5"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setSlippage(option);
                      clearQuote();
                    }}
                    className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                      slippage === option
                        ? "border-orange-400/50 bg-orange-400/[0.12] text-orange-200"
                        : "border-white/[0.08] bg-black/20 text-gray-500 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {option}%
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setSlippage("custom");
                    clearQuote();
                  }}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                    slippage === "custom"
                      ? "border-orange-400/50 bg-orange-400/[0.12] text-orange-200"
                      : "border-white/[0.08] bg-black/20 text-gray-500 hover:border-white/20 hover:text-white"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Estimated swap rate</span>
                <span className="font-semibold text-gray-300">
                  {quote
                    ? "1 " +
                      fromToken +
                      " ~= " +
                      quote.estimatedOutput +
                      " " +
                      toToken
                    : "--"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500">Minimum received</span>
                <span className="font-semibold text-gray-300">
                  {quote ? quote.estimatedOutput + " " + toToken : "--"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500">Price impact</span>
                <span className="font-semibold text-gray-300">--</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500">Network gas fee</span>
                <span className="font-semibold text-gray-300">
                  {quote ? quote.gasFee + " USDC" : "-- USDC"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSwap()}
              disabled={busy}
              className="predarc-gradient-button mt-6 w-full py-3.5 text-sm disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Processing..." : buttonLabel}
            </button>

            {status && (
              <p className="mt-4 break-words rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-4 text-sm leading-6 text-orange-100">
                {status}
              </p>
            )}

            <p className="mt-5 text-center text-xs leading-5 text-gray-600">
              Always review the token, amount, route and slippage before
              signing.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
