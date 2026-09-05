"use client";

import BtcPriceCard from "./components/chart/BtcPriceCard";
import BtcPriceChart from "./components/chart/BtcPriceChart";

import CommunityLeaderboard from "./components/leaderboard/CommunityLeaderboard";
import Leaderboard from "./components/leaderboard/Leaderboard";

import MarketSelector from "./components/market/MarketSelector";

import ActivePredictionCard from "./components/prediction/ActivePredictionCard";
import PredictionHistory from "./components/prediction/PredictionHistory";
import PredictionPanel from "./components/prediction/PredictionPanel";

import { useBtcPrice } from "./components/providers/BtcPriceProvider";

import CountdownTimer from "./components/ui/CountdownTimer";
import DemoBalanceCard from "./components/ui/DemoBalanceCard";

import ConnectWallet from "./components/wallet/ConnectWallet";

const MARKET_NAMES = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
} as const;

export default function Home() {
  const { selectedMarket } = useBtcPrice();

  const marketName =
    MARKET_NAMES[selectedMarket];

  return (
    <main className="min-h-screen bg-[#080c12] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0b1017]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
              Built on Arc Testnet
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Prederc Forecast Arena
            </h1>
          </div>

          <ConnectWallet />
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          {/* Left side */}
          <div className="rounded-3xl border border-white/10 bg-[#0d121a] p-6 sm:p-8">
            <p className="font-semibold text-orange-400">
              Live Forecast Round
            </p>

            <h2 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Predict whether{" "}
              {selectedMarket} moves higher or
              lower.
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
              Study the live{" "}
              {marketName} market, submit an
              onchain forecast and track your
              result in real time.
            </p>

            <div className="mt-8 inline-flex rounded-full border border-orange-500 px-5 py-3 text-sm text-orange-400">
              Arc Testnet • Demo Points • No Cash
              Value
            </div>

            {/* Market Selector fills the old empty space */}
            <MarketSelector />
          </div>

          {/* Right side */}
          <aside className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
            <BtcPriceCard />

            <DemoBalanceCard />
          </aside>
        </section>

        {/* Main trading workspace */}
        <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.7fr)]">
          {/* Left: chart, unified live round, active position */}
          <div className="space-y-4">
            <BtcPriceChart />

            <CountdownTimer />

            <ActivePredictionCard />
          </div>

          {/* Right: prediction controls */}
          <aside className="space-y-4 xl:sticky xl:top-6">
            <PredictionPanel />
          </aside>
        </section>

        {/* Statistics */}
        <section className="mt-6 space-y-6">
          <Leaderboard />

          <CommunityLeaderboard />

          <PredictionHistory />
        </section>
      </div>
    </main>
  );
}