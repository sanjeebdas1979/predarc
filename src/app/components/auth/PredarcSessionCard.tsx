"use client";

import { useAccount } from "wagmi";

import { usePredarcSession } from "../providers/PredarcSessionProvider";

function shortenAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function PredarcSessionCard({
  feature,
}: {
  feature?: string;
}) {
  const { isConnected } = useAccount();
  const {
    session,
    status,
    message,
    isBusy,
    isAuthenticated,
    isSignedIn,
    hasWalletMismatch,
    signIn,
    signOut,
    refreshSession,
  } = usePredarcSession();

  const shell = feature
    ? "predarc-card-glide rounded-2xl border border-white/10 bg-black/20 p-4"
    : "predarc-card-glide w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center";

  if (status === "checking") {
    return (
      <div className={shell} role="status" aria-live="polite">
        <p className="text-sm font-bold text-gray-200">
          Checking Predarc sign-in…
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return feature ? (
      <div className={shell} role="status">
        <p className="text-sm font-bold text-orange-200">
          Connect your wallet to continue
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-400">
          Then sign one gas-free Predarc login message to activate {feature}.
        </p>
      </div>
    ) : null;
  }

  if (hasWalletMismatch && session) {
    return (
      <div className={shell} role="status" aria-live="polite">
        <p className="text-sm font-bold text-amber-300">
          Different wallet signed in
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-400">
          This browser session belongs to {shortenAddress(session.wallet)}.
          Sign out before using the connected wallet.
        </p>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void signOut()}
          className="mt-3 rounded-xl border border-amber-400/30 px-4 py-2 text-xs font-bold text-amber-200 transition hover:border-amber-300 disabled:opacity-50"
        >
          {isBusy ? "Signing out…" : "Sign out current session"}
        </button>
        {message ? (
          <p className="mt-2 text-xs text-orange-100">{message}</p>
        ) : null}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={shell} role="status" aria-live="polite">
        <p className="text-sm font-bold text-orange-300">
          {feature ? `Sign in to activate ${feature}` : "Step 1 · Sign in to Predarc"}
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-400">
          One wallet message only—no gas fee, payment or token approval.
          Your server points load automatically, and the active session stays
          signed in until you sign out.
        </p>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void signIn()}
          className="predarc-gradient-button mt-3 w-full px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {isBusy ? "Check your wallet…" : "Sign in to Predarc"}
        </button>
        {status === "error" ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void refreshSession()}
            className="mt-2 text-xs font-semibold text-sky-300 underline decoration-dashed underline-offset-4 disabled:opacity-50"
          >
            Retry session check
          </button>
        ) : null}
        {message ? (
          <p className="mt-2 text-xs leading-5 text-orange-100">{message}</p>
        ) : null}
      </div>
    );
  }

  if (!isSignedIn || !session) return null;

  return (
    <div
      className={`${shell} border-emerald-400/25 bg-emerald-400/[0.06]`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={feature ? "text-left" : "text-center sm:text-left"}>
          <p className="text-sm font-bold text-emerald-300">
            ✓ Signed in to Predarc
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {shortenAddress(session.wallet)}
            {feature ? ` · ${feature} active` : " · Server points ready"}
          </p>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void signOut()}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
        >
          {isBusy ? "Please wait…" : "Sign out"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-xs leading-5 text-emerald-100/80">{message}</p>
      ) : null}
    </div>
  );
}
