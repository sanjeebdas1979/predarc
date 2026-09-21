import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, mainnet } from "viem/chains";
import { arcMainnet } from "./daily";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet],

  connectors: [
    injected({
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
  },

  multiInjectedProviderDiscovery: true,
  ssr: true,
});