"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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
    ) ||
    !(
      "claimed" in value
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
      value.claimed === true,
  };
}

export function useServerPredictionStats(): ServerStats {
  const [
    balance,
    setBalance,
  ] =
    useState<
      number | null
    >(null);

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
    isAuthenticated,
    setIsAuthenticated,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const refresh =
    useCallback(
      async () => {
        setIsLoading(true);

        try {
          const [
            accountResponse,
            predictionsResponse,
          ] = await Promise.all([
            fetch("/api/account", {
              method: "POST",
              credentials: "include",
            }),
            fetch("/api/predictions", {
              cache:
                "no-store",
              credentials: "include",
            }),
          ]);

          const [
            accountResult,
            predictionsResult,
          ] = await Promise.all([
            accountResponse.json(),
            predictionsResponse.json(),
          ]);

          if (
            !accountResponse.ok
          ) {
            throw new Error(
              typeof accountResult?.error ===
                "string"
                ? accountResult.error
                : "Server balance unavailable."
            );
          }

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

          const parsedBalance =
            parseBalance(
              accountResult?.balance
            );

          if (
            accountResult?.authenticated !==
              true ||
            parsedBalance === null
          ) {
            throw new Error(
              "Sign in to load server stats."
            );
          }

          const rows =
            Array.isArray(
              predictionsResult
                ?.predictions
            )
              ? predictionsResult.predictions
              : [];

          setBalance(
            parsedBalance
          );
          setPredictions(
            rows.flatMap(
              (
                row: unknown
              ) => {
                const parsed =
                  parsePrediction(
                    row
                  );

                return parsed
                  ? [parsed]
                  : [];
              }
            )
          );
          setIsAuthenticated(
            true
          );
          setMessage(
            "Server stats synced."
          );
        } catch (error) {
          setIsAuthenticated(
            false
          );
          setMessage(
            error instanceof Error
              ? error.message
              : "Server stats unavailable."
          );
        } finally {
          setIsLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    void refresh();
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


