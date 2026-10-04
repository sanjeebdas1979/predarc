export type PredictionSubmitMarket =
  | "BTC"
  | "ETH"
  | "SOL"
  | "BNB"
  | "XRP";

export type PredictionSubmitDirection =
  | "higher"
  | "lower";

export type PredictionSubmitDuration =
  | 60
  | 300
  | 900
  | 3600;

export type ServerPredictionSubmission = {
  balance: string;
  replayed: boolean;
  entryPrice: number;
};

export async function submitServerPrediction(input: {
  requestId: string;
  market: PredictionSubmitMarket;
  direction: PredictionSubmitDirection;
  points: number;
  durationSeconds: PredictionSubmitDuration;
}): Promise<ServerPredictionSubmission> {
  const response = await fetch(
    "/api/predictions/submit",
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Server prediction failed."
    );
  }

  if (
    result?.authenticated !== true ||
    typeof result.balance !== "string"
  ) {
    throw new Error(
      "Server prediction returned an unexpected result."
    );
  }

  const entryPrice = Number(
    result.prediction?.entry_price
  );

  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    throw new Error(
      "Server prediction returned an invalid entry price."
    );
  }

  return {
    balance: result.balance,
    replayed: result.replayed === true,
    entryPrice,
  };
}
