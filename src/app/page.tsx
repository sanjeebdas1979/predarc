"use client";

import Link from "next/link";

import PredarcBrand from "./components/brand/PredarcBrand";
import HeroLivePreview from "./components/home/HeroLivePreview";
import { useBtcPrice } from "./components/providers/BtcPriceProvider";

const SUPPORTED_MARKETS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
  },
  {
    symbol: "SOL",
    name: "Solana",
  },
  {
    symbol: "BNB",
    name: "BNB",
  },
  {
    symbol: "XRP",
    name: "XRP",
  },
] as const;

export default function Home() {
  const {
    setSelectedMarket,
  } = useBtcPrice();

  return (
    <main className="min-h-screen overflow-hidden bg-[#060a11] text-white">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-blue-600/10 blur-[120px]" />

        <div className="absolute right-[-10rem] top-[5rem] h-[34rem] w-[34rem] rounded-full bg-violet-600/10 blur-[120px]" />

        <div className="absolute left-1/2 top-[20rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-orange-500/[0.06] blur-[130px]" />
      </div>

      {/* Navbar */}
      <header className="relative z-20 border-b border-white/[0.07] bg-[#070c14]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0"
          >
            <PredarcBrand compact />
          </Link>

          {/* Search */}
          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-gray-500">
              <span className="text-base">
                ⌕
              </span>

              <span>
                Search markets, assets, or rounds...
              </span>

              <span className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-600">
                /
              </span>
            </div>
          </div>

          <Link href="/receipts" className="text-sm font-bold text-orange-300 hover:text-white">
            Payment receipts
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-6 xl:flex">
            <a
              href="#markets"
              className="text-sm font-semibold text-orange-400"
            >
              Trending
            </a>

            <a
              href="#markets"
              className="text-sm text-gray-400 transition hover:text-white"
            >
              Crypto
            </a>

            <span className="text-sm text-gray-600">
              Politics
            </span>

            <span className="text-sm text-gray-600">
              Sports
            </span>

            <a
              href="#markets"
              className="text-sm text-gray-400 transition hover:text-white"
            >
              New Markets
            </a>
          </nav>

          <Link
            href="/arena"
            className="ml-auto shrink-0 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_0_30px_rgba(249,115,22,0.16)] transition hover:brightness-110 sm:px-5"
          >
            Launch Arena
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid min-h-[640px] max-w-[1500px] items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(430px,0.98fr)] lg:py-18">
        {/* Hero copy */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/[0.07] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />

            Built on Arc Testnet
          </div>

          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.045em] sm:text-6xl lg:text-[4.6rem]">
            Forecast the market.
            <span className="block bg-gradient-to-r from-orange-400 via-orange-300 to-cyan-300 bg-clip-text text-transparent">
              Onchain.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Live crypto forecast rounds powered by Arc
            Testnet. Track real market movement, choose
            Higher or Lower, and follow your prediction
            through onchain resolution.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/arena"
              className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3.5 text-sm font-black text-white shadow-[0_0_35px_rgba(249,115,22,0.2)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Enter Forecast Arena →
            </Link>

            <a
              href="#markets"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-bold text-gray-200 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              Explore Markets
            </a>
          </div>

          {/* Product badges */}
          <div className="mt-9 flex flex-wrap gap-2">
            {[
              "Multi-market forecasts",
              "1m / 5m / 15m rounds",
              "Live candle sync",
              "Demo Points",
              "Onchain resolution",
            ].map(
              (item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-semibold text-gray-500"
                >
                  {item}
                </span>
              )
            )}
          </div>
        </div>

        {/* Hero live market preview */}
        <div className="relative">
          <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-orange-500/[0.08] via-transparent to-blue-500/[0.08] blur-3xl" />

          <div className="relative">
            <HeroLivePreview />
          </div>
        </div>
      </section>

      {/* Market Discovery */}
      <section
        id="markets"
        className="relative z-10 border-y border-white/[0.06] bg-[#080d14]"
      >
        <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
                Market Discovery
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Explore forecast markets
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Choose an asset and enter a live
                candle-synced Higher or Lower round
                on Arc Testnet.
              </p>
            </div>

            <Link
              href="/arena"
              className="text-sm font-bold text-gray-400 transition hover:text-white"
            >
              Open full arena →
            </Link>
          </div>

          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
            {/* Sidebar */}
            <aside className="rounded-2xl border border-white/[0.08] bg-[#0b1119]/95 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.18)] lg:sticky lg:top-24">
              <p className="px-3 pb-3 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">
                Browse
              </p>

              <div className="space-y-1">
                {[
                  ["All Markets", "5"],
                  ["1 Minute", "5"],
                  ["5 Minute", "5"],
                  ["15 Minute", "5"],
                ].map(
                  ([label, count], index) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs ${
                        index === 0
                          ? "border border-orange-500/20 bg-orange-500/[0.08] font-bold text-orange-300"
                          : "text-gray-400"
                      }`}
                    >
                      <span>
                        {label}
                      </span>

                      <span className="text-[10px] text-gray-600">
                        {count}
                      </span>
                    </div>
                  )
                )}
              </div>

              <div className="my-3 border-t border-white/[0.06]" />

              <p className="px-3 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">
                Crypto
              </p>

              <div className="space-y-1">
                {SUPPORTED_MARKETS.map(
                  (market) => (
                    <div
                      key={market.symbol}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-xs text-gray-400"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[9px] font-black text-white">
                          {market.symbol.slice(
                            0,
                            1
                          )}
                        </span>

                        {market.name}
                      </span>

                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </div>
                  )
                )}
              </div>

              <div className="my-3 border-t border-white/[0.06]" />

              <div className="rounded-xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.08] to-blue-500/[0.05] p-3">
                <p className="text-[10px] font-black text-white">
                  More markets coming
                </p>

                <p className="mt-1 text-[9px] leading-4 text-gray-500">
                  Predarc can expand beyond crypto
                  as the product grows.
                </p>
              </div>
            </aside>

            {/* Market cards */}
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {[
                  "Trending",
                  "Crypto",
                  "Quick Rounds",
                  "Standard",
                  "Extended",
                ].map(
                  (item, index) => (
                    <span
                      key={item}
                      className={`rounded-lg px-3 py-2 text-[10px] font-bold ${
                        index === 0
                          ? "bg-orange-500/10 text-orange-400"
                          : "border border-white/[0.07] bg-white/[0.02] text-gray-500"
                      }`}
                    >
                      {item}
                    </span>
                  )
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {SUPPORTED_MARKETS.map(
                  (market) => (
                    <div
                      key={market.symbol}
                      className="group rounded-2xl border border-white/[0.08] bg-[#0b1119] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.14)] transition duration-200 hover:-translate-y-1 hover:border-orange-500/30 hover:bg-[#0d141e]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-sm font-black">
                            {market.symbol.slice(
                              0,
                              1
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-black">
                              {market.symbol}
                              /USDT
                            </p>

                            <p className="mt-0.5 text-[10px] text-gray-600">
                              {market.name}
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-400">
                          LIVE
                        </span>
                      </div>

                      <h3 className="mt-4 text-base font-bold leading-6">
                        Will {market.symbol} move
                        Higher or Lower?
                      </h3>

                      <p className="mt-1 text-[10px] leading-5 text-gray-500">
                        Forecast the direction of the
                        next Binance candle on Arc
                        Testnet.
                      </p>

                      <div className="mt-4 flex gap-2">
                        <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-center">
                          <p className="text-[10px] font-black text-emerald-400">
                            ↑ HIGHER
                          </p>
                        </div>

                        <div className="flex-1 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3 py-2 text-center">
                          <p className="text-[10px] font-black text-rose-400">
                            ↓ LOWER
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-1.5">
                        {[
                          "1m",
                          "5m",
                          "15m",
                        ].map(
                          (timeframe) => (
                            <span
                              key={timeframe}
                              className="rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 text-center text-[9px] font-bold text-gray-500"
                            >
                              {timeframe}
                            </span>
                          )
                        )}
                      </div>

                      <Link
                        href={`/arena?market=${market.symbol}`}
                        onClick={() =>
                          setSelectedMarket(
                            market.symbol
                          )
                        }
                        className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[10px] font-bold text-gray-300 transition group-hover:border-orange-500/20 group-hover:text-orange-300"
                      >
                        Open live forecast

                        <span>
                          →
                        </span>
                      </Link>
                    </div>
                  )
                )}

                {/* Arc card */}
                <div className="flex min-h-[290px] flex-col justify-between rounded-2xl border border-orange-500/15 bg-gradient-to-br from-orange-500/[0.07] via-[#0b1119] to-blue-500/[0.06] p-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                      Arc Native
                    </p>

                    <h3 className="mt-3 text-xl font-black">
                      Forecast.
                      <br />
                      Resolve.
                      <br />
                      Claim.
                    </h3>

                    <p className="mt-3 text-xs leading-5 text-gray-500">
                      Predictions are submitted and
                      resolved through Predarc&apos;s
                      Arc Testnet flow.
                    </p>
                  </div>

                  <Link
                    href="/arena"
                    className="mt-5 rounded-xl bg-orange-500 px-4 py-3 text-center text-[10px] font-black text-white transition hover:bg-orange-400"
                  >
                    Enter Arena →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="relative z-10">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-gray-600 sm:px-6">
          <span>
            Predarc · Built on Arc Testnet
          </span>

          <span>
            Demo Points · No Cash Value
          </span>
        </div>
      </footer>
    </main>
  );
}