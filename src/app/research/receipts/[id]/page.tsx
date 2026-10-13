import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PredarcBrand from "@/app/components/brand/PredarcBrand";
import {
  formatResearchUsdc,
  isAgentResearchUuid,
  type AgentResearchReceipt,
} from "@/lib/agent-research-core";
import type { PaidResearchReceipt } from "@/lib/agent-research-paid-core";
import {
  getPaidResearchReceiptById,
  verifyPaidResearchReceipt,
} from "@/lib/agent-research-paid-server";
import {
  getAgentResearchReceiptById,
  verifyAgentResearchReceipt,
} from "@/lib/agent-research-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Research Receipt | Predarc",
  description: "Verify the evidence and integrity of a Predarc research run.",
  robots: { index: false, follow: false },
};

const DURATION_LABELS: Record<number, string> = {
  60: "1 minute",
  300: "5 minutes",
  900: "15 minutes",
  3600: "1 hour",
};

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPrice(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: number >= 1_000 ? 2 : number >= 1 ? 4 : 6,
  }).format(number);
}

function signalClasses(
  signal: AgentResearchReceipt["signal"] | PaidResearchReceipt["signal"]
): string {
  if (signal === "higher") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (signal === "lower") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

export default async function AgentResearchReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isAgentResearchUuid(id)) notFound();

  const paidReceipt = await getPaidResearchReceiptById(id);
  const receipt = paidReceipt ?? (await getAgentResearchReceiptById(id));
  if (!receipt) notFound();

  const isPaid = paidReceipt !== null;
  const verified = paidReceipt
    ? verifyPaidResearchReceipt(paidReceipt)
    : verifyAgentResearchReceipt(receipt as AgentResearchReceipt);

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <PredarcBrand />
          <div className="flex gap-3 text-sm font-bold text-orange-300">
            <Link href="/research" className="hover:text-white">
              Agent Research
            </Link>
            <Link href="/" className="hover:text-white">
              Home
            </Link>
          </div>
        </header>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_38%),#0d121a] p-6 sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                Predarc Agent Research
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">
                Research Receipt
              </h1>
            </div>
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-violet-200">
              {isPaid ? "Arc Mainnet paid AI" : "Free Preview"}
            </span>
            <span
              className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${
                verified
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-red-400/30 bg-red-400/10 text-red-200"
              }`}
            >
              {verified ? "SHA-256 verified" : "Integrity check failed"}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-black">{receipt.market}</span>
            <span className="text-gray-500">·</span>
            <span className="text-lg font-bold text-gray-300">
              {DURATION_LABELS[receipt.durationSeconds]}
            </span>
            <span className={`rounded-full border px-4 py-2 text-sm font-black uppercase ${signalClasses(receipt.signal)}`}>
              {receipt.signal} · {receipt.confidence}%
            </span>
          </div>

          <p className="mt-6 max-w-4xl text-sm leading-7 text-gray-300">
            {receipt.rationale}
          </p>

          <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Entry price", `$${formatPrice(receipt.evidence.entryPrice)}`],
              ["Evidence source", receipt.evidence.source],
              ["Finalized candles", String(receipt.evidence.sampleCount)],
              ["Actual cost", `${formatResearchUsdc(receipt.spending.actualCostAtomic)} USDC`],
              ["Budget cap", `${formatResearchUsdc(receipt.spending.maxCostAtomic)} USDC`],
              [
                "Engine",
                isPaid
                  ? `${paidReceipt.engine.provider} · ${paidReceipt.engine.model}`
                  : `${receipt.engine.id} v${receipt.engine.version}`,
              ],
              ["Created", shortDate(receipt.createdAt)],
              ["Network ID", String(receipt.chainId)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"
              >
                <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                  {label}
                </dt>
                <dd className="mt-2 break-words text-sm font-bold text-gray-100">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-6 rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
              Evidence metrics
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Momentum", receipt.metrics.horizonReturnBps],
                ["Fast trend", receipt.metrics.fastTrendBps],
                ["Volatility", receipt.metrics.volatilityBps],
                ["Range position", receipt.metrics.rangePositionBps],
                ["Combined score", receipt.metrics.evidenceScoreBps],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 font-mono text-sm font-bold text-white">
                    {Number(value) >= 0 ? "+" : ""}
                    {value} bps
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {paidReceipt ? (
            <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                Arc Mainnet x402 payment
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  ["Scheme", "x402 exact · Arc Mainnet"],
                  ["Status", paidReceipt.spending.status],
                  ["Payment reference", paidReceipt.spending.paymentReference],
                  ["Authorization hash", paidReceipt.verification.authorizationHash],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="mt-1 break-all font-mono text-xs font-bold leading-5 text-white">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {paidReceipt.spending.settlementTransaction ? (
                <a
                  href={`https://explorer.arc.io/tx/${paidReceipt.spending.settlementTransaction}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-xl border border-cyan-400/25 px-4 py-2 text-xs font-black text-cyan-200 hover:text-white"
                >
                  View settlement on Arc ↗
                </a>
              ) : (
                <p className="mt-4 text-xs leading-5 text-gray-400">
                  The provider did not return an onchain transaction hash; the
                  signed authorization fingerprint remains bound to this receipt.
                </p>
              )}
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
              Receipt fingerprint
            </h2>
            <p className="mt-3 break-all font-mono text-xs leading-6 text-gray-200">
              {receipt.receiptHash}
            </p>
            <p className="mt-4 text-xs leading-5 text-gray-400">
              This fingerprint binds the wallet, request, evidence summary,
              engine version, signal, cost boundary and creation time. Any
              stored-field change makes verification fail.
            </p>
          </section>

          <details className="mt-6 rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <summary className="cursor-pointer text-sm font-black text-gray-200">
              Technical identifiers
            </summary>
            <dl className="mt-4 space-y-4 text-xs">
              {[
                ["Receipt ID", receipt.id],
                ...(paidReceipt
                  ? [
                      ["Quote ID", paidReceipt.quoteId],
                      ["Prompt hash", paidReceipt.verification.promptHash],
                      ["Response hash", paidReceipt.verification.responseHash],
                      ["Provider response ID", paidReceipt.providerResponseId],
                    ]
                  : []),
                ["Request ID", receipt.requestId],
                ["Wallet", receipt.wallet],
                ["Evidence hash", receipt.evidence.evidenceHash],
                ["Evidence window", `${receipt.evidence.windowStart} → ${receipt.evidence.windowEnd}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-black uppercase tracking-[0.12em] text-gray-500">
                    {label}
                  </dt>
                  <dd className="mt-1 break-all font-mono leading-5 text-gray-300">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`/api/agents/research/${receipt.id}`}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white"
            >
              View verification JSON
            </a>
            <Link
              href="/research"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold text-white"
            >
              Back to Agent Research
            </Link>
          </div>
        </section>

        <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-gray-500">
          {isPaid
            ? "This receipt records an opt-in paid AI call on Arc Mainnet. It is not financial advice."
            : "Phase 1 is a deterministic evidence preview, not financial advice. No AI-model or data-service payment was made for this receipt."}
        </p>
      </div>
    </main>
  );
}
