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
  entryPrice: number;
  forecastId: string;
  transactionHash: `0x${string}`;
}): Promise<ServerPredictionSubmission> {
  const response = await fetch(
    "/api/ledger-sync",
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    throw new Error(
      "A browser security filter blocked the server-ledger response. Allow predarc.xyz, then retry the same server sync."
    );
  }

  let result: unknown;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The server ledger returned an unreadable response. Retry the same server sync."
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "Server prediction failed."
    );
  }

  if (
    typeof result !== "object" ||
    result === null ||
    !("authenticated" in result) ||
    result.authenticated !== true ||
    !("balance" in result) ||
    typeof result.balance !== "string" ||
    !("prediction" in result) ||
    typeof result.prediction !== "object" ||
    result.prediction === null
  ) {
    throw new Error(
      "Server prediction returned an unexpected result."
    );
  }

  const entryPrice = Number(
    "entry_price" in result.prediction
      ? result.prediction.entry_price
      : Number.NaN
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
    replayed:
      "replayed" in result &&
      result.replayed === true,
    entryPrice,
  };
}
