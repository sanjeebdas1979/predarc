"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAccount } from "wagmi";
import { arcTestnet } from "viem/chains";

type VerificationContextValue = {
  isVerified: boolean;
  setVerified: (value: boolean) => void;
  clearVerification: () => void;
};

type VerificationProviderProps = {
  children: ReactNode;
};

const VerificationContext =
  createContext<VerificationContextValue | null>(null);

const VERIFICATION_DURATION_MS =
  24 * 60 * 60 * 1000;

function getStorageKey(address: string): string {
  return `predarc-onchain-verification-${address.toLowerCase()}`;
}

export function VerificationProvider({
  children,
}: VerificationProviderProps) {
  const {
    address,
    chainId,
    isConnected,
  } = useAccount();

  const [isVerified, setIsVerified] =
    useState(false);

  /*
   * Load saved verification whenever:
   * - wallet connects
   * - wallet changes
   * - network changes
   */
  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      chainId !== arcTestnet.id
    ) {
      setIsVerified(false);
      return;
    }

    const storageKey =
      getStorageKey(address);

    try {
      const savedVerification =
        window.localStorage.getItem(
          storageKey
        );

      if (!savedVerification) {
        setIsVerified(false);
        return;
      }

      const verifiedAt =
        Number(savedVerification);

      if (
        !Number.isFinite(verifiedAt)
      ) {
        window.localStorage.removeItem(
          storageKey
        );

        setIsVerified(false);
        return;
      }

      const expiresAt =
        verifiedAt +
        VERIFICATION_DURATION_MS;

      const now = Date.now();

      if (now >= expiresAt) {
        window.localStorage.removeItem(
          storageKey
        );

        setIsVerified(false);
        return;
      }

      setIsVerified(true);

      /*
       * Automatically expire verification
       * exactly when 24 hours are complete.
       */
      const remainingTime =
        expiresAt - now;

      const timeoutId =
        window.setTimeout(() => {
          window.localStorage.removeItem(
            storageKey
          );

          setIsVerified(false);
        }, remainingTime);

      return () => {
        window.clearTimeout(timeoutId);
      };
    } catch (error) {
      console.error(
        "Could not load wallet verification:",
        error
      );

      setIsVerified(false);
    }
  }, [
    address,
    chainId,
    isConnected,
  ]);

  /*
   * Called after the Arc Testnet
   * verification transaction succeeds.
   */
  const setVerified = useCallback(
    (value: boolean): void => {
      if (!address) {
        setIsVerified(false);
        return;
      }

      const storageKey =
        getStorageKey(address);

      if (!value) {
        try {
          window.localStorage.removeItem(
            storageKey
          );
        } catch (error) {
          console.error(
            "Could not remove wallet verification:",
            error
          );
        }

        setIsVerified(false);
        return;
      }

      if (
        !isConnected ||
        chainId !== arcTestnet.id
      ) {
        setIsVerified(false);
        return;
      }

      const verifiedAt =
        Date.now();

      try {
        window.localStorage.setItem(
          storageKey,
          String(verifiedAt)
        );

        setIsVerified(true);
      } catch (error) {
        console.error(
          "Could not save wallet verification:",
          error
        );

        setIsVerified(false);
      }
    },
    [
      address,
      chainId,
      isConnected,
    ]
  );

  /*
   * Completely removes verification
   * for the currently connected wallet.
   */
  const clearVerification =
    useCallback((): void => {
      if (address) {
        const storageKey =
          getStorageKey(address);

        try {
          window.localStorage.removeItem(
            storageKey
          );
        } catch (error) {
          console.error(
            "Could not clear wallet verification:",
            error
          );
        }
      }

      setIsVerified(false);
    }, [address]);

  const value = useMemo(
    () => ({
      isVerified,
      setVerified,
      clearVerification,
    }),
    [
      isVerified,
      setVerified,
      clearVerification,
    ]
  );

  return (
    <VerificationContext.Provider
      value={value}
    >
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification():
  VerificationContextValue {
  const context = useContext(
    VerificationContext
  );

  if (!context) {
    throw new Error(
      "useVerification must be used inside VerificationProvider."
    );
  }

  return context;
}