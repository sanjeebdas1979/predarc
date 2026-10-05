"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import PredarcBrand from "@/app/components/brand/PredarcBrand";
import BuilderExplorerSearch, {
  BUILDER_EXPLORER_TRANSFER_KEY,
} from "@/app/components/builders/BuilderExplorerSearch";

type BuilderProject = {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  forks: number;
  pushedAt: string | null;
  topics: string[];
  evidence: string[];
};

type BuilderCommit = {
  repository: string;
  sha: string;
  message: string;
  occurredAt: string | null;
  url: string;
  fixRelated: boolean;
};

type BuilderContribution = {
  repository: string;
  number: number;
  title: string;
  url: string;
  kind: "pull-request" | "issue";
  state: "merged" | "open" | "closed";
  occurredAt: string | null;
  fixRelated: boolean;
};

type BuilderExplorerResult = {
  query: {
    kind: "email" | "github" | "project";
    label: string;
  };
  profile: {
    login: string;
    name: string;
    bio: string | null;
    url: string;
    publicRepositories: number;
    followers: number;
    joinedAt: string | null;
  };
  arcProjects: BuilderProject[];
  activity: {
    recentCommits: BuilderCommit[];
    recentCommitCount: number;
    fixRelatedCommitCount: number;
    contributions: BuilderContribution[];
    contributionSearchAvailable: boolean;
    publicContributionCount: number;
    mergedPullRequestCount: number;
    publicIssueCount: number;
    latestPublicActivityAt: string | null;
  };
  privacy: {
    publicSourcesOnly: boolean;
    queryStored: boolean;
    emailReturned: boolean;
    signedInPagesScraped: boolean;
  };
  sourceNotes: string[];
  observedAt: string;
};

function dateLabel(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return (parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "B");
}

