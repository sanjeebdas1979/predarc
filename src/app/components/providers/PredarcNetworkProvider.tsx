"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAccount, useSwitchChain } from "wagmi";

import {
  DEFAULT_PREDARC_CHAIN_ID,
  getForecastRegistryAddress,
  getPredarcNetwork,
  isPredarcChainId,
  type PredarcChainId,
  type PredarcNetwork,
} from "@/lib/predarc-networks";

const STORAGE_KEY = "predarc-selected-mainnet";
const NETWORK_CHANGE_EVENT = "predarc:network-change";
let memorySelection: PredarcChainId | null = null;

function readStoredNetwork(): PredarcChainId | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (isPredarcChainId(stored)) return stored;
  } catch {
    // Fall back to the in-memory selection when storage is unavailable.
  }
  return memorySelection;
}

function networkSnapshot(): PredarcChainId {
  return readStoredNetwork() ?? DEFAULT_PREDARC_CHAIN_ID;
}

function subscribeToNetwork(onStoreChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) onStoreChange();
  }
  window.addEventListener("storage", handleStorage);
  window.addEventListener(NETWORK_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(NETWORK_CHANGE_EVENT, onStoreChange);
  };
}

function storeNetwork(chainId: PredarcChainId): void {
  memorySelection = chainId;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(chainId));
  } catch {
    // The in-memory selection still keeps this tab consistent.
  }
  window.dispatchEvent(new Event(NETWORK_CHANGE_EVENT));
}

type PredarcNetworkContextValue = {
  selectedChainId: PredarcChainId;
  network: PredarcNetwork;
  forecastRegistryAddress: `0x${string}` | undefined;
  isSwitching: boolean;
  selectNetwork: (chainId: PredarcChainId) => Promise<void>;
};

const PredarcNetworkContext =
  createContext<PredarcNetworkContextValue | null>(null);

export function PredarcNetworkProvider({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const selectedChainId = useSyncExternalStore(
    subscribeToNetwork,
    networkSnapshot,
    () => DEFAULT_PREDARC_CHAIN_ID
  );

  useEffect(() => {
    if (
      isConnected &&
      isPredarcChainId(chainId) &&
      readStoredNetwork() === null
    ) {
      storeNetwork(chainId);
    }
  }, [chainId, isConnected]);

  const selectNetwork = useCallback(
    async (nextChainId: PredarcChainId) => {
      if (isConnected && chainId !== nextChainId) {
        await switchChainAsync({ chainId: nextChainId });
      }
      storeNetwork(nextChainId);
    },
    [chainId, isConnected, switchChainAsync]
  );

  const value = useMemo<PredarcNetworkContextValue>(
    () => ({
      selectedChainId,
      network: getPredarcNetwork(selectedChainId),
      forecastRegistryAddress: getForecastRegistryAddress(selectedChainId),
      isSwitching: isPending,
      selectNetwork,
    }),
    [isPending, selectNetwork, selectedChainId]
  );

  return (
    <PredarcNetworkContext.Provider value={value}>
      {children}
    </PredarcNetworkContext.Provider>
  );
}

export function usePredarcNetwork(): PredarcNetworkContextValue {
  const value = useContext(PredarcNetworkContext);
  if (!value) {
    throw new Error(
      "usePredarcNetwork must be used inside PredarcNetworkProvider."
    );
  }
  return value;
}
