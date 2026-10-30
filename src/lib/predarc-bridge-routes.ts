export type PredarcBridgeNetworkKey = "arc" | "base";

export type CircleBridgeChain =
  | "Arc"
  | "Ethereum"
  | "Base"
  | "Arbitrum"
  | "Optimism"
  | "Polygon"
  | "Avalanche";

export const CIRCLE_BRIDGE_CHAIN_LABELS: Record<CircleBridgeChain, string> = {
  Arc: "Arc Mainnet",
  Ethereum: "Ethereum Mainnet",
  Base: "Base Mainnet",
  Arbitrum: "Arbitrum One",
  Optimism: "OP Mainnet",
  Polygon: "Polygon PoS",
  Avalanche: "Avalanche",
};

export const PREDARC_BRIDGE_ROUTES = [
  { key: "arc-ethereum", from: "Arc", to: "Ethereum" },
  { key: "ethereum-arc", from: "Ethereum", to: "Arc" },
  { key: "arc-base", from: "Arc", to: "Base" },
  { key: "base-arc", from: "Base", to: "Arc" },
  { key: "arc-arbitrum", from: "Arc", to: "Arbitrum" },
  { key: "arbitrum-arc", from: "Arbitrum", to: "Arc" },
  { key: "arc-polygon", from: "Arc", to: "Polygon" },
  { key: "polygon-arc", from: "Polygon", to: "Arc" },
  { key: "base-ethereum", from: "Base", to: "Ethereum" },
  { key: "ethereum-base", from: "Ethereum", to: "Base" },
  { key: "base-arbitrum", from: "Base", to: "Arbitrum" },
  { key: "arbitrum-base", from: "Arbitrum", to: "Base" },
  { key: "base-optimism", from: "Base", to: "Optimism" },
  { key: "optimism-base", from: "Optimism", to: "Base" },
  { key: "base-polygon", from: "Base", to: "Polygon" },
  { key: "polygon-base", from: "Polygon", to: "Base" },
  { key: "base-avalanche", from: "Base", to: "Avalanche" },
  { key: "avalanche-base", from: "Avalanche", to: "Base" },
] as const satisfies ReadonlyArray<{
  key: string;
  from: CircleBridgeChain;
  to: CircleBridgeChain;
}>;

export type PredarcBridgeRoute = (typeof PREDARC_BRIDGE_ROUTES)[number];
export type PredarcBridgeRouteKey = PredarcBridgeRoute["key"];

export function getDefaultBridgeRoute(
  networkKey: PredarcBridgeNetworkKey
): PredarcBridgeRouteKey {
  return networkKey === "base" ? "base-arc" : "arc-base";
}

export function getPredarcBridgeRoute(
  key: string
): PredarcBridgeRoute | undefined {
  return PREDARC_BRIDGE_ROUTES.find((route) => route.key === key);
}

export function getBridgeRouteLabel(route: PredarcBridgeRoute): string {
  return `${CIRCLE_BRIDGE_CHAIN_LABELS[route.from]} → ${
    CIRCLE_BRIDGE_CHAIN_LABELS[route.to]
  }`;
}

export function getOrderedBridgeRoutes(
  networkKey: PredarcBridgeNetworkKey
): PredarcBridgeRoute[] {
  const activeChain: CircleBridgeChain =
    networkKey === "base" ? "Base" : "Arc";

  return [
    ...PREDARC_BRIDGE_ROUTES.filter((route) => route.from === activeChain),
    ...PREDARC_BRIDGE_ROUTES.filter((route) => route.from !== activeChain),
  ];
}