export default function BuilderExplorerClient() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BuilderExplorerResult | null>(null);

  const runSearch = useCallback(async (nextQuery: string) => {
    setQuery(nextQuery);
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/builder-explorer", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: nextQuery }),
      });
      const payload = (await response.json()) as
        | BuilderExplorerResult
        | { error?: unknown };

      if (!response.ok) {
        throw new Error(
          typeof (payload as { error?: unknown }).error === "string"
            ? String((payload as { error: string }).error)
            : "Builder search failed."
        );
      }

      setResult(payload as BuilderExplorerResult);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Builder Explorer is temporarily unavailable."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const pending = sessionStorage.getItem(BUILDER_EXPLORER_TRANSFER_KEY);
    if (!pending) return;

    sessionStorage.removeItem(BUILDER_EXPLORER_TRANSFER_KEY);
    const timer = window.setTimeout(() => {
      void runSearch(pending);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [runSearch]);

  return (
    <main className="min-h-screen bg-[#070b12] text-[#f4f7ff] selection:bg-blue-500/30">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12rem] top-[-12rem] h-[36rem] w-[36rem] rounded-full bg-blue-600/[0.09] blur-[125px]" />
        <div className="absolute right-[-10rem] top-[8rem] h-[32rem] w-[32rem] rounded-full bg-orange-500/[0.07] blur-[120px]" />
      </div>

      <header className="relative z-20 border-b border-white/[0.08] bg-[#080d16]/92 backdrop-blur-2xl">
        <div className="mx-auto flex h-[76px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <PredarcBrand compact />
          <nav
            aria-label="Arc Project Explorer navigation"
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.08em]"
          >
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/[0.025] px-4 py-2.5 text-gray-400 transition hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/arena"
              className="rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-4 py-2.5 text-white"
            >
              Arena
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:py-16">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-blue-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Public GitHub evidence
          </div>
          <h1 className="mt-6 text-4xl font-black uppercase leading-[0.95] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            Discover
            <span className="block text-blue-300">Arc projects.</span>
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-gray-400 sm:text-base">
            Search public GitHub evidence for projects building on Arc.
          </p>
        </div>

        <div className="mt-9">
          <BuilderExplorerSearch
            key={query || "empty-builder-query"}
            initialValue={query}
            variant="page"
            onSearch={runSearch}
            busy={busy}
          />
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {busy
            ? "Checking public GitHub sources."
            : error
              ? error
              : result
                ? `Public project result loaded for ${result.profile.name}.`
                : "Arc Project Explorer is ready."}
        </p>

        <div className="mt-8">
          {!busy && !error && !result && (
            <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-[1.8rem] border border-white/[0.08] bg-[#0d1420] p-7 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)]">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-300">
                  Start with a project
                </p>
                <h2 className="mt-3 text-2xl font-black">
                  Find evidence, not a project ranking
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                  Predarc surfaces observable GitHub evidence for projects
                  building on Arc without exposing private data or assigning a
                  score.
                </p>
                <button
                  type="button"
                  onClick={() => void runSearch("Predarc")}
                  className="mt-6 rounded-full border border-blue-400/25 bg-blue-400/[0.08] px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-100"
                >
                  Try the Predarc project
                </button>
              </div>

              <div className="rounded-[1.8rem] border border-emerald-400/15 bg-emerald-400/[0.045] p-7">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  GitHub signals
                </p>
                <ul className="mt-4 space-y-3 text-xs leading-5 text-gray-400">
                  <li>✓ Public GitHub profiles and repositories</li>
                  <li>✓ Explicit Arc and Circle project evidence</li>
                  <li>✓ Recent public push-event evidence</li>
                  <li>✓ Fix-related commit signals</li>
                </ul>
              </div>
            </section>
          )}

          {busy && (
            <div className="rounded-[1.6rem] border border-blue-400/15 bg-blue-400/[0.04] p-7 text-sm text-blue-100">
              Checking public sources and matching evidence…
            </div>
          )}

          {error && !busy && (
            <div
              role="alert"
              className="rounded-[1.6rem] border border-orange-400/20 bg-orange-400/[0.055] p-6 text-sm text-orange-100"
            >
              {error}
            </div>
          )}

          {result && !busy && (
            <div className="space-y-6">
              <section>
                <article className="rounded-[2rem] border border-white/[0.09] bg-[#0d1420] p-6 shadow-[4px_4px_0_0_rgba(255,255,255,0.1)] sm:p-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-xl font-black uppercase text-blue-100">
                      {initials(result.profile.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-300">
                          Public GitHub match
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.12em] text-gray-600">
                          {result.query.label}
                        </span>
                      </div>
                      <h2 className="mt-3 break-words text-2xl font-black sm:text-3xl">
                        {result.profile.name}
                      </h2>
                      <a
                        href={result.profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex text-sm font-bold text-blue-300 transition hover:text-white"
                      >
                        @{result.profile.login} ↗
                      </a>
                      {result.profile.bio && (
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400">
                          {result.profile.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Public repos", result.profile.publicRepositories],
                      ["Project matches", result.arcProjects.length],
                      [
                        "Merged PRs",
                        result.activity.contributionSearchAvailable
                          ? result.activity.mergedPullRequestCount
                          : "—",
                      ],
                      [
                        "Arc issues",
                        result.activity.contributionSearchAvailable
                          ? result.activity.publicIssueCount
                          : "—",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
                      >
                        <p className="font-mono text-2xl font-black text-white">
                          {value}
                        </p>
                        <p className="mt-2 text-xs font-extrabold uppercase tracking-[0.08em] text-gray-300 sm:text-sm">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-5 text-xs leading-5 text-gray-400">
                    Contribution counts use source-linked public GitHub records
                    from recognized Arc repositories—not lifetime totals.
                  </p>
                </article>

              </section>

              <section className="rounded-[2rem] border border-blue-400/15 bg-[#0b1527] p-6 sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300">
                      Public open-source activity
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      Arc contributions
                    </h2>
                  </div>
                  {result.activity.contributionSearchAvailable && (
                    <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-blue-200">
                      {result.activity.publicContributionCount} source-linked
                    </span>
                  )}
                </div>

                {!result.activity.contributionSearchAvailable ? (
                  <p className="mt-6 rounded-2xl border border-orange-400/15 bg-orange-400/[0.04] p-5 text-sm leading-6 text-orange-100">
                    GitHub contribution search is temporarily unavailable. The
                    project results above are still valid.
                  </p>
                ) : result.activity.contributions.length === 0 ? (
                  <p className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm leading-6 text-gray-500">
                    No authored merged pull requests or issues were found in the
                    recognized public Arc repositories checked by this MVP.
                  </p>
                ) : (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {result.activity.contributions.map((contribution) => (
                      <a
                        key={`${contribution.kind}-${contribution.repository}-${contribution.number}`}
                        href={contribution.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[1.5rem] border border-white/[0.08] bg-[#0a101a] p-5 transition hover:border-blue-400/25 hover:bg-blue-400/[0.035]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[9px] text-gray-600">
                            {contribution.repository} #{contribution.number}
                          </span>
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-300">
                            {contribution.kind === "pull-request"
                              ? "Merged PR"
                              : `${contribution.state} issue`}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-bold leading-6 text-gray-200">
                          {contribution.title} ↗
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[8px] text-gray-700">
                          <span>{dateLabel(contribution.occurredAt)}</span>
                          {contribution.fixRelated && (
                            <span className="font-black uppercase tracking-[0.1em] text-orange-300">
                              Fix-related signal
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[2rem] border border-white/[0.08] bg-[#0d1420] p-6 sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-300">
                      Matched public repositories
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      Project and Arc evidence
                    </h2>
                  </div>
                  <span className="text-[9px] text-gray-600">
                    Latest activity: {dateLabel(result.activity.latestPublicActivityAt)}
                  </span>
                </div>

                {result.arcProjects.length === 0 ? (
                  <p className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm leading-6 text-gray-500">
                    No repository with clear Arc evidence was found in the public
                    GitHub data. This is not evidence that the builder has no Arc
                    work.
                  </p>
                ) : (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {result.arcProjects.map((project) => (
                      <article
                        key={project.fullName}
                        className="rounded-[1.5rem] border border-white/[0.08] bg-[#0a101a] p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <a
                              href={project.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-words text-lg font-black text-white transition hover:text-blue-200"
                            >
                              {project.name} ↗
                            </a>
                            <p className="mt-1 break-all font-mono text-[9px] text-gray-700">
                              {project.fullName}
                            </p>
                          </div>
                          <div className="shrink-0 text-right text-[9px] text-gray-600">
                            <p>★ {project.stars}</p>
                            <p className="mt-1">⑂ {project.forks}</p>
                          </div>
                        </div>
                        {project.description && (
                          <p className="mt-4 text-xs leading-5 text-gray-500">
                            {project.description}
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {project.evidence.map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-blue-400/15 bg-blue-400/[0.055] px-2.5 py-1 text-[8px] font-bold text-blue-300"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                        <p className="mt-4 text-[9px] text-gray-700">
                          Updated {dateLabel(project.pushedAt)}
                          {project.language ? ` · ${project.language}` : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-[2rem] border border-white/[0.08] bg-[#0d1420] p-6 sm:p-8">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">
                    Recent public activity
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Recent push evidence</h2>
                  {result.activity.recentCommits.length === 0 ? (
                    <p className="mt-5 text-sm leading-6 text-gray-500">
                      No matching commit details appeared in GitHub&apos;s limited
                      recent public event window. Pull requests and issues are
                      reported separately above.
                    </p>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {result.activity.recentCommits.slice(0, 8).map((commit) => (
                        <a
                          key={`${commit.repository}-${commit.sha}`}
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-emerald-400/20 hover:bg-emerald-400/[0.035]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[9px] text-gray-600">
                              {commit.repository} · {commit.sha.slice(0, 7)}
                            </span>
                            {commit.fixRelated && (
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-300">
                                Fix signal
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-gray-300">
                            {commit.message}
                          </p>
                          <p className="mt-2 text-[8px] text-gray-700">
                            {dateLabel(commit.occurredAt)}
                          </p>
                        </a>
                      ))}
                    </div>
                  )}
                </article>

                <aside className="rounded-[2rem] border border-emerald-400/15 bg-emerald-400/[0.04] p-6 sm:p-8">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">
                    Source receipt
                  </p>
                  <h2 className="mt-2 text-xl font-black">What was checked</h2>
                  <ul className="mt-5 space-y-3 text-xs leading-5 text-gray-400">
                    {result.sourceNotes.map((note) => (
                      <li key={note} className="flex gap-2">
                        <span className="text-emerald-300">✓</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 border-t border-emerald-300/10 pt-5 text-[9px] leading-4 text-gray-600">
                    <p>Observed {dateLabel(result.observedAt)}</p>
                    <p className="mt-2">
                      Query stored: no · Public GitHub sources only · No project
                      ranking
                    </p>
                  </div>
                </aside>
              </section>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
