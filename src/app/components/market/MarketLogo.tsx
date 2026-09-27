"use client";

import { useState } from "react";
import type { MarketSymbol } from "../providers/BtcPriceProvider";

const MARKET_LOGO_URLS: Record<MarketSymbol, string> = {
  BTC: "https://cdn.simpleicons.org/bitcoin/F7931A",
  ETH: "https://cdn.simpleicons.org/ethereum/627EEA",
  SOL: "https://cdn.simpleicons.org/solana/14F195",
  BNB: "https://cdn.simpleicons.org/binance/F0B90B",
  XRP: "https://cdn.simpleicons.org/xrp/FFFFFF",
};

const FALLBACK_SYMBOLS: Record<MarketSymbol, string> = {
  BTC: "?",
  ETH: "?",
  SOL: "?",
  BNB: "B",
  XRP: "X",
};

type MarketLogoProps = {
  market: MarketSymbol;
  className?: string;
};

export default function MarketLogo({
  market,
  className = "h-7 w-7",
}: MarketLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-label={market + " logo"}
        className={
          "flex shrink-0 items-center justify-center font-black text-white " +
          className
        }
      >
        {FALLBACK_SYMBOLS[market]}
      </span>
    );
  }

  return (
    <img
      src={MARKET_LOGO_URLS[market]}
      alt={market + " logo"}
      className={"shrink-0 object-contain " + className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
