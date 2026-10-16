import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrum, arcTestnet, base, mainnet, polygon } from "viem/chains";
import { arcMainnet } from "./daily";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet, base, arbitrum, polygon],

  connectors: [
    injected({
      target: "metaMask",
      shimDisconnect: true,
    }),
    injected({
      target: "rabby",
      shimDisconnect: true,
    }),
  ],

  transports: {
    [arcMainnet.id]: http("https://rpc.mainnet.arc.io"),
    [arcTestnet.id]: http(
      "https://rpc.testnet.arc.io"
    ),

    [mainnet.id]: http(
      "https://cloudflare-eth.com"
    ),

    [base.id]: http(
      "https://mainnet.base.org"
    ),

    [arbitrum.id]: http(
      "https://arb1.arbitrum.io/rpc"
    ),

    [polygon.id]: http(
      "https://polygon-rpc.com"
    ),
  },

  // Keep EIP-6963 discovery enabled so MetaMask and Rabby can coexist
  // without competing for window.ethereum. The UI still exposes only
  // those two approved wallet choices.
  multiInjectedProviderDiscovery: true,
  ssr: true,
});
