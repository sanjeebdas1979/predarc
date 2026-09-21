"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSwitchChain } from "wagmi";
import { type Address } from "viem";
import { HASH_PATTERN, paymentValue, validRecipient, RECEIPT_CHAIN_ID, RECEIPT_EXPLORER } from "@/lib/receipts";

type Receipt = { hash: string; from: string; to: string; amount: string; fee: string; timestamp: number; blockNumber: string };
const field = "w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-white";
const button = "rounded-xl bg-orange-500 px-5 py-3 font-bold text-black disabled:opacity-40";

export default function ReceiptsClient({ hash }: { hash?: string }) {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync, isPending } = useSendTransaction();
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
      setLoading(true); setError(""); setReceipt(null);
      try {
        const response = await fetch("/api/receipts/" + hash, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 404 && ++attempts < 12) {
            timer = setTimeout(check, 2500); return;
          }
          throw new Error(data.error || "Receipt unavailable.");
        }
        setReceipt(data); setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Receipt unavailable."); setLoading(false);
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [hash, retry]);

  async function walletAction(action: () => Promise<unknown>) {
    setError("");
    try { await action(); } catch { setError("Wallet request was cancelled or could not complete. Please retry."); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || submittedHash) return;
    setError("");
    if (!address || chainId !== RECEIPT_CHAIN_ID) { setError("Connect your wallet on Arc Testnet first."); return; }
    if (!validRecipient(recipient.trim())) { setError("Enter a valid non-zero recipient address."); return; }
    locked.current = true;
    try {
      let value: bigint;
      try { value = paymentValue(amount.trim()); }
      catch (validationError) {
        setError(validationError instanceof Error ? validationError.message : "Invalid amount.");
        return;
      }
      const result = await sendTransactionAsync({ account: address, to: recipient.trim() as Address, value, chainId: RECEIPT_CHAIN_ID });
      setSubmittedHash(result);
      router.push("/receipts/" + result);
    } catch {
      setError("Payment was not submitted successfully. Check your wallet for rejection, balance or network errors. If it shows a transaction hash, use receipt lookup before retrying.");
    } finally { locked.current = false; }
  }

  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage("Receipt link copied."); }
    catch { setShareMessage("Copy this page’s address from your browser to share the receipt."); }
  }

  return <main className="min-h-screen bg-[#080c12] px-4 py-8 text-white">
    <div className="mx-auto max-w-3xl">
      <nav className="mb-10 flex flex-wrap justify-between gap-4 text-sm text-orange-300">
        <Link href="/">Predarc</Link><Link href="/arena">Forecast Arena</Link><Link href="/receipts">New payment</Link>
      </nav>
      <p className="text-sm font-bold uppercase tracking-widest text-orange-400">Arc Testnet · No cash value</p>
      <h1 className="mt-3 text-4xl font-black">Predarc Receipts</h1>
      <p className="mt-4 text-gray-400">Send test USDC and share a receipt anyone can check against Arc. Payments do not buy prediction points or unlock rewards.</p>
      {hash ? <section className="mt-8 rounded-3xl border border-white/10 bg-[#0d121a] p-6" aria-live="polite">
        {loading && <p>Checking Arc Testnet confirmation…</p>}
        {receipt && <>
          <p className="font-bold text-emerald-400">Confirmed on Arc Testnet</p>
          <p className="my-6 break-all text-4xl font-black">{receipt.amount} <span className="text-xl">test USDC</span></p>
          <dl className="space-y-4 text-sm">
            {[["From", receipt.from], ["To", receipt.to], ["Transaction", receipt.hash], ["Block", receipt.blockNumber], ["Network fee", receipt.fee + " test USDC"], ["Confirmed at", new Date(receipt.timestamp * 1000).toISOString()]].map(([label, value]) => <div key={label}><dt className="text-gray-400">{label}</dt><dd className="mt-1 break-all font-mono">{value}</dd></div>)}
          </dl>
          <p className="mt-6 text-xs text-gray-400">This verifies a successful direct native-USDC transfer. It does not certify a purchase, prediction result, or ownership of either wallet. Receipt details are public.</p>
          <button className={button + " mt-6"} onClick={() => void share()}>Copy receipt link</button>
          <p className="mt-2 text-sm" role="status">{shareMessage}</p>
        </>}
        {!loading && !receipt && <button className={button} onClick={() => setRetry(retry + 1)}>Check again</button>}
        <a className="mt-5 block text-orange-300 underline" href={RECEIPT_EXPLORER + "/tx/" + hash} target="_blank" rel="noopener noreferrer">View transaction on Arc Explorer ↗</a>
      </section> : <>
        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0d121a] p-6">
          <h2 className="mb-5 text-xl font-bold">Test a payment</h2>
          {!isConnected ? <button className={button} disabled={connecting || !connectors[0]} onClick={() => void walletAction(() => connectAsync({ connector: connectors[0] }))}>{connecting ? "Connecting…" : connectors[0] ? "Connect wallet" : "Open in a browser with a wallet"}</button> : <div className="mb-5">
            <p className="break-all font-mono text-xs">{address}</p>
            <button className="mt-2 text-sm text-gray-400 underline" onClick={() => disconnect()}>Disconnect</button>
            {chainId !== RECEIPT_CHAIN_ID && <button className={button + " ml-3"} disabled={switching} onClick={() => void walletAction(() => switchChainAsync({ chainId: RECEIPT_CHAIN_ID }))}>Switch to Arc Testnet</button>}
          </div>}
          <form className="mt-5 space-y-5" onSubmit={send}>
            <label className="block">Recipient address<input className={field + " mt-2"} value={recipient} onChange={e => setRecipient(e.target.value)} maxLength={42} placeholder="0x…" autoComplete="off" required disabled={isPending || !!submittedHash} /></label>
            <label className="block">Amount in test USDC<input className={field + " mt-2"} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" maxLength={24} required disabled={isPending || !!submittedHash} /></label>
            <p className="text-sm text-gray-400">Demo limit: 10 test USDC. The network fee is additional. Review the amount and recipient in your wallet before confirming.</p>
            <button className={button} disabled={!isConnected || chainId !== RECEIPT_CHAIN_ID || isPending || !!submittedHash}>{isPending ? "Confirm in your wallet…" : submittedHash ? "Transaction submitted" : "Review payment in wallet"}</button>
            {submittedHash && <Link className="block text-orange-300 underline" href={"/receipts/" + submittedHash}>Open submitted transaction receipt</Link>}
          </form>
        </section>
        <form className="mt-6 rounded-3xl border border-white/10 p-6" onSubmit={e => { e.preventDefault(); if (HASH_PATTERN.test(lookup.trim())) router.push("/receipts/" + lookup.trim()); else setError("Enter a valid transaction hash."); }}>
          <label className="block font-bold">Look up an existing transfer<input className={field + " mt-3 font-normal"} value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Transaction hash: 0x…" maxLength={66} required /></label>
          <button className={button + " mt-4"}>Check receipt</button>
          <p className="mt-3 text-xs text-gray-400">Supports direct native-USDC transfers on Arc Testnet. Contract calls and ERC-20 transfers are not supported in this version.</p>
        </form>
      </>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p>}
    </div>
  </main>;
}
