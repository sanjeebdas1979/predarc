"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";

import { useServerPredictionStats } from "../hooks/useServerPredictionStats";
import { useDemoPoints } from "../providers/DemoPointsProvider";

type LeaderboardPlayer = {
  id: string;
  name: string;
  wallet: string;
  accuracy: number;
  wins: number;
  losses: number;
  points: number;
  isCurrentUser?: boolean;
};

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function CommunityLeaderboard() {
  const { address } = useAccount();
  const { balance, predictions } = useDemoPoints();
  const serverStats =
    useServerPredictionStats();

  const localUserStats = useMemo(() => {
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
      wins,
      losses,
      accuracy,
    };
  }, [predictions]);

  const currentUserStats =
    serverStats.isAuthenticated
      ? {
          wins:
            serverStats.wins,
          losses:
            serverStats.losses,
          accuracy:
            serverStats.accuracy,
        }
      : localUserStats;

  const currentUserPoints =
    serverStats.balance ??
    balance;

  const leaderboard = useMemo(() => {
    const demoPlayers: LeaderboardPlayer[] = [
      {
        id: "demo-1",
        name: "NovaTrader",
        wallet: "0x71A2...9F4C",
        accuracy: 78.6,
        wins: 44,
        losses: 12,
        points: 5280,
      },
      {
        id: "demo-2",
        name: "ArcBull",
        wallet: "0x2BD8...A761",
        accuracy: 74.2,
        wins: 46,
        losses: 16,
        points: 4870,
      },
      {
        id: "demo-3",
        name: "SatoshiSignal",
        wallet: "0x93C4...31B8",
        accuracy: 69.8,
        wins: 37,
        losses: 16,
        points: 4310,
      },
      {
        id: "demo-4",
        name: "ChainVision",
        wallet: "0x8A11...C009",
        accuracy: 66.7,
        wins: 34,
        losses: 17,
        points: 3890,
      },
      {
        id: "demo-5",
        name: "BlockScout",
        wallet: "0x44FE...712D",
        accuracy: 61.4,
        wins: 27,
        losses: 17,
        points: 3420,
      },
      {
        id: "demo-6",
        name: "CandleHunter",
        wallet: "0xB102...6DA7",
        accuracy: 58.9,
        wins: 33,
        losses: 23,
        points: 3180,
      },
    ];

    const currentPlayer: LeaderboardPlayer = {
      id: "current-user",
      name: "You",
      wallet: address
        ? shortenAddress(address)
        : "Wallet not connected",
      accuracy: currentUserStats.accuracy,
      wins: currentUserStats.wins,
      losses: currentUserStats.losses,
      points: currentUserPoints,
      isCurrentUser: true,
    };

    return [...demoPlayers, currentPlayer].sort(
      (firstPlayer, secondPlayer) => {
        if (secondPlayer.points !== firstPlayer.points) {
          return secondPlayer.points - firstPlayer.points;
        }

        return secondPlayer.accuracy - firstPlayer.accuracy;
      }
    );
  }, [
    address,
    currentUserPoints,
    currentUserStats.accuracy,
    currentUserStats.wins,
    currentUserStats.losses,
  ]);

  function getRankIcon(rank: number): string {
    if (rank === 1) {
      return "🥇";
    }

    if (rank === 2) {
      return "🥈";
    }

    if (rank === 3) {
      return "🥉";
    }

    return `#${rank}`;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6 sm:p-8">
      <div>
        <p className="text-sm font-semibold text-orange-400">
          Community Leaderboard
        </p>

        <h2 className="mt-2 text-2xl font-bold text-white">
          Top forecasters
        </h2>

        <p className="mt-2 text-sm text-gray-400">
          Ranked by current points, with accuracy used as a
          tiebreaker.
        </p>

        <p className="mt-2 text-xs text-gray-500">
          {serverStats.isAuthenticated
            ? "Your row uses live server ledger stats."
            : serverStats.message ||
              "Your row uses local demo stats until you sign in."}
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <div className="hidden grid-cols-[70px_1.5fr_1fr_1fr_1fr] gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
          <span>Rank</span>
          <span>Forecaster</span>
          <span>Accuracy</span>
          <span>Record</span>
          <span className="text-right">Points</span>
        </div>

        <div className="divide-y divide-white/10">
          {leaderboard.map((player, index) => {
            const rank = index + 1;

            return (
              <div
                key={player.id}
                className={`grid gap-4 px-5 py-5 transition md:grid-cols-[70px_1.5fr_1fr_1fr_1fr] md:items-center ${
                  player.isCurrentUser
                    ? "bg-orange-500/10"
                    : "bg-white/[0.01] hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between md:block">
                  <span className="text-sm text-gray-500 md:hidden">
                    Rank
                  </span>

                  <span className="text-lg font-bold text-white">
                    {getRankIcon(rank)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 md:block">
                  <span className="text-sm text-gray-500 md:hidden">
                    Forecaster
                  </span>

                  <div className="text-right md:text-left">
                    <div className="flex items-center justify-end gap-2 md:justify-start">
                      <p className="font-semibold text-white">
                        {player.name}
                      </p>

                      {player.isCurrentUser && (
                        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400">
                          YOU
                        </span>
                      )}
                    </div>

                    <p className="mt-1 font-mono text-xs text-gray-500">
                      {player.wallet}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between md:block">
                  <span className="text-sm text-gray-500 md:hidden">
                    Accuracy
                  </span>

                  <p
                    className={`font-semibold ${
                      player.accuracy >= 70
                        ? "text-emerald-400"
                        : player.accuracy >= 55
                        ? "text-orange-400"
                        : "text-gray-300"
                    }`}
                  >
                    {player.accuracy.toFixed(1)}%
                  </p>
                </div>

                <div className="flex items-center justify-between md:block">
                  <span className="text-sm text-gray-500 md:hidden">
                    Record
                  </span>

                  <p className="text-sm text-gray-300">
                    <span className="text-emerald-400">
                      {player.wins}W
                    </span>
                    {" / "}
                    <span className="text-rose-400">
                      {player.losses}L
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between md:block md:text-right">
                  <span className="text-sm text-gray-500 md:hidden">
                    Points
                  </span>

                  <p className="text-lg font-bold text-white">
                    {player.points.toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs leading-5 text-gray-500">
          Demo community profiles are placeholders. Your row
          uses server ledger statistics when signed in and local
          demo data as a fallback.
        </p>
      </div>
    </section>
  );
}
