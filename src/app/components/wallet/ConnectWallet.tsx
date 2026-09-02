"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";

import {
  parseEther,
  type Hash,
} from "viem";

import { arcTestnet } from "viem/chains";

import { useVerification } from "../providers/VerificationProvider";

const LEGACY_PENDING_VERIFICATION_KEY =
  "prederc-pending-verification-transaction";

const PENDING_MAX_AGE_MS =
  15 * 60 * 1000;

const RECEIPT_CHECK_INTERVAL_MS =
  1500;

const RECEIPT_MAX_ATTEMPTS =
  40;

type PendingVerification = {
  hash: Hash;
  createdAt: number;
};

function shortenAddress(
  address: string
): string {
  return `${address.slice(
    0,
    6
  )}...${address.slice(-4)}`;
}

function shortenHash(
  hash: string
): string {
  return `${hash.slice(
    0,
    10
  )}...${hash.slice(-8)}`;
}

function getPendingVerificationKey(
  address: string
): string {
  return `prederc-pending-verification-${address.toLowerCase()}`;
}

function sleep(
  milliseconds: number
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds
    );
  });
}

function isValidHash(
  value: unknown
): value is Hash {
  return (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]{64}$/.test(
      value
    )
  );
}

function isReceiptNotFoundError(
  error: unknown
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message =
    error.message.toLowerCase();

  return (
    error.name ===
      "TransactionReceiptNotFoundError" ||
    message.includes(
      "transaction receipt"
    ) ||
    message.includes(
      "could not be found"
    )
  );
}

function getErrorMessage(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "Verification failed. Please try again.";
  }

  const message =
    error.message.toLowerCase();

  if (
    message.includes(
      "user rejected"
    ) ||
    message.includes(
      "user denied"
    )
  ) {
    return "Transaction was rejected in MetaMask.";
  }

  if (
    message.includes(
      "insufficient funds"
    )
  ) {
    return "Not enough Arc Testnet USDC for transaction gas.";
  }

  if (
    message.includes("reverted")
  ) {
    return "The verification transaction reverted on Arc Testnet.";
  }

  return "Verification could not be confirmed. Please check Arc Explorer or try again.";
}

