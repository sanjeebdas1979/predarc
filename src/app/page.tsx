"use client";

import Link from "next/link";

import PredarcBrand from "./components/brand/PredarcBrand";
import HeroLivePreview from "./components/home/HeroLivePreview";
import MarketLogo from "./components/market/MarketLogo";
import { useBtcPrice } from "./components/providers/BtcPriceProvider";

const SUPPORTED_MARKETS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "BNB", name: "BNB" },
  { symbol: "XRP", name: "XRP" },
] as const;

const NAV_ITEMS = [
  { href: "/arena", label: "Arena" },
  { href: "/markets", label: "Community Markets" },
  { href: "/bridge", label: "Bridge" },
  { href: "/swap", label: "Swap" },
  { href: "/agents", label: "AI Agents" },
  { href: "/receipts", label: "Receipts" },
] as const;

const PRODUCT_LINKS = [
  {
    href: "/markets",
    icon: "◎",
    eyebrow: "Community",
    title: "Create a market",
    description:
      "Open a signed crypto forecast market with a clear duration and target.",
    accent:
      "border-orange-400/20 bg-orange-400/[0.06] text-orange-200",
    iconAccent:
      "border-orange-400/25 bg-orange-400/10 text-orange-300",
  },
  {
    href: "/bridge",
    icon: "↔",
    eyebrow: "Native USDC",
    title: "Bridge across chains",
    description:
      "Move native USDC between Arc, Ethereum, Base, Arbitrum and Polygon.",
    accent:
      "border-blue-400/20 bg-blue-400/[0.06] text-blue-200",
    iconAccent:
      "border-blue-400/25 bg-blue-400/10 text-blue-300",
  },
  {
    href: "/swap",
    icon: "⇄",
    eyebrow: "Arc Mainnet",
    title: "Swap live assets",
    description:
      "Review live routes for USDC, EURC and cirBTC before confirming in your wallet.",
    accent:
      "border-violet-400/20 bg-violet-400/[0.06] text-violet-200",
    iconAccent:
      "border-violet-400/25 bg-violet-400/10 text-violet-300",
  },
  {
    href: "/receipts",
    icon: "✓",
    eyebrow: "Verification",
    title: "Check a receipt",
    description:
      "Inspect supported Arc transfers with clear transaction details.",
    accent:
      "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200",
    iconAccent:
      "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  },
  {
    href: "/agents",
    icon: "✦",
    eyebrow: "Optional automation",
    title: "Connect your AI agent",
    description:
      "Authorize bounded server-points predictions with strict limits, expiry and instant revoke controls.",
    accent:
      "border-fuchsia-400/20 bg-fuchsia-400/[0.06] text-fuchsia-200",
    iconAccent:
      "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300",
  },
] as const;

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Track the market",
    description:
      "Predarc follows live crypto prices and candle data so every round begins from a visible market reference.",
    meta: "Live candle sync",
    accent: "text-blue-300",
    dot: "bg-blue-400",
  },
  {
    number: "02",
    title: "Choose a direction",
    description:
      "Select Higher or Lower, review the round details and confirm the prediction from your connected wallet.",
    meta: "Wallet confirmation",
    accent: "text-orange-300",
    dot: "bg-orange-400",
  },
  {
    number: "03",
    title: "Follow the result",
    description:
      "The completed round is evaluated against finalized candle data and shown with a clear outcome in Predarc.",
    meta: "Finalized price data",
    accent: "text-emerald-300",
    dot: "bg-emerald-400",
  },
] as const;

