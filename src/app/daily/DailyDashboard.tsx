"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import type { Hash } from "viem";
import { dailyAbi, dailyAddress, dailyChain, dailyEnabled, dailyExplorer } from "@/lib/daily";
import { countdown, dailyAvailability } from "@/lib/daily-core";

const button = "rounded-xl bg-orange-500 px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40";
const card = "rounded-3xl border border-white/10 bg-[#0d121a] p-6";

export default function DailyDashboard() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: dailyChain.id });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [now, setNow] = useState(0);
  const lock = useRef(false);
  const walletIdentity = `${chainId}:${address?.toLowerCase()}`;
  const identityRef = useRef(walletIdentity);
  useEffect(() => { identityRef.current = walletIdentity; }, [walletIdentity]);
  const { data, isError, isFetching, refetch } = useReadContract({
    address: dailyAddress,
    abi: dailyAbi,
    functionName: "status",
    args: address ? [address] : undefined,
    chainId: dailyChain.id,
    query: { enabled: dailyEnabled && !!address, refetchInterval: 15_000 },
  });

  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const status = data ? {
    activeUntil: Number(data[0]), nextClaimAt: Number(data[1]),
    unclaimedPoints: data[2], claimedPoints: data[3],
  } : undefined;
  const availability = status ? dailyAvailability(status, now) : undefined;
  const ready = dailyEnabled && isConnected && !!status && !isError && !busy && chainId === dailyChain.id;

  async function walletAction(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage("Wallet request was cancelled or failed. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function transact(action: "activate" | "claim") {
    if (lock.current || !ready || !address || !dailyAddress || !client) return;
    if (action === "activate" ? !availability?.canActivate : !availability?.canClaim) return;
    lock.current = true; setBusy(true); setHash(undefined);
    const startedAs = walletIdentity;
    try {
      setMessage("Checking the latest contract state…");
      if (await client.getChainId() !== dailyChain.id) throw new Error("Unexpected network");
      // Simulation enforces contract eligibility even when the browser clock is wrong.
      await client.simulateContract({
        account: address, address: dailyAddress, abi: dailyAbi, functionName: action,
      });
      if (identityRef.current !== startedAs) throw new Error("Wallet changed");
      setMessage("Review the network gas fee in your wallet. No payment amount or platform fee is requested.");
      const submitted = await writeContractAsync({
        account: address, address: dailyAddress, abi: dailyAbi,
        functionName: action, chainId: dailyChain.id,
      });
      setHash(submitted);
      setMessage("Transaction submitted. Waiting for confirmation; no timer has been started locally.");
      const receipt = await client.waitForTransactionReceipt({ hash: submitted, confirmations: 1, timeout: 120_000 });
      if (receipt.status !== "success") {
        setMessage("Transaction reverted. Access and claim timers were not advanced.");
        return;
      }
      await refetch();
      setMessage(action === "activate"
        ? "Activation confirmed. The contract records 24 hours of access."
        : "Claim confirmed. Recorded demo points were claimed; no USDC was paid out.");
    } catch {
      setMessage("The request could not complete here. If a transaction hash is shown, check its receipt and refresh status before retrying. Contract rules prevent early activation or repeat claims.");
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080c12] px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/arena" className="text-orange-300">← Prediction arena</Link>
        <header>
          <p className="text-sm font-bold uppercase tracking-widest text-orange-400">Predarc · {dailyChain.name}</p>
          <h1 className="mt-3 text-4xl font-black">Daily access & demo rewards</h1>
          <p className="mt-3 text-gray-400">One activation every 24 hours. A separate transaction claims all eligible demo points, at most once every 24 hours. Points have no cash value.</p>
        </header>
        {!dailyEnabled && <p className={card}>Preview only. Daily transactions are disabled while the contract and verified prediction service are being prepared. The existing testnet arena remains available.</p>}
        <div className="flex flex-wrap items-center gap-3">
          {!isConnected ? connectors.map(connector => (
            <button key={connector.uid} className={button} disabled={busy} onClick={() => void walletAction(() => connectAsync({ connector }))}>Connect {connector.name}</button>
          )) : <>
            <span className="break-all text-sm text-gray-300">{address}</span>
            <button className={button} disabled={busy} onClick={() => disconnect()}>Disconnect</button>
            {chainId !== dailyChain.id && <button className={button} disabled={busy || !dailyEnabled} onClick={() => void walletAction(() => switchChainAsync({ chainId: dailyChain.id }))}>Switch to {dailyChain.name}</button>}
          </>}
          {!isConnected && connectors.length === 0 && <p>Open in a browser with a supported wallet to connect.</p>}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <section className={card}>
            <h2 className="text-xl font-bold">Prediction access</h2>
            <p className="my-4 text-3xl font-black text-orange-300">{availability?.active ? countdown(availability.activateIn) : status ? "Ready to activate" : "—"}</p>
            <p className="mb-5 text-sm text-gray-400">The 24 hours begin at the successful activation block. An active period cannot be renewed early.</p>
            <button className={button} disabled={!ready || !availability?.canActivate} onClick={() => void transact("activate")}>Activate 24-hour access</button>
          </section>
          <section className={card}>
            <h2 className="text-xl font-bold">Demo reward claim</h2>
            <p className="my-4 text-3xl font-black text-emerald-300">{status ? status.unclaimedPoints.toLocaleString() : "—"} points</p>
            <p className="mb-5 text-sm text-gray-400">{availability && availability.claimIn > 0 ? `Next claim in ${countdown(availability.claimIn)}.` : "Claim all recorded points when available."} Claim access does not require another activation.</p>
            <button className={button} disabled={!ready || !availability?.canClaim} onClick={() => void transact("claim")}>Claim all demo points</button>
            <p className="mt-4 text-sm text-gray-400">Lifetime claimed: {status ? status.claimedPoints.toLocaleString() : "—"}</p>
          </section>
        </div>
        {isError && <p role="alert">Contract status could not be loaded. Transactions are disabled until it is available.</p>}
        {dailyEnabled && address && <button className="text-orange-300 underline" disabled={busy || isFetching} onClick={() => void refetch()}>{isFetching ? "Refreshing…" : "Refresh contract status"}</button>}
        <p role="status" aria-live="polite" className="text-sm text-gray-300">{message}</p>
        {hash && <a className="block break-all text-orange-300 underline" href={`${dailyExplorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">View submitted transaction {hash}</a>}
        <p className="text-sm text-gray-500">Network gas fees apply to each successful transaction and may also apply to reverted transactions. Timers shown here are estimates; the contract enforces eligibility.</p>
      </div>
    </main>
  );
}
