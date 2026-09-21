"use client";

import { useMemo } from "react";

import { useServerPredictionStats } from "../hooks/useServerPredictionStats";
import { useDemoPoints } from "../providers/DemoPointsProvider";

export default function Leaderboard() {
  const { balance, predictions } = useDemoPoints();
  const serverStats =
    useServerPredictionStats();

  const localStats = useMemo(() => {
    const settledPredictions = predictions.filter(
      (prediction) => prediction.status !== "pending"
    );

    const wins = settledPredictions.filter(
      (prediction) => prediction.status === "won"
    ).length;

    const losses = settledPredictions.filter(
      (prediction) => prediction.status === "lost"
    ).length;

    const accuracy =
      settledPredictions.length > 0
        ? (wins / settledPredictions.length) * 100
        : 0;

    return {
      totalPredictions: predictions.length,
      settledPredictions: settledPredictions.length,
      wins,
      losses,
      accuracy,
    };
  }, [predictions]);

  const stats =
    serverStats.isAuthenticated
      ? {
          totalPredictions:
            serverStats.totalPredictions,
          settledPredictions:
            serverStats.settledPredictions,
          wins:
            serverStats.wins,
          losses:
            serverStats.losses,
          accuracy:
            serverStats.accuracy,
        }
      : localStats;

  const displayedBalance =
    serverStats.balance ??
    balance;

  const userRank =
    stats.settledPredictions === 0
      ? "-"
      : stats.accuracy >= 70
      ? 1
      : stats.accuracy >= 55
      ? 2
      : 3;

  const rankLabel =
    userRank === 1
      ? "Gold Tier"
      : userRank === 2
      ? "Silver Tier"
      : userRank === 3
      ? "Bronze Tier"
      : "Unranked";

  const rankIcon =
    userRank === 1
      ? "🥇"
      : userRank === 2
      ? "🥈"
      : userRank === 3
      ? "🥉"
      : "🏁";

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-orange-400">
            Leaderboard
          </p>

          <h2 className="mt-2 text-2xl font-bold text-white">
            Your performance
          </h2>

          <p className="mt-2 max-w-xl text-sm text-gray-400">
            Your rank uses server ledger records when signed in,
            with local demo history as a fallback.
          </p>

          <p className="mt-2 text-xs text-gray-500">
            {serverStats.isAuthenticated
              ? "Server stats active."
              : serverStats.message ||
                "Local demo stats active."}
          </p>
        </div>

        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-center">
          <p className="text-2xl">{rankIcon}</p>

          <p className="mt-1 text-xs text-gray-400">
            Current Rank
          </p>

          <p className="mt-1 text-lg font-bold text-orange-400">
            {userRank === "-" ? "-" : `#${userRank}`}
          </p>

          <p className="text-xs font-semibold text-gray-300">
            {rankLabel}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs text-gray-500">
            Total Predictions
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {stats.totalPredictions}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
          <p className="text-xs text-emerald-300">
            Wins
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {stats.wins}
          </p>
        </div>

        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
          <p className="text-xs text-rose-300">
            Losses
          </p>

          <p className="mt-2 text-3xl font-bold text-rose-400">
            {stats.losses}
          </p>
        </div>

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5">
          <p className="text-xs text-orange-300">
            Accuracy
          </p>

          <p className="mt-2 text-3xl font-bold text-orange-400">
            {stats.accuracy.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">
              Accuracy progress
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Based on {stats.settledPredictions} settled prediction
              {stats.settledPredictions === 1 ? "" : "s"}.
            </p>
          </div>

          <p className="text-lg font-bold text-orange-400">
            {stats.accuracy.toFixed(1)}%
          </p>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-500"
            style={{
              width: `${Math.min(stats.accuracy, 100)}%`,
            }}
          />
        </div>

        <div className="mt-3 flex justify-between text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs text-gray-500">
            Current Balance
          </p>

          <p className="mt-2 text-2xl font-bold text-white">
            {displayedBalance.toLocaleString()} points
          </p>

          <p className="mt-2 text-xs text-gray-500">
            {serverStats.isAuthenticated
              ? "Your Supabase-backed server demo balance."
              : "Your local demo balance."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs text-gray-500">
            Performance Tier
          </p>

          <p className="mt-2 text-2xl font-bold text-white">
            {rankLabel}
          </p>

          <p className="mt-2 text-xs text-gray-500">
            Gold: 70%+, Silver: 55%+, Bronze: below 55%.
          </p>
        </div>
      </div>
    </section>
  );
}
