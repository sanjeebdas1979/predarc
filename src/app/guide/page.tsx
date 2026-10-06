import type { Metadata } from "next";
import Link from "next/link";

import PredarcBrand from "@/app/components/brand/PredarcBrand";

export const metadata: Metadata = {
  title: "How to Use Predarc | Predarc",
  description:
    "A step-by-step guide to Predarc forecasting, community markets, Bridge, Swap, AI agents, receipts and public builder discovery.",
};

const QUICK_START = [
  {
    number: "01",
    title: "Connect your wallet",
    description: "Connect the wallet you want to use with Predarc.",
  },
  {
    number: "02",
    title: "Sign in once",
    description:
      "Approve the gas-free Predarc sign-in message. Your session stays active until you sign out.",
  },
  {
    number: "03",
    title: "Choose a feature",
    description:
      "Open the Arena, create a market, Bridge, Swap or connect an optional AI agent.",
  },
] as const;

const FEATURE_GUIDES = [
  {
    id: "wallet",
    number: "01",
    eyebrow: "Start here",
    title: "Connect your wallet and sign in",
    summary:
      "Predarc uses your connected wallet as your identity. Signing in loads your server-points balance and unlocks the connected product flow.",
    steps: [
      "Connect your wallet from Predarc.",
      "Switch to Arc Mainnet if your wallet asks you to change networks.",
      "Approve the Predarc sign-in message. This signature is gas-free and is not a token approval.",
      "Stay signed in while you move between Predarc pages. Use Sign out when you want to end the session.",
    ],
    note: "A wallet connection and a Predarc sign-in are separate steps. Complete both before using signed-in features.",
    href: "/arena",
    cta: "Connect in Arena",
    accent: "border-blue-400/20 bg-blue-400/[0.06]",
    label: "text-blue-300",
    badge: "border-blue-400/25 bg-blue-400/10 text-blue-200",
  },
  {
    id: "arena",
    number: "02",
    eyebrow: "Manual forecasting",
    title: "Make a prediction in the Arena",
    summary:
      "Choose a supported market and timeframe, then make a Higher or Lower prediction with an explicit wallet confirmation.",
    steps: [
      "Choose BTC, ETH, SOL, BNB or XRP.",
      "Select a 1-minute, 5-minute or 15-minute round.",
      "Choose Higher or Lower and enter the server points you want to use.",
      "Review the details and confirm the prediction in your wallet.",
      "Follow the matching active-prediction card until the round resolves.",
    ],
    note: "Manual predictions keep their wallet-confirmation step even when you are already signed in.",
    href: "/arena",
    cta: "Open Forecast Arena",
    accent: "border-orange-400/20 bg-orange-400/[0.06]",
    label: "text-orange-300",
    badge: "border-orange-400/25 bg-orange-400/10 text-orange-200",
  },
  {
    id: "markets",
    number: "03",
    eyebrow: "Community markets",
    title: "Create or join a community market",
    summary:
      "Signed-in users can create focused crypto markets with a visible asset, target and closing time.",
    steps: [
      "Open Community Markets and review the current live quote.",
      "Choose an asset, target, direction and supported duration for a new market.",
      "Review every market field before approving the creation signature.",
      "Open an active community market to submit a prediction and follow its settlement status.",
    ],
    note: "Market creation uses a wallet signature that binds the security-sensitive market fields.",
    href: "/markets",
    cta: "Open Community Markets",
    accent: "border-amber-400/20 bg-amber-400/[0.06]",
    label: "text-amber-300",
    badge: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  },
  {
    id: "bridge",
    number: "04",
    eyebrow: "Native USDC",
    title: "Bridge USDC across supported chains",
    summary:
      "Move native USDC between Arc Mainnet, Ethereum, Base, Arbitrum and Polygon through a reviewable two-step wallet flow.",
    steps: [
      "Choose the source chain, destination chain and USDC amount.",
      "In the first wallet prompt, approve exactly the amount you entered.",
      "In the second wallet prompt, confirm the bridge transfer.",
      "Keep the page open until Predarc displays Bridge success.",
    ],
    note: "MetaMask may describe the Circle contract as an unknown address on Arc. Verify the amount carefully; Predarc does not request an unlimited approval in this flow.",
    href: "/bridge",
    cta: "Open Bridge",
    accent: "border-sky-400/20 bg-sky-400/[0.06]",
    label: "text-sky-300",
    badge: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  },
  {
    id: "swap",
    number: "05",
    eyebrow: "Arc Mainnet assets",
    title: "Swap supported assets",
    summary:
      "Review a live Arc Mainnet route for supported assets before confirming the transaction in your wallet.",
    steps: [
      "Choose the input and output assets from USDC, EURC and cirBTC.",
      "Enter an amount and wait for the live quote.",
      "Review the amounts, route and displayed transaction details.",
      "Confirm in your wallet and wait for Predarc to display Swap success.",
    ],
    note: "Quotes can change with market conditions. Always review the final wallet prompt before signing.",
    href: "/swap",
    cta: "Open Swap",
    accent: "border-violet-400/20 bg-violet-400/[0.06]",
    label: "text-violet-300",
    badge: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  },
  {
    id: "agents",
    number: "06",
    eyebrow: "Optional automation",
    title: "Connect an AI agent",
    summary:
      "Authorize an external agent to make bounded server-points predictions without giving it access to your wallet funds, Bridge or Swap.",
    steps: [
      "Choose allowed markets, durations, per-prediction and daily limits, minimum confidence and an expiry.",
      "Approve the gas-free policy signature after checking every limit.",
      "Copy the API token when it appears and store it only in the agent's secure server-side secret store.",
      "Pause, resume or permanently revoke the connection from Predarc whenever needed.",
    ],
    note: "Predarc displays the token only once and stores only its hash. Never publish the token, commit it to Git or paste it into chat.",
    href: "/agents",
    cta: "Open AI Agents",
    accent: "border-blue-400/20 bg-blue-400/[0.06]",
    label: "text-blue-300",
    badge: "border-blue-400/25 bg-blue-400/10 text-blue-200",
  },
  {
    id: "receipts",
    number: "07",
    eyebrow: "Transaction evidence",
    title: "Verify a supported receipt",
    summary:
      "Use a transaction hash to inspect supported Arc transfer details in a clear receipt view.",
    steps: [
      "Copy the Arc transaction hash from your wallet or explorer.",
      "Open Payment Receipts and paste the complete hash.",
      "Review the status, sender, recipient, amount, block and timestamp shown by Predarc.",
    ],
    note: "A reverted, zero-value, contract-creation or unsupported calldata transaction is not shown as a valid payment receipt.",
    href: "/receipts",
    cta: "Check a Receipt",
    accent: "border-emerald-400/20 bg-emerald-400/[0.06]",
    label: "text-emerald-300",
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  },
  {
    id: "builders",
    number: "08",
    eyebrow: "Public discovery",
    title: "Explore public Arc projects",
    summary:
      "Builder Explorer organizes source-linked public GitHub signals without guessing private information or official community roles.",
    steps: [
      "Search with a public GitHub username, owner/repository or project name.",
      "Open the matched repositories and contribution evidence from their source links.",
      "Treat the results as public activity signals, not as an official ranking or role directory.",
    ],
    note: "Arc House status and Discord roles are not inferred when no reliable public or opt-in source is available.",
    href: "/builders",
    cta: "Open Builder Explorer",
    accent: "border-cyan-400/20 bg-cyan-400/[0.06]",
    label: "text-cyan-300",
    badge: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  },
] as const;

