"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAccount, useConfig, useConnect, useSignMessage, useSwitchChain } from "wagmi";
import { getAccount } from "wagmi/actions";

const chain = 5042002;
const button = "rounded-xl bg-orange-500 px-5 py-3 font-bold text-black disabled:opacity-40";

export default function AuthTestPage() {
  const config = useConfig();
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) {
      setMessage(error instanceof Error && error.message.length < 250
        ? error.message : "Request cancelled or failed. Start sign-in again.");
    } finally { lock.current = false; setBusy(false); }
  }

  async function signIn() {
    const initial = getAccount(config);
    if (!initial.address || initial.chainId !== chain) throw new Error("Connect on Arc Testnet first.");
    const wallet = initial.address;
    function checkWallet() {
      const current = getAccount(config);
      if (current.address !== wallet || current.chainId !== chain) {
        throw new Error("Wallet or network changed. Start sign-in again.");
      }
    }
    const response = await fetch("/api/auth/challenge", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const challenge = await response.json();
    if (!response.ok) throw new Error(challenge.error || "Could not create challenge.");
    if (challenge.chainId !== chain || typeof challenge.message !== "string"
      || typeof challenge.challengeId !== "string") throw new Error("Unexpected challenge response.");
    checkWallet();
    setMessage("Review the sign-in message in your wallet. No transaction is requested.");
    const signature = await signMessageAsync({ account: wallet, message: challenge.message });
    checkWallet();
    setMessage("Checking your signature…");
    const verified = await fetch("/api/auth/verify", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
    });
    const result = await verified.json();
    if (!verified.ok) throw new Error(result.error || "Signature verification failed.");
    if (result.authenticated !== true || result.chainId !== chain
      || result.wallet !== wallet.toLowerCase()) throw new Error("Unexpected verification response.");
    checkWallet();
    setMessage(`Sign-in succeeded for ${result.wallet}. Session expires at ${result.expiresAt}.`);
  }

  return (
    <main className="min-h-screen bg-[#080c12] px-5 py-12 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/arena" className="text-orange-400">← Prediction arena</Link>
        <h1 className="text-3xl font-bold">Predarc wallet sign-in test</h1>
        <p>Arc Testnet · Sign a login message. No gas fee, payment or token approval.</p>
        <p className="text-gray-400">This page tests a new sign-in. It does not display existing session status or activate daily prediction access.</p>
        <p className="break-all">Connected wallet: {address || "None"}</p>
        <div className="flex flex-wrap gap-3">
          {!isConnected && connectors.map(connector => (
            <button className={button} key={connector.uid} disabled={busy}
              onClick={() => void run(async () => { await connectAsync({ connector }); })}>
              Connect {connector.name}
            </button>
          ))}
          {isConnected && chainId !== chain && <button className={button} disabled={busy}
            onClick={() => void run(async () => { await switchChainAsync({ chainId: chain }); })}>Switch to Arc Testnet</button>}
          <button className={button} disabled={busy || !isConnected || chainId !== chain}
            onClick={() => void run(signIn)}>{busy ? "Please wait…" : "Sign in with wallet"}</button>
        </div>
        {!isConnected && connectors.length === 0 && <p>Open this page in your wallet-enabled browser.</p>}
        <p role="status" className="break-words text-orange-300">{message}</p>
      </div>
    </main>
  );
}