export default function Home() {
  const { setSelectedMarket } = useBtcPrice();

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b12] text-[#f4f7ff] selection:bg-orange-500/30">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-14rem] top-[-12rem] h-[38rem] w-[38rem] rounded-full bg-blue-600/[0.09] blur-[130px]" />
        <div className="absolute right-[-12rem] top-[3rem] h-[34rem] w-[34rem] rounded-full bg-orange-500/[0.09] blur-[120px]" />
        <div className="absolute left-1/2 top-[42rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-violet-600/[0.055] blur-[140px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080d16]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-[76px] max-w-[1500px] items-center gap-5 px-4 sm:px-6">
          <div className="shrink-0">
            <PredarcBrand compact />
          </div>

          <nav
            aria-label="Primary navigation"
            className="mx-auto hidden items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] p-1.5 lg:flex"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-xs font-bold text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/arena"
            className="ml-auto shrink-0 rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-[3px_3px_0_0_rgba(0,0,0,0.85)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_10px_30px_rgba(168,85,247,0.24)]"
          >
            Launch Arena
          </Link>
        </div>

        <nav
          aria-label="Mobile navigation"
          className="flex gap-2 overflow-x-auto border-t border-white/[0.06] px-4 py-2.5 lg:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-bold text-gray-400 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="relative z-10 border-b border-white/[0.06] bg-[#0a101b]/90">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 overflow-x-auto px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-gray-500 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 text-gray-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            Arc Mainnet
          </span>
          <span className="shrink-0">Live market data</span>
          <span className="shrink-0">Native USDC bridge</span>
          <span className="shrink-0">USDC · EURC · cirBTC swaps</span>
          <span className="shrink-0">Community-created markets</span>
          <span className="shrink-0">Wallet-authorized AI agents</span>
        </div>
      </div>

      <section className="relative z-10 mx-auto grid min-h-[680px] max-w-[1500px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(460px,1.05fr)] lg:py-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200 shadow-[0_0_28px_rgba(59,130,246,0.08)]">
            <span className="text-orange-400">✦</span>
            Built for Arc Mainnet
          </div>

          <h1 className="mt-7 max-w-4xl text-5xl font-black uppercase leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-[4.85rem]">
            Forecast
            <span className="block">the market.</span>
            <span className="mt-2 block text-[#ff6630] underline decoration-[#ff6630] decoration-[5px] underline-offset-[10px]">
              Onchain.
            </span>
          </h1>

          <p className="mt-8 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Follow live crypto markets, choose Higher or Lower and confirm your
            prediction on Arc Mainnet. Bridge native USDC, swap supported assets
            and create community markets from one connected experience.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/arena"
              className="inline-flex items-center gap-2 rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-7 py-3.5 text-xs font-black uppercase tracking-[0.09em] text-white shadow-[3px_3px_0_0_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_12px_32px_rgba(168,85,247,0.24)]"
            >
              Enter Forecast Arena
              <span aria-hidden="true">→</span>
            </Link>

            <Link
              href="/markets"
              className="rounded-full border border-white/10 bg-[#111826] px-7 py-3.5 text-xs font-black uppercase tracking-[0.09em] text-gray-100 shadow-[3px_3px_0_0_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#172032]"
            >
              Create a Market
            </Link>

            <Link
              href="/bridge"
              className="rounded-full px-4 py-3.5 text-xs font-black uppercase tracking-[0.09em] text-blue-300 transition hover:text-white"
            >
              Bridge USDC
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-2">
            {[
              "5 crypto markets",
              "1m / 5m / 15m rounds",
              "Live candle sync",
              "Persistent wallet sign-in",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_45%)] blur-2xl" />
          <div className="relative rounded-[2.2rem] border border-white/[0.08] bg-[#0a101a]/55 p-2 shadow-[5px_5px_0_0_rgba(255,255,255,0.12)]">
            <HeroLivePreview />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1500px] px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              One connected product
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              More than a forecast screen
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-gray-500">
            Move between Predarc&apos;s live Arc Mainnet tools without leaving the
            product flow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PRODUCT_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-[1.6rem] border p-5 shadow-[3px_3px_0_0_rgba(255,255,255,0.1)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(0,0,0,0.32)] ${item.accent}`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-xl font-black ${item.iconAccent}`}
              >
                {item.icon}
              </div>
              <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] opacity-70">
                {item.eyebrow}
              </p>
              <h3 className="mt-1 text-lg font-black text-white">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-gray-400">
                {item.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/80 transition group-hover:gap-3">
                Open <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="markets"
        className="relative z-10 border-y border-white/[0.07] bg-[#0a101a]/92"
      >
        <div className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                Market Discovery
              </div>
              <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.035em] sm:text-4xl">
                Explore forecast markets
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                Pick an asset and open its live candle-synced Higher or Lower
                rounds on Arc Mainnet.
              </p>
            </div>

            <Link
              href="/arena"
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-orange-300 transition hover:text-white"
            >
              Open full arena <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="rounded-[1.6rem] border border-white/[0.08] bg-[#0d1420] p-4 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)] lg:sticky lg:top-28">
              <p className="px-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">
                Browse rounds
              </p>

              <div className="mt-3 space-y-1.5">
                {[
                  ["All Markets", "5"],
                  ["1 Minute", "5"],
                  ["5 Minute", "5"],
                  ["15 Minute", "5"],
                ].map(([label, count], index) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs ${
                      index === 0
                        ? "border border-orange-400/20 bg-orange-400/[0.08] font-bold text-orange-200"
                        : "text-gray-400"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="font-mono text-[10px] text-gray-600">
                      {count}
                    </span>
                  </div>
                ))}
              </div>

              <div className="my-4 border-t border-white/[0.06]" />

              <p className="px-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">
                Live pairs
              </p>
              <div className="mt-3 space-y-1.5">
                {SUPPORTED_MARKETS.map((market) => (
                  <div
                    key={market.symbol}
                    className="flex items-center justify-between rounded-xl px-2 py-2 text-xs text-gray-400"
                  >
                    <span className="flex items-center gap-2.5">
                      <MarketLogo
                        market={market.symbol}
                        className="h-7 w-7 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5"
                      />
                      {market.name}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-400/[0.055] p-4">
                <p className="text-[10px] font-black text-blue-100">
                  Community Markets
                </p>
                <p className="mt-1.5 text-[9px] leading-4 text-gray-500">
                  Signed-in users can create a market with a gas-free signature.
                </p>
                <Link
                  href="/markets"
                  className="mt-3 inline-flex text-[9px] font-black uppercase tracking-[0.1em] text-blue-300 hover:text-white"
                >
                  Create one →
                </Link>
              </div>
            </aside>

            <div>
              <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                {[
                  "Trending",
                  "Crypto",
                  "Quick Rounds",
                  "Standard",
                  "Extended",
                ].map((item, index) => (
                  <span
                    key={item}
                    className={`shrink-0 rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-[0.08em] ${
                      index === 0
                        ? "border border-orange-300/30 bg-[#f05a21] text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.8)]"
                        : "border border-white/[0.08] bg-white/[0.025] text-gray-500"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {SUPPORTED_MARKETS.map((market) => (
                  <article
                    key={market.symbol}
                    className="group rounded-[1.6rem] border border-white/[0.08] bg-[#0d1420] p-5 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)] transition duration-200 hover:-translate-y-1 hover:border-orange-400/25 hover:bg-[#101927] hover:shadow-[0_22px_55px_rgba(0,0,0,0.32)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <MarketLogo
                          market={market.symbol}
                          className="h-10 w-10 rounded-xl border border-white/10 bg-white/[0.035] p-2"
                        />
                        <div>
                          <p className="text-sm font-black">
                            {market.symbol}/USDT
                          </p>
                          <p className="mt-0.5 text-[9px] text-gray-600">
                            {market.name}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        Live
                      </span>
                    </div>

                    <h3 className="mt-5 text-base font-black leading-6">
                      Will {market.symbol} move Higher or Lower?
                    </h3>
                    <p className="mt-2 text-[10px] leading-5 text-gray-500">
                      Forecast the direction of the next supported Binance candle
                      on Arc Mainnet.
                    </p>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-center text-[10px] font-black text-emerald-300 transition group-hover:bg-emerald-400/[0.09]">
                        ↑ HIGHER
                      </div>
                      <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.06] px-3 py-2.5 text-center text-[10px] font-black text-orange-300 transition group-hover:bg-orange-400/[0.09]">
                        ↓ LOWER
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-1.5">
                      {["1m", "5m", "15m"].map((timeframe) => (
                        <span
                          key={timeframe}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 text-center text-[9px] font-bold text-gray-500"
                        >
                          {timeframe}
                        </span>
                      ))}
                    </div>

                    <Link
                      href={`/arena?market=${market.symbol}`}
                      onClick={() => setSelectedMarket(market.symbol)}
                      className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-gray-300 transition group-hover:border-orange-400/20 group-hover:text-orange-200"
                    >
                      Open live forecast <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}

                <article className="flex min-h-[300px] flex-col justify-between rounded-[1.6rem] border border-orange-400/20 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_42%),linear-gradient(145deg,#111a2b,#0d1420)] p-6 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)]">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-300">
                      Arc Mainnet Suite
                    </p>
                    <h3 className="mt-4 text-2xl font-black uppercase leading-[1.05] tracking-[-0.03em]">
                      Forecast.
                      <br />
                      Confirm.
                      <br />
                      Resolve.
                    </h3>
                    <p className="mt-4 text-xs leading-5 text-gray-500">
                      Move from live market data to a wallet-confirmed prediction
                      through one focused flow.
                    </p>
                  </div>
                  <Link
                    href="/arena"
                    className="mt-6 rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.85)] transition hover:brightness-110"
                  >
                    Enter Arena →
                  </Link>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              Clear by design
            </p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.035em] sm:text-4xl">
              How Predarc works
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-6 text-gray-500">
            Real market context, an explicit wallet action and a visible
            result—without hiding the important steps.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <article
              key={item.number}
              className="group rounded-[1.8rem] border border-white/[0.08] bg-[#0d1420] p-7 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)] transition duration-200 hover:-translate-y-1 hover:border-white/[0.14]"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-mono text-4xl font-black opacity-55 ${item.accent}`}
                >
                  {item.number}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
              </div>
              <h3 className="mt-8 text-xl font-black">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                {item.description}
              </p>
              <div className="mt-7 flex items-center gap-2 border-t border-white/[0.06] pt-4 text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">
                <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                {item.meta}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-blue-300/15 bg-[#0c1a3a] p-8 shadow-[5px_5px_0_0_rgba(255,255,255,0.13)] sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-14">
          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-orange-500/25 blur-[90px]" />
          <div className="pointer-events-none absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-blue-500/20 blur-[100px]" />

          <div className="relative max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">
              Built around Arc Mainnet
            </p>
            <h2 className="mt-4 text-3xl font-black uppercase leading-tight tracking-[-0.04em] sm:text-4xl lg:text-5xl">
              Bridge. Swap. Forecast.
              <span className="block text-orange-300">
                Create what comes next.
              </span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100/65 sm:text-base">
              Explore Predarc&apos;s connected tools and experience the latest
              community market flow on Arc Mainnet.
            </p>
          </div>

          <div className="relative mt-8 flex shrink-0 flex-wrap gap-3 lg:mt-0 lg:flex-col">
            <Link
              href="/arena"
              className="rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-7 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_0_rgba(0,0,0,0.85)] transition hover:brightness-110"
            >
              Launch Arena
            </Link>
            <Link
              href="/markets"
              className="rounded-full border border-white/15 bg-[#111d35] px-7 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#172747]"
            >
              Community Markets
            </Link>
            <Link
              href="/agents"
              className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/[0.08] px-7 py-3.5 text-center text-xs font-black uppercase tracking-[0.1em] text-fuchsia-100 transition hover:bg-fuchsia-400/[0.14]"
            >
              Connect AI Agent
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07] bg-[#080d15]">
        <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <PredarcBrand compact />
              <p className="mt-2 text-[10px] text-gray-600">
                Crypto forecasting and native stablecoin tools on Arc Mainnet.
              </p>
            </div>

            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-5 gap-y-3 text-[10px] font-bold text-gray-500"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-[9px] uppercase tracking-[0.1em] text-gray-700">
            <span>Predarc · Built on Arc</span>
            <span>Demo Points · No Cash Value</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
