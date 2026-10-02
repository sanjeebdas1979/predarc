"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePredarcSession } from "../providers/PredarcSessionProvider";

const SERVER_BALANCE_EVENT =
  "predarc:server-balance";

type ServerPrediction = {
  status: string;
  points: number;
  claimed: boolean;
};

type ServerStats = {
  isLoading: boolean;
  isAuthenticated: boolean;
  message: string;
  balance: number | null;
  totalPredictions: number;
  settledPredictions: number;
  wins: number;
  losses: number;
  accuracy: number;
  unclaimedRewards: number;
  refresh: () => Promise<void>;
};

function parseBalance(
  value: unknown
): number | null {
  if (
    typeof value !== "string" ||
    !/^-?(0|[1-9][0-9]*)$/.test(
      value
    )
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isSafeInteger(
    parsed
  )
    ? parsed
    : null;
}

function parsePrediction(
  value: unknown
): ServerPrediction | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !(
      "status" in value
    ) ||
    !(
      "points" in value
    )
) {
    return null;
  }

  const points =
    Number(value.points);

  if (
    typeof value.status !==
      "string" ||
    !Number.isFinite(points)
  ) {
    return null;
  }

  return {
    status:
      value.status,
    points,
    claimed:
      "claimed" in value &&
      value.claimed === true,
  };
}

export function useServerPredictionStats(): ServerStats {
  const {
    accountBalance,
    isAuthenticated: hasSession,
  } = usePredarcSession();

  const balance =
    parseBalance(accountBalance);

  const isAuthenticated =
    hasSession && balance !== null;

  const [
    predictions,
    setPredictions,
  ] =
    useState<
      ServerPrediction[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const hasServerSnapshotRef = useRef(false);
  const refreshRequestRef = useRef(0);

  const refresh =
    useCallback(
      async () => {
        const requestId = ++refreshRequestRef.current;

        if (!isAuthenticated) {
          hasServerSnapshotRef.current = false;
          setPredictions([]);
          setIsLoading(false);
          setMessage("Sign in to load server stats.");
          return;
        }

        setIsLoading(true);

        try {
          const predictionsResponse =
            await fetch("/api/predictions", {
              cache: "no-store",
              credentials: "include",
            });

          const predictionsResult =
            await predictionsResponse.json();

          if (
            !predictionsResponse.ok
          ) {
            throw new Error(
              typeof predictionsResult?.error ===
                "string"
                ? predictionsResult.error
                : "Server prediction stats unavailable."
            );
          }

          const rows =
            Array.isArray(
              predictionsResult
                ?.predictions
            )
              ? predictionsResult.predictions
              : [];

          const parsedPredictions =
            rows.flatMap(
              (row: unknown) => {
                const parsed = parsePrediction(row);
                return parsed ? [parsed] : [];
              }
            );

          if (requestId !== refreshRequestRef.current) {
            return;
          }

          if (
            parsedPredictions.length > 0 ||
            !hasServerSnapshotRef.current
          ) {
            setPredictions(parsedPredictions);
          }

          hasServerSnapshotRef.current = true;
          setMessage(
            "Server stats synced."
          );
        } catch (error) {
          if (requestId !== refreshRequestRef.current) {
            return;
          }

          setMessage(
            error instanceof Error
              ? error.message
              : "Server stats unavailable."
          );
        } finally {
          if (requestId === refreshRequestRef.current) {
            setIsLoading(false);
          }
        }
      },
      [isAuthenticated]
    );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    function refreshServerStats() {
      void refresh();
    }

    window.addEventListener(
      SERVER_BALANCE_EVENT,
      refreshServerStats
    );

    window.addEventListener(
      "focus",
      refreshServerStats
    );

    return () => {
      window.removeEventListener(
        SERVER_BALANCE_EVENT,
        refreshServerStats
      );

      window.removeEventListener(
        "focus",
        refreshServerStats
      );
    };
  }, [refresh]);

  const stats =
    useMemo(
      () => {
        const settled =
          predictions.filter(
            (
              prediction
            ) =>
              prediction.status !==
              "pending"
          );

        const wins =
          settled.filter(
            (
              prediction
            ) =>
              prediction.status ===
              "won"
          ).length;

        const losses =
          settled.filter(
            (
              prediction
            ) =>
              prediction.status ===
              "lost"
          ).length;

        const accuracy =
          settled.length > 0
            ? (wins /
                settled.length) *
              100
            : 0;

        const unclaimedRewards =
          predictions.reduce(
            (
              total,
              prediction
            ) => {
              if (
                prediction.status !==
                  "won" ||
                prediction.claimed
              ) {
                return total;
              }

              return (
                total +
                prediction.points * 2
              );
            },
            0
          );

        return {
          totalPredictions:
            predictions.length,
          settledPredictions:
            settled.length,
          wins,
          losses,
          accuracy,
          unclaimedRewards,
        };
      },
      [predictions]
    );

  return {
    isLoading,
    isAuthenticated,
    message,
    balance,
    ...stats,
    refresh,
  };
}

