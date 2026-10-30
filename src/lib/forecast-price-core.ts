export type ForecastPriceScale =
  | 100
  | 1_000_000;

export type ForecastDirection =
  | "higher"
  | "lower";

const FORECAST_PRICE_SCALES:
  ForecastPriceScale[] = [
  1_000_000,
  100,
];

export function scaleForecastPrice(
  price: number,
  scale: ForecastPriceScale
): bigint {
  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      "Forecast price must be a positive finite number."
    );
  }

  return BigInt(
    Math.round(price * scale)
  );
}

export function detectForecastPriceScale(
  onchainStartPrice: bigint,
  expectedStartPrice: number
): ForecastPriceScale | null {
  for (const scale of FORECAST_PRICE_SCALES) {
    if (
      onchainStartPrice ===
      scaleForecastPrice(
        expectedStartPrice,
        scale
      )
    ) {
      return scale;
    }
  }

  return null;
}

export function forecastDirectionForPrices(
  startPrice: number,
  endPrice: number
): ForecastDirection | null {
  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(endPrice)
  ) {
    return null;
  }

  if (endPrice > startPrice) {
    return "higher";
  }

  if (endPrice < startPrice) {
    return "lower";
  }

  return null;
}

export function isForecastDirectionCorrect(
  direction: ForecastDirection,
  startPrice: number,
  endPrice: number
): boolean | null {
  const result =
    forecastDirectionForPrices(
      startPrice,
      endPrice
    );

  return result === null
    ? null
    : result === direction;
}
