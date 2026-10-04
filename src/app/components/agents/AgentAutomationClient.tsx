"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";

import PredarcSessionCard from "@/app/components/auth/PredarcSessionCard";
import PredarcBrand from "@/app/components/brand/PredarcBrand";
import { usePredarcSession } from "@/app/components/providers/PredarcSessionProvider";
import {
  AGENT_AUTOMATION_DURATIONS,
  AGENT_AUTOMATION_MARKETS,
  buildAgentAuthorizationTypedData,
  normalizeAgentAutomationPolicy,
  parseAgentConnectionsResponse,
  type AgentAutomationDuration,
  type AgentAutomationMarket,
  type AgentConnection,
} from "@/lib/agent-automation-core";
import { forecastChainId, forecastNetworkLabel } from "@/lib/forecast-network";

type MessageTone = "info" | "success" | "error";

const DURATION_LABELS: Record<AgentAutomationDuration, string> = {
  60: "1 minute",
  300: "5 minutes",
  900: "15 minutes",
  3600: "1 hour",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const lower = error.message.toLowerCase();
  if (lower.includes("rejected") || lower.includes("denied")) {
    return "Agent authorization was cancelled in your wallet.";
  }

  return error.message.length < 220 ? error.message : fallback;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortWallet(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function buildAgentConfigExample(token: string, origin: string): string {
  return JSON.stringify(
    {
      endpoint: `${origin}/api/agents/predictions`,
      authorization: `Bearer ${token}`,
      method: "POST",
      body: {
        requestId: "GENERATE_A_NEW_UUID_FOR_EACH_REQUEST",
        market: "BTC",
        direction: "higher",
        points: 25,
        durationSeconds: 300,
        confidence: 78,
        rationale: "Optional short explanation",
      },
    },
    null,
    2
  );
}

export default function AgentAutomationClient() {
  const { session, isSignedIn } = usePredarcSession();
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [agentName, setAgentName] = useState("Predarc Copilot");
  const [markets, setMarkets] = useState<AgentAutomationMarket[]>([
    "BTC",
    "ETH",
  ]);
  const [durations, setDurations] = useState<AgentAutomationDuration[]>([
    60,
    300,
  ]);
  const [maxPoints, setMaxPoints] = useState("25");
  const [maxDailyPoints, setMaxDailyPoints] = useState("100");
  const [maxDailyPredictions, setMaxDailyPredictions] = useState("5");
  const [minimumConfidence, setMinimumConfidence] = useState("70");
  const [expiryDays, setExpiryDays] = useState("7");
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [newToken, setNewToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const walletConnector =
    connectors.find((connector) =>
      connector.name.toLowerCase().includes("metamask")
    ) ?? connectors[0];

  const loadConnections = useCallback(async () => {
    if (!isSignedIn) {
      setConnections([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/agents", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(responseError(result, "Unable to load AI agents."));
      }

      const parsed = parseAgentConnectionsResponse(result);
      if (!parsed) throw new Error("Predarc returned an unexpected response.");

      setConnections(parsed);
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Unable to load AI agents."));
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadConnections();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadConnections]);

  function toggleMarket(market: AgentAutomationMarket) {
    setMarkets((current) =>
      current.includes(market)
        ? current.filter((item) => item !== market)
        : [...current, market]
    );
  }

  function toggleDuration(duration: AgentAutomationDuration) {
    setDurations((current) =>
      current.includes(duration)
        ? current.filter((item) => item !== duration)
        : [...current, duration]
    );
  }

  async function createConnection() {
    setMessage("");
    setNewToken("");

    if (!isSignedIn || !session) {
      setMessageTone("error");
      setMessage("Connect your wallet and sign in to Predarc first.");
      return;
    }

    const policy = normalizeAgentAutomationPolicy({
      name: agentName,
      allowedMarkets: markets,
      allowedDurations: durations,
      maxPointsPerPrediction: Number(maxPoints),
      maxDailyPoints: Number(maxDailyPoints),
      maxDailyPredictions: Number(maxDailyPredictions),
      minimumConfidence: Number(minimumConfidence),
      expiresAt: new Date(
        Date.now() + Number(expiryDays) * 24 * 60 * 60_000
      ).toISOString(),
    });

    if (!policy) {
      setMessageTone("error");
      setMessage(
        "Review the policy: choose at least one market and duration, keep the daily cap above the per-prediction cap, and use valid whole numbers."
      );
      return;
    }

    setIsCreating(true);
    try {
      const challengeResponse = await fetch("/api/agents/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const challenge = await readJson(challengeResponse);

      if (
        !challengeResponse.ok ||
        !isRecord(challenge) ||
        typeof challenge.challengeId !== "string" ||
        typeof challenge.nonce !== "string"
      ) {
        throw new Error(
          responseError(challenge, "Unable to prepare agent authorization.")
        );
      }

      const typedData = buildAgentAuthorizationTypedData({
        wallet: session.wallet,
        chainId: session.chainId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        policy,
      });
      const signature = await signTypedDataAsync(typedData);
      const createResponse = await fetch("/api/agents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          policy,
          signature,
        }),
      });
      const result = await readJson(createResponse);

      if (
        !createResponse.ok ||
        !isRecord(result) ||
        typeof result.token !== "string"
      ) {
        throw new Error(responseError(result, "Unable to connect this agent."));
      }

      setNewToken(result.token);
      setMessageTone("success");
      setMessage(
        "AI agent connected. Save the token now—it will not be shown again."
      );
      await loadConnections();
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Unable to connect this agent."));
    } finally {
      setIsCreating(false);
    }
  }

  async function updateConnection(
    connectionId: string,
    action: "pause" | "resume" | "revoke"
  ) {
    if (action === "revoke") {
      const confirmed = window.confirm(
        "Revoke this agent permanently? Its API token will stop working immediately."
      );
      if (!confirmed) return;
    }

    setUpdatingId(connectionId);
    setMessage("");
    try {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, action }),
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(responseError(result, "Unable to update this agent."));
      }

      setMessageTone("success");
      setMessage(
        action === "pause"
          ? "Agent paused."
          : action === "resume"
            ? "Agent resumed."
            : "Agent revoked permanently."
      );
      await loadConnections();
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Unable to update this agent."));
    } finally {
      setUpdatingId("");
    }
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessageTone("success");
      setMessage(successMessage);
    } catch {
      setMessageTone("error");
      setMessage("Copy failed. Select and copy the value manually.");
    }
  }

  return (
    <main className="min-h-screen bg-[#070b12] text-white">
      <header className="border-b border-white/10 bg-[#0b1017]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <PredarcBrand />
          <nav className="flex flex-wrap items-center gap-4 text-sm font-bold text-orange-300">
            <Link href="/arena" className="hover:text-white">Arena</Link>
            <Link href="/markets" className="hover:text-white">Markets</Link>
            <Link href="/bridge" className="hover:text-white">Bridge</Link>
            <Link href="/swap" className="hover:text-white">Swap</Link>
          </nav>
          {!isConnected ? (
            <button
              type="button"
              disabled={!walletConnector || isConnecting}
              onClick={() =>
                walletConnector && connect({ connector: walletConnector })
              }
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400 disabled:opacity-50"
            >
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          ) : chainId !== forecastChainId ? (
            <button
              type="button"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: forecastChainId })}
              className="rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50"
            >
              {isSwitching ? "Switching…" : `Switch to ${forecastNetworkLabel}`}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-xs font-bold text-emerald-300">
                {address ? shortWallet(address) : "Connected"}
              </span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-gray-300 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <section className="overflow-hidden rounded-[2rem] border border-violet-400/20 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_42%),linear-gradient(135deg,#101725,#0b1018)] p-6 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">
            Optional · Wallet-authorized
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
            Connect your AI agent and automate predictions.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-gray-300 sm:text-lg">
            Set strict markets, timeframes, confidence, spending limits and an
            expiry. Your agent can then submit server-points predictions inside
            that policy—without receiving your wallet key.
          </p>
          <div className="mt-7 grid gap-3 text-sm text-gray-300 sm:grid-cols-3">
            {[
              "Gas-free policy signature",
              "Pause or revoke anytime",
              "Manual prediction flow stays unchanged",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <span className="mr-2 text-emerald-300">✓</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6">
          <PredarcSessionCard feature="AI agent automation" />
        </div>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.75fr)]">
          <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                  New connection
                </p>
                <h2 className="mt-2 text-2xl font-black">Set the safety policy</h2>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1 text-xs font-bold text-emerald-300">
                Server points only
              </span>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-bold text-gray-200">Agent name</span>
                <input
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  maxLength={40}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none transition focus:border-violet-400/60"
                />
              </label>

              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-bold text-gray-200">Allowed markets</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AGENT_AUTOMATION_MARKETS.map((market) => (
                    <button
                      key={market}
                      type="button"
                      aria-pressed={markets.includes(market)}
                      onClick={() => toggleMarket(market)}
                      className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                        markets.includes(market)
                          ? "border-orange-400/50 bg-orange-400/15 text-orange-200"
                          : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                      }`}
                    >
                      {market}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-bold text-gray-200">Allowed durations</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AGENT_AUTOMATION_DURATIONS.map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      aria-pressed={durations.includes(duration)}
                      onClick={() => toggleDuration(duration)}
                      className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                        durations.includes(duration)
                          ? "border-blue-400/50 bg-blue-400/15 text-blue-200"
                          : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                      }`}
                    >
                      {DURATION_LABELS[duration]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {[
                ["Max points per prediction", maxPoints, setMaxPoints, "10"],
                ["Max points per day", maxDailyPoints, setMaxDailyPoints, "10"],
                ["Max predictions per day", maxDailyPredictions, setMaxDailyPredictions, "1"],
                ["Minimum confidence (%)", minimumConfidence, setMinimumConfidence, "50"],
              ].map(([label, value, setter, minimum]) => (
                <label key={label as string}>
                  <span className="text-sm font-bold text-gray-200">{label as string}</span>
                  <input
                    type="number"
                    min={minimum as string}
                    step="1"
                    value={value as string}
                    onChange={(event) =>
                      (setter as (next: string) => void)(event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none transition focus:border-violet-400/60"
                  />
                </label>
              ))}

              <label className="sm:col-span-2">
                <span className="text-sm font-bold text-gray-200">Authorization expires</span>
                <select
                  value={expiryDays}
                  onChange={(event) => setExpiryDays(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none transition focus:border-violet-400/60"
                >
                  <option value="1">After 1 day</option>
                  <option value="7">After 7 days</option>
                  <option value="14">After 14 days</option>
                  <option value="30">After 30 days</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={!isSignedIn || isCreating}
              onClick={() => void createConnection()}
              className="predarc-gradient-button mt-7 w-full disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isCreating
                ? "Check your wallet…"
                : "Connect AI agent with these limits"}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-gray-500">
              This signs a policy message only. It does not approve a token or
              expose your private key.
            </p>
          </section>

          <aside className="space-y-6">
            {newToken ? (
              <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
                  Save now · shown once
                </p>
                <h2 className="mt-2 text-xl font-black">Agent API token</h2>
                <p className="mt-2 text-sm leading-6 text-gray-300">
                  Treat this token like a password. Do not post it, screenshot
                  it or put it in browser code.
                </p>
                <textarea
                  readOnly
                  value={newToken}
                  rows={3}
                  className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-emerald-100"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => void copyText(newToken, "Agent token copied.")}
                    className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-[#06110c]"
                  >
                    Copy token
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        buildAgentConfigExample(
                          newToken,
                          window.location.origin
                        ),
                        "Agent configuration copied."
                      )
                    }
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Copy config example
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">
                Safety boundary
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-300">
                <li>• No seed phrase or wallet private key is shared.</li>
                <li>• Bridge, Swap and wallet funds are outside this permission.</li>
                <li>• Every request is checked against your signed limits.</li>
                <li>• Revoke instantly if a token may be exposed.</li>
              </ul>
            </section>
          </aside>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#0d121a] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
                Connections
              </p>
              <h2 className="mt-2 text-2xl font-black">Your authorized agents</h2>
            </div>
            <button
              type="button"
              disabled={!isSignedIn || isLoading}
              onClick={() => void loadConnections()}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {connections.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-gray-500">
              {isSignedIn
                ? "No AI agents connected yet."
                : "Sign in to view your AI agent connections."}
            </p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {connections.map((connection) => (
                <article
                  key={connection.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{connection.name}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Expires {shortDate(connection.expiresAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black capitalize ${
                        connection.status === "active"
                          ? "bg-emerald-400/15 text-emerald-300"
                          : connection.status === "paused"
                            ? "bg-amber-400/15 text-amber-300"
                            : "bg-red-400/15 text-red-300"
                      }`}
                    >
                      {connection.status}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/[0.035] p-3">
                      <dt className="text-xs text-gray-500">Today</dt>
                      <dd className="mt-1 font-bold">
                        {connection.dailyPredictionsUsed}/{connection.maxDailyPredictions} predictions
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white/[0.035] p-3">
                      <dt className="text-xs text-gray-500">Points today</dt>
                      <dd className="mt-1 font-bold">
                        {connection.dailyPointsUsed}/{connection.maxDailyPoints}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-gray-400">
                    {connection.allowedMarkets.join(" · ")} · {connection.allowedDurations.map((duration) => DURATION_LABELS[duration]).join(" · ")} · {connection.minimumConfidence}% confidence minimum
                  </p>
                  {connection.status === "active" ? (
                    <button
                      type="button"
                      disabled={updatingId === connection.id}
                      onClick={() => void updateConnection(connection.id, "pause")}
                      className="mt-4 rounded-xl border border-amber-400/30 px-4 py-2 text-xs font-bold text-amber-200 disabled:opacity-50"
                    >
                      Pause
                    </button>
                  ) : connection.status === "paused" ? (
                    <button
                      type="button"
                      disabled={updatingId === connection.id}
                      onClick={() => void updateConnection(connection.id, "resume")}
                      className="mt-4 rounded-xl border border-emerald-400/30 px-4 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                    >
                      Resume
                    </button>
                  ) : null}
                  {connection.status !== "revoked" ? (
                    <button
                      type="button"
                      disabled={updatingId === connection.id}
                      onClick={() => void updateConnection(connection.id, "revoke")}
                      className="ml-2 mt-4 rounded-xl border border-red-400/30 px-4 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={`mt-6 rounded-2xl border p-4 text-sm ${
              messageTone === "success"
                ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200"
                : messageTone === "error"
                  ? "border-red-400/25 bg-red-400/[0.06] text-red-200"
                  : "border-blue-400/25 bg-blue-400/[0.06] text-blue-200"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