const SAFETY_CHECKS = [
  "Confirm that your wallet is connected to the intended account and network.",
  "Read the amount, asset and permission shown in every wallet prompt.",
  "Never share your seed phrase or private key with Predarc, an agent or anyone else.",
  "Keep agent API tokens in a secure server-side secret store and revoke exposed tokens.",
  "For a first Bridge or Swap, consider testing the flow with a small amount.",
] as const;

export default function GuidePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070b12] text-[#f4f7ff] selection:bg-orange-500/30">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-14rem] top-[-12rem] h-[38rem] w-[38rem] rounded-full bg-blue-600/[0.09] blur-[130px]" />
        <div className="absolute right-[-12rem] top-[3rem] h-[34rem] w-[34rem] rounded-full bg-orange-500/[0.08] blur-[120px]" />
      </div>

      <header className="relative z-20 border-b border-white/[0.08] bg-[#080d16]/92 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-[76px] max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <PredarcBrand compact />
          <nav
            aria-label="Guide navigation"
            className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-black uppercase tracking-[0.08em]"
          >
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/[0.025] px-4 py-2.5 text-gray-400 transition hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/arena"
              className="rounded-full border border-orange-300/30 bg-[#f05a21] px-4 py-2.5 text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.8)] transition hover:bg-[#ff6a2d]"
            >
              Launch Arena
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pb-12 pt-16 sm:px-6 lg:pb-16 lg:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Predarc Guide · Arc Mainnet
        </div>
        <h1 className="mt-7 max-w-5xl text-5xl font-black uppercase leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
          How to use
          <span className="block text-[#ff6630]">Predarc.</span>
        </h1>
        <p className="mt-7 max-w-3xl text-base leading-7 text-gray-400 sm:text-lg">
          Start with wallet sign-in, then follow the short guide for any Predarc
          feature you want to use. Each wallet action remains visible and under
          your control.
        </p>

        <div className="mt-9 flex flex-wrap gap-2">
          {FEATURE_GUIDES.map((guide) => (
            <a
              key={guide.id}
              href={`#${guide.id}`}
              className="rounded-full border border-white/[0.09] bg-white/[0.025] px-4 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              {guide.title}
            </a>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {QUICK_START.map((step) => (
            <article
              key={step.number}
              className="rounded-[1.6rem] border border-white/[0.08] bg-[#0d1420] p-6 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)]"
            >
              <span className="font-mono text-3xl font-black text-orange-300/60">
                {step.number}
              </span>
              <h2 className="mt-5 text-lg font-black">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.07] bg-[#0a101a]/92">
        <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-16 sm:px-6 lg:py-24">
          {FEATURE_GUIDES.map((guide) => (
            <article
              key={guide.id}
              id={guide.id}
              className={`scroll-mt-24 rounded-[2rem] border p-6 shadow-[4px_4px_0_0_rgba(255,255,255,0.09)] sm:p-8 lg:p-10 ${guide.accent}`}
            >
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl border font-mono text-sm font-black ${guide.badge}`}
                    >
                      {guide.number}
                    </span>
                    <p
                      className={`text-[9px] font-black uppercase tracking-[0.18em] ${guide.label}`}
                    >
                      {guide.eyebrow}
                    </p>
                  </div>
                  <h2 className="mt-6 text-2xl font-black tracking-tight sm:text-3xl">
                    {guide.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-gray-400">
                    {guide.summary}
                  </p>
                  <Link
                    href={guide.href}
                    className="mt-7 inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-[#f05a21] px-5 py-3 text-[10px] font-black uppercase tracking-[0.09em] text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.82)] transition hover:-translate-y-0.5 hover:bg-[#ff6a2d]"
                  >
                    {guide.cta}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>

                <div>
                  <ol className="space-y-3">
                    {guide.steps.map((step, index) => (
                      <li
                        key={step}
                        className="flex gap-3 rounded-2xl border border-white/[0.07] bg-black/10 p-4 text-sm leading-6 text-gray-300"
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${guide.badge}`}
                        >
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs leading-6 text-gray-500">
                    <span className={`font-black ${guide.label}`}>Remember: </span>
                    {guide.note}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:py-24">
        <div className="overflow-hidden rounded-[2rem] border border-orange-400/20 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_42%),linear-gradient(145deg,#111a2b,#0d1420)] p-7 shadow-[4px_4px_0_0_rgba(255,255,255,0.1)] sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">
            Before every wallet action
          </p>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.035em]">
            Quick safety check
          </h2>
          <ul className="mt-7 grid gap-3 md:grid-cols-2">
            {SAFETY_CHECKS.map((check) => (
              <li
                key={check}
                className="flex gap-3 rounded-2xl border border-white/[0.07] bg-black/10 p-4 text-sm leading-6 text-gray-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] font-black text-emerald-300"
                >
                  ✓
                </span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07] bg-[#080d15]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <PredarcBrand compact />
            <p className="mt-2 text-[10px] text-gray-600">
              Crypto forecasting and native stablecoin tools on Arc Mainnet.
            </p>
          </div>
          <nav
            aria-label="Guide footer navigation"
            className="flex flex-wrap gap-x-5 gap-y-3 text-[10px] font-bold text-gray-500"
          >
            <Link href="/" className="transition hover:text-white">
              Home
            </Link>
            <Link href="/arena" className="transition hover:text-white">
              Arena
            </Link>
            <Link href="/markets" className="transition hover:text-white">
              Community Markets
            </Link>
            <Link href="/bridge" className="transition hover:text-white">
              Bridge
            </Link>
            <Link href="/swap" className="transition hover:text-white">
              Swap
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
