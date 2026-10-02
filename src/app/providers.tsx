"use client";

import { useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";

import { DemoPointsProvider } from "./components/providers/DemoPointsProvider";
import { VerificationProvider } from "./components/providers/VerificationProvider";
import { BtcPriceProvider } from "./components/providers/BtcPriceProvider";
import { RoundProvider } from "./components/providers/RoundProvider";
import { PredarcSessionProvider } from "./components/providers/PredarcSessionProvider";

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({
  children,
}: ProvidersProps) {
  const [queryClient] = useState(
    () => new QueryClient()
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <PredarcSessionProvider>
          <DemoPointsProvider>
            <VerificationProvider>
              <BtcPriceProvider>
                <RoundProvider>
                  {children}
                </RoundProvider>
              </BtcPriceProvider>
            </VerificationProvider>
          </DemoPointsProvider>
        </PredarcSessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
