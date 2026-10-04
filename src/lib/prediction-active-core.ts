export type ActivePredictionCandidate = {
  id: number;
  roundNumber: number;
  market: string;
  duration: number | null;
  status: string;
};

export type ServerActivePrediction = {
  id: string;
  market:
    | "BTC"
    | "ETH"
    | "SOL"
    | "BNB"
    | "XRP";
  direction:
    | "higher"
    | "lower";
  points: number;
  durationSeconds:
    | 60
    | 300
    | 900
    | 3600;
  status: string;
  entryPrice: number;
  acceptedAt: string;
  closesAt: string;
};

const SERVER_MARKETS =
  new Set([
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
  ]);

const SERVER_DURATIONS =
  new Set([
    60,
    300,
    900,
    3600,
  ]);

export function selectActivePrediction<
  Prediction extends ActivePredictionCandidate,
>(
  predictions: Prediction[],
  market: string,
  duration: number,
  roundNumber: number
): Prediction | null {
  const pendingForMarket =
    predictions.filter(
      (prediction) =>
        prediction.status === "pending" &&
        prediction.market === market
    );

  return (
    pendingForMarket.find(
      (prediction) =>
        prediction.roundNumber === roundNumber &&
        prediction.duration === duration
    ) ??
    pendingForMarket.find(
      (prediction) =>
        prediction.duration === duration
    ) ??
    pendingForMarket[0] ??
    null
  );
}

export function parseServerActivePrediction(
  value: unknown
): ServerActivePrediction | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("market" in value) ||
    !("direction" in value) ||
    !("points" in value) ||
    !("durationSeconds" in value) ||
    !("status" in value) ||
    !("entryPrice" in value) ||
    !("acceptedAt" in value) ||
    !("closesAt" in value)
  ) {
    return null;
  }

  const points = Number(
    value.points
  );
  const durationSeconds = Number(
    value.durationSeconds
  );
  const entryPrice = Number(
    value.entryPrice
  );

  if (
    typeof value.id !== "string" ||
    typeof value.market !== "string" ||
    !SERVER_MARKETS.has(
      value.market
    ) ||
    !(
      value.direction === "higher" ||
      value.direction === "lower"
    ) ||
    !Number.isFinite(points) ||
    points <= 0 ||
    !SERVER_DURATIONS.has(
      durationSeconds
    ) ||
    typeof value.status !== "string" ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    typeof value.acceptedAt !== "string" ||
    typeof value.closesAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    market:
      value.market as
        ServerActivePrediction["market"],
    direction:
      value.direction,
    points,
    durationSeconds:
      durationSeconds as
        ServerActivePrediction["durationSeconds"],
    status:
      value.status,
    entryPrice,
    acceptedAt:
      value.acceptedAt,
    closesAt:
      value.closesAt,
  };
}

export function selectServerActivePrediction(
  predictions:
    ServerActivePrediction[],
  market: string,
  duration: number
): ServerActivePrediction | null {
  return (
    predictions.find(
      (prediction) =>
        prediction.status === "pending" &&
        prediction.market === market &&
        prediction.durationSeconds === duration
    ) ?? null
  );
}
