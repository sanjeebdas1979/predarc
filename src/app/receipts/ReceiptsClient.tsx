"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useAccount,
  useDisconnect,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import type { Address } from "viem";

import { usePredarcNetwork } from "@/app/components/providers/PredarcNetworkProvider";
import PredarcNetworkSelector from "@/app/components/wallet/PredarcNetworkSelector";
import WalletConnectOptions from "@/app/components/wallet/WalletConnectOptions";
import {
  HASH_PATTERN,
  paymentValue,
  receiptUsdcAbi,
  receiptUsdcDecimals,
  validRecipient,
} from "@/lib/receipts";
import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getPredarcNetwork,
  type PredarcChainId,
} from "@/lib/predarc-networks";

type Receipt = {
  chainId: PredarcChainId;
  network: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  currency: "USDC";
  fee: string;
  feeCurrency: "USDC" | "ETH";
  timestamp: number;
  blockNumber: string;
};

const field =
  "w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white";
const button =
  "rounded-xl bg-orange-500 px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40";

export default function ReceiptsClient({
  hash,
  receiptChainId,
}: {
  hash?: string;
  receiptChainId?: PredarcChainId;
}) {
  const router = useRouter();
  const { selectedChainId, network } = usePredarcNetwork();
  const activeChainId = hash
    ? receiptChainId ?? ARC_MAINNET_CHAIN_ID
    : selectedChainId;
  const activeNetwork = getPredarcNetwork(activeChainId);
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync, isPending: sendingNative } =
    useSendTransaction();
  const { writeContractAsync, isPending: sendingToken } = useWriteContract();
  const sending = sendingNative || sendingToken;
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  const [submittedHash, setSubmittedHash] = useState("");
  const locked = useRef(false);

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    async function check() {
      setLoading(true);
      setError("");
      setReceipt(null);
      try {
        const response = await fetch(
          `/api/receipts/${hash}?chainId=${activeChainId}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 404 && ++attempts < 12) {
            timer = setTimeout(check, 2_500);
            return;
          }
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Receipt unavailable.";
          throw new Error(message);
        }
        setReceipt(data as Receipt);
      } catch (lookupError) {
        if (controller.signal.aborted) return;
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : "Receipt unavailable."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeChainId, hash, retry]);

  async function walletAction(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch {
      setError("Wallet request was cancelled or could not complete.");
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || submittedHash) return;
    setError("");
    if (!address || chainId !== selectedChainId) {
      setError(`Connect your wallet on ${network.label} first.`);
      return;
    }
    const destination = recipient.trim();
    if (!validRecipient(destination)) {
      setError("Enter a valid non-zero recipient address.");
      return;
    }

    locked.current = true;
    try {
      const value = paymentValue(
        amount.trim(),
        receiptUsdcDecimals(selectedChainId)
      );
      const result =
        selectedChainId === ARC_MAINNET_CHAIN_ID
          ? await sendTransactionAsync({
              account: address,
              to: destination as Address,
              value,
              chainId: selectedChainId,
            })
          : await writeContractAsync({
              account: address,
              address: getPredarcNetwork(BASE_MAINNET_CHAIN_ID).usdcAddress,
              abi: receiptUsdcAbi,
              functionName: "transfer",
              args: [destination as Address, value],
              chainId: selectedChainId,
            });
      setSubmittedHash(result);
      router.push(`/receipts/${result}?chain=${selectedChainId}`);
    } catch (sendError) {
      setError(
        sendError instanceof Error && sendError.message.includes("Send more")
          ? sendError.message
          : "Transfer was not submitted. Check the network, USDC and gas balance. If your wallet shows a hash, look it up before retrying."
      );
    } finally {
      locked.current = false;
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("Receipt link copied.");
    } catch {
      setShareMessage("Copy this page address from your browser.");
    }
  }

  return (
    <main className="min-h-screen bg-[#080c12] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-10 flex flex-wrap justify-between gap-4 text-sm text-orange-300">
          <Link href="/">Predarc</Link>
          <Link href="/arena">Forecast Arena</Link>
          <Link href="/receipts">New transfer</Link>
        </nav>
        <p className="text-sm font-bold uppercase tracking-widest text-orange-400">
          {activeNetwork.label} · Verifiable USDC
        </p>
        <h1 className="mt-3 text-4xl font-black">Predarc Receipts</h1>
        <p className="mt-4 text-gray-400">
          Verify a supported USDC transfer against the selected mainnet. A
          receipt does not buy prediction points or certify a commercial
          purpose.
        </p>

        {hash ? (
          <section
            className="mt-8 rounded-3xl border border-white/10 bg-[#0d121a] p-6"
            aria-live="polite"
          >
            {loading ? <p>Checking {activeNetwork.label} confirmation…</p> : null}
            {receipt ? (
              <>
                <p className="font-bold text-emerald-400">
                  Confirmed on {receipt.network}
                </p>
                <p className="my-6 break-all text-4xl font-black">
                  {receipt.amount} <span className="text-xl">USDC</span>
                </p>
                <dl className="space-y-4 text-sm">
                  {[
                    ["From", receipt.from],
                    ["To", receipt.to],
                    ["Transaction", receipt.hash],
                    ["Block", receipt.blockNumber],
                    ["Network fee", `${receipt.fee} ${receipt.feeCurrency}`],
                    [
                      "Confirmed at",
                      new Date(receipt.timestamp * 1_000).toISOString(),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-gray-400">{label}</dt>
                      <dd className="mt-1 break-all font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 text-xs text-gray-400">
                  This verifies a successful supported USDC transfer. It does
                  not certify a purchase, prediction result or wallet ownership.
                </p>
                <button className={`${button} mt-6`} onClick={() => void share()}>
                  Copy receipt link
                </button>
                <p className="mt-2 text-sm" role="status">
                  {shareMessage}
                </p>
              </>
            ) : null}
            {!loading && !receipt ? (
              <button className={button} onClick={() => setRetry((value) => value + 1)}>
                Check again
              </button>
            ) : null}
            <a
              className="mt-5 block text-orange-300 underline"
              href={`${activeNetwork.explorerUrl}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View transaction on {activeNetwork.shortLabel} Explorer ↗
            </a>
          </section>
        ) : (
          <>
            <div className="mt-8">
              <PredarcNetworkSelector />
            </div>
            <section className="mt-6 rounded-3xl border border-white/10 bg-[#0d121a] p-6">
              <h2 className="mb-3 text-xl font-bold">Create a USDC transfer</h2>
              <p className="mb-5 text-sm text-amber-200/80">
                This uses real mainnet USDC. Arc sends native USDC; Base calls
                the official USDC transfer contract. The safety limit is 10 USDC.
              </p>
              {!isConnected ? (
                <WalletConnectOptions className="max-w-md" />
              ) : (
                <div className="mb-5">
                  <p className="break-all font-mono text-xs">{address}</p>
                  <button
                    className="mt-2 text-sm text-gray-400 underline"
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </button>
                  {chainId !== selectedChainId ? (
                    <button
                      className={`${button} ml-3`}
                      disabled={switching}
                      onClick={() =>
                        void walletAction(() =>
                          switchChainAsync({ chainId: selectedChainId })
                        )
                      }
                    >
                      Switch to {network.label}
                    </button>
                  ) : null}
                </div>
              )}
              <form className="mt-5 space-y-5" onSubmit={send}>
                <label className="block">
                  Recipient address
                  <input
                    className={`${field} mt-2`}
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    maxLength={42}
                    placeholder="0x…"
                    autoComplete="off"
                    required
                    disabled={sending || Boolean(submittedHash)}
                  />
                </label>
                <label className="block">
                  Amount in USDC
                  <input
                    className={`${field} mt-2`}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    maxLength={24}
                    required
                    disabled={sending || Boolean(submittedHash)}
                  />
                </label>
                <p className="text-sm text-gray-400">
                  Network gas is additional ({network.nativeCurrency}). Verify
                  the network, token, amount and recipient in your wallet.
                </p>
                <button
                  className={button}
                  disabled={
                    !isConnected ||
                    chainId !== selectedChainId ||
                    sending ||
                    Boolean(submittedHash)
                  }
                >
                  {sending
                    ? "Confirm in your wallet…"
                    : submittedHash
                      ? "Transfer submitted"
                      : "Review USDC transfer"}
                </button>
              </form>
            </section>
            <form
              className="mt-6 rounded-3xl border border-white/10 p-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (HASH_PATTERN.test(lookup.trim())) {
                  router.push(
                    `/receipts/${lookup.trim()}?chain=${selectedChainId}`
                  );
                } else {
                  setError("Enter a valid transaction hash.");
                }
              }}
            >
              <label className="block font-bold">
                Look up a {network.label} USDC transfer
                <input
                  className={`${field} mt-3 font-normal`}
                  value={lookup}
                  onChange={(event) => setLookup(event.target.value)}
                  placeholder="Transaction hash: 0x…"
                  maxLength={66}
                  required
                />
              </label>
              <button className={`${button} mt-4`}>Check receipt</button>
              <p className="mt-3 text-xs text-gray-400">
                Supports direct native-USDC transfers on Arc and official USDC
                transfer calls on Base. Other contract calls are rejected.
              </p>
            </form>
          </>
        )}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200"
          >
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