export default function ConnectWallet() {
  const {
    address,
    chainId,
    isConnected,
  } = useAccount();

  const {
    isVerified,
    setVerified,
  } = useVerification();

  const publicClient =
    usePublicClient({
      chainId: arcTestnet.id,
    });

  const {
    connect,
    connectors,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();

  const {
    disconnect,
  } = useDisconnect();

  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const {
    sendTransactionAsync,
    isPending:
      isWaitingForWallet,
    reset: resetTransaction,
  } = useSendTransaction();

  const [
    isCheckingReceipt,
    setIsCheckingReceipt,
  ] = useState(false);

  const [
    transactionHash,
    setTransactionHash,
  ] = useState<Hash | null>(
    null
  );

  const [
    verificationMessage,
    setVerificationMessage,
  ] = useState("");

  const [
    verificationError,
    setVerificationError,
  ] = useState("");

  const resumedHashRef =
    useRef<Hash | null>(null);

  const metaMaskConnector =
    useMemo(
      () =>
        connectors.find(
          (connector) =>
            connector.name
              .toLowerCase()
              .includes(
                "metamask"
              )
        ) ?? connectors[0],
      [connectors]
    );

  const isBusy =
    isWaitingForWallet ||
    isCheckingReceipt;

  /*
   * Remove the old global pending
   * verification key that caused stale
   * transaction hashes to be checked
   * forever.
   */
  useEffect(() => {
    try {
      window.localStorage.removeItem(
        LEGACY_PENDING_VERIFICATION_KEY
      );
    } catch {
      // Ignore storage errors.
    }
  }, []);

  /*
   * Reset temporary UI when wallet changes.
   *
   * This does NOT remove the 24-hour
   * verification saved by VerificationProvider.
   */
  useEffect(() => {
    setTransactionHash(null);
    setVerificationMessage("");
    setVerificationError("");

    resumedHashRef.current =
      null;
  }, [address]);

  function savePendingVerification(
    walletAddress: string,
    hash: Hash
  ): void {
    const pending:
      PendingVerification = {
      hash,
      createdAt: Date.now(),
    };

    try {
      window.localStorage.setItem(
        getPendingVerificationKey(
          walletAddress
        ),
        JSON.stringify(
          pending
        )
      );
    } catch (error) {
      console.error(
        "Could not save pending verification:",
        error
      );
    }
  }

  function removePendingVerification(
    walletAddress: string
  ): void {
    try {
      window.localStorage.removeItem(
        getPendingVerificationKey(
          walletAddress
        )
      );
    } catch (error) {
      console.error(
        "Could not remove pending verification:",
        error
      );
    }
  }

  function loadPendingVerification(
    walletAddress: string
  ): PendingVerification | null {
    try {
      const raw =
        window.localStorage.getItem(
          getPendingVerificationKey(
            walletAddress
          )
        );

      if (!raw) {
        return null;
      }

      const parsed =
        JSON.parse(
          raw
        ) as Partial<PendingVerification>;

      if (
        !isValidHash(
          parsed.hash
        ) ||
        typeof parsed.createdAt !==
          "number"
      ) {
        removePendingVerification(
          walletAddress
        );

        return null;
      }

      const age =
        Date.now() -
        parsed.createdAt;

      if (
        age >
        PENDING_MAX_AGE_MS
      ) {
        removePendingVerification(
          walletAddress
        );

        return null;
      }

      return {
        hash: parsed.hash,
        createdAt:
          parsed.createdAt,
      };
    } catch {
      removePendingVerification(
        walletAddress
      );

      return null;
    }
  }

  const confirmTransaction =
    useCallback(
      async (
        hash: Hash
      ): Promise<boolean> => {
        if (
          !publicClient ||
          !address
        ) {
          setVerificationError(
            "Arc Testnet client is unavailable. Refresh the page and try again."
          );

          return false;
        }

        setIsCheckingReceipt(
          true
        );

        setVerificationError(
          ""
        );

        setVerificationMessage(
          "Checking Arc Testnet confirmation..."
        );

        try {
          for (
            let attempt = 1;
            attempt <=
            RECEIPT_MAX_ATTEMPTS;
            attempt += 1
          ) {
            try {
              const receipt =
                await publicClient.getTransactionReceipt(
                  {
                    hash,
                  }
                );

              if (
                receipt.status ===
                "success"
              ) {
                setVerified(
                  true
                );

                removePendingVerification(
                  address
                );

                setVerificationMessage(
                  "Transaction confirmed. Prediction access unlocked for 24 hours."
                );

                setVerificationError(
                  ""
                );

                return true;
              }

              if (
                receipt.status ===
                "reverted"
              ) {
                removePendingVerification(
                  address
                );

                setVerificationMessage(
                  ""
                );

                setVerificationError(
                  "The verification transaction reverted on Arc Testnet."
                );

                return false;
              }
            } catch (
              receiptError
            ) {
              /*
               * ReceiptNotFound is normal
               * immediately after submission.
               * We silently continue polling.
               */
              if (
                !isReceiptNotFoundError(
                  receiptError
                ) &&
                attempt ===
                  RECEIPT_MAX_ATTEMPTS
              ) {
                console.error(
                  "Arc receipt check failed:",
                  receiptError
                );
              }
            }

            if (
              attempt <
              RECEIPT_MAX_ATTEMPTS
            ) {
              await sleep(
                RECEIPT_CHECK_INTERVAL_MS
              );
            }
          }

          /*
           * Stop endless checks.
           *
           * We remove the pending local
           * transaction after the polling
           * window ends.
           */
          removePendingVerification(
            address
          );

          resumedHashRef.current =
            null;

          setVerificationMessage(
            ""
          );

          setVerificationError(
            "Arc confirmation was not found within the verification window. You can check the transaction in Arc Explorer or submit a new verification."
          );

          return false;
        } catch (error) {
          console.error(
            "Verification confirmation failed:",
            error
          );

          removePendingVerification(
            address
          );

          setVerificationMessage(
            ""
          );

          setVerificationError(
            getErrorMessage(
              error
            )
          );

          return false;
        } finally {
          setIsCheckingReceipt(
            false
          );
        }
      },
      [
        address,
        publicClient,
        setVerified,
      ]
    );

  async function verifyOnchain():
    Promise<void> {
    setVerificationMessage(
      ""
    );

    setVerificationError(
      ""
    );

    setTransactionHash(
      null
    );

    resetTransaction();

    if (!address) {
      setVerificationError(
        "Connect your wallet first."
      );

      return;
    }

    if (
      chainId !==
      arcTestnet.id
    ) {
      setVerificationError(
        "Switch to Arc Testnet first."
      );

      return;
    }

    try {
      setVerificationMessage(
        "Confirm the verification transaction in MetaMask."
      );

      const hash =
        await sendTransactionAsync(
          {
            to: address,

            value:
              parseEther(
                "0.000001"
              ),

            chainId:
              arcTestnet.id,
          }
        );

      setTransactionHash(
        hash
      );

      savePendingVerification(
        address,
        hash
      );

      setVerificationMessage(
        "Transaction submitted. Checking Arc Testnet..."
      );

      await confirmTransaction(
        hash
      );
    } catch (error) {
      console.error(
        "Wallet verification submission failed:",
        error
      );

      setVerificationMessage(
        ""
      );

      setVerificationError(
        getErrorMessage(
          error
        )
      );
    }
  }

  async function checkTransactionAgain():
    Promise<void> {
    if (!transactionHash) {
      return;
    }

    await confirmTransaction(
      transactionHash
    );
  }

  function disconnectWallet():
    void {
    setVerificationMessage(
      ""
    );

    setVerificationError(
      ""
    );

    setTransactionHash(
      null
    );

    resumedHashRef.current =
      null;

    resetTransaction();

    /*
     * IMPORTANT:
     *
     * We do NOT call clearVerification().
     *
     * The wallet's successful verification
     * remains valid for the full 24-hour
     * period even if the user disconnects
     * and reconnects.
     */
    disconnect();
  }

  /*
   * Resume only a recent pending
   * transaction after refresh.
   *
   * Old hashes are automatically ignored.
   */
  useEffect(() => {
    if (
      !isConnected ||
      !address ||
      chainId !==
        arcTestnet.id ||
      isVerified
    ) {
      return;
    }

    const pending =
      loadPendingVerification(
        address
      );

    if (!pending) {
      return;
    }

    if (
      resumedHashRef.current ===
      pending.hash
    ) {
      return;
    }

    resumedHashRef.current =
      pending.hash;

    setTransactionHash(
      pending.hash
    );

    void confirmTransaction(
      pending.hash
    );
  }, [
    address,
    chainId,
    isConnected,
    isVerified,
    confirmTransaction,
  ]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={
            !metaMaskConnector ||
            isConnecting
          }
          onClick={() => {
            if (
              metaMaskConnector
            ) {
              connect({
                connector:
                  metaMaskConnector,
              });
            }
          }}
          className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnecting
            ? "Connecting..."
            : "Connect MetaMask"}
        </button>

        {connectError && (
          <p className="max-w-sm text-center text-sm text-red-400">
            {
              connectError.message
            }
          </p>
        )}
      </div>
    );
  }

  if (
    chainId !==
    arcTestnet.id
  ) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-yellow-300">
          Detected chain ID:{" "}
          {chainId ??
            "Unknown"}
        </p>

        <button
          type="button"
          disabled={
            isSwitching
          }
          onClick={() =>
            switchChain({
              chainId:
                arcTestnet.id,
            })
          }
          className="rounded-xl bg-yellow-400 px-6 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSwitching
            ? "Switching..."
            : "Switch To Arc Testnet"}
        </button>

        {switchError && (
          <p className="max-w-sm text-center text-sm text-red-400">
            {
              switchError.message
            }
          </p>
        )}

        <button
          type="button"
          onClick={
            disconnectWallet
          }
          className="rounded-xl border border-white/20 px-4 py-2 text-sm transition hover:bg-white hover:text-black"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="rounded-xl border border-green-500/50 bg-green-500/10 px-4 py-2">
          <p className="text-xs text-green-400">
            Arc Testnet
          </p>

          <p className="font-medium">
            {address
              ? shortenAddress(
                  address
                )
              : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={
            disconnectWallet
          }
          className="rounded-xl border border-white/20 px-4 py-2 transition hover:bg-white hover:text-black"
        >
          Disconnect
        </button>
      </div>

      {isVerified ? (
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
          <p className="font-bold text-emerald-400">
            ✓ Verified Onchain
          </p>

          <p className="mt-1 text-sm text-gray-300">
            Prediction access
            is unlocked for
            this wallet for
            24 hours.
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-center">
          <p className="font-bold text-orange-400">
            Prediction Access
            Locked
          </p>

          <p className="mt-2 text-sm text-gray-300">
            Complete one tiny
            Arc Testnet
            transaction to
            verify your wallet.
          </p>

          <button
            type="button"
            onClick={() => {
              void verifyOnchain();
            }}
            disabled={isBusy}
            className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWaitingForWallet
              ? "Confirm In MetaMask..."
              : isCheckingReceipt
                ? "Checking Arc Confirmation..."
                : "Verify Onchain"}
          </button>

          <p className="mt-3 text-xs text-gray-500">
            Amount: 0.000001
            Arc Testnet USDC
          </p>
        </div>
      )}

      {transactionHash &&
        !isVerified && (
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-gray-500">
              Verification
              transaction
            </p>

            <p className="mt-1 font-mono text-xs text-gray-300">
              {shortenHash(
                transactionHash
              )}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={
                  isCheckingReceipt
                }
                onClick={() => {
                  void checkTransactionAgain();
                }}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:cursor-wait disabled:opacity-50"
              >
                {isCheckingReceipt
                  ? "Checking..."
                  : "Check Again"}
              </button>

              <a
                href={`https://testnet.arcscan.app/tx/${transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300"
              >
                View on Arc
                Explorer ↗
              </a>
            </div>
          </div>
        )}

      {verificationMessage &&
        !verificationError && (
          <p className="max-w-md text-center text-sm text-emerald-400">
            {
              verificationMessage
            }
          </p>
        )}

      {verificationError && (
        <p className="max-w-md text-center text-sm text-red-400">
          {
            verificationError
          }
        </p>
      )}
    </div>
  );
}