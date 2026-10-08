"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export const BUILDER_EXPLORER_TRANSFER_KEY =
  "predarc-builder-explorer-pending-query";

type BuilderExplorerSearchProps = {
  initialValue?: string;
  variant?: "landing" | "page";
  onSearch?: (query: string) => void | Promise<void>;
  busy?: boolean;
};

export default function BuilderExplorerSearch({
  initialValue = "",
  variant = "landing",
  onSearch,
  busy = false,
}: BuilderExplorerSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const [validationMessage, setValidationMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = query.trim().replace(/\s+/g, " ");
    if (normalized.length < 2 || normalized.length > 120) {
      setValidationMessage("Enter 2–120 characters to search public data.");
      return;
    }

    setValidationMessage("");

    if (onSearch) {
      await onSearch(normalized);
      return;
    }

    sessionStorage.setItem(BUILDER_EXPLORER_TRANSFER_KEY, normalized);
    router.push("/builders");
  }

  const isLanding = variant === "landing";

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isLanding
          ? "predarc-card-glide relative overflow-hidden rounded-[2rem] border border-blue-300/15 bg-[#0b1322]/95 p-5 shadow-[4px_4px_0_0_rgba(255,255,255,0.1)] sm:p-7"
          : "predarc-card-glide rounded-[1.6rem] border border-white/[0.09] bg-[#0d1420] p-4 shadow-[3px_3px_0_0_rgba(255,255,255,0.09)] sm:p-5"
      }
    >
      {isLanding && (
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/15 blur-[75px]" />
      )}

      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">
              Public GitHub discovery
            </p>
            <h2
              className={
                isLanding
                  ? "mt-2 text-2xl font-black tracking-tight sm:text-3xl"
                  : "mt-1 text-lg font-black"
              }
            >
              Discover an Arc project
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-gray-500 sm:text-sm">
              Search by project name, GitHub username, or owner/repository.
            </p>
          </div>
          {isLanding && (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">
              Public GitHub only
            </span>
          )}
        </div>

        <label
          htmlFor={isLanding ? "landing-builder-search" : "builder-search"}
          className="sr-only"
        >
          Search public Arc project data
        </label>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-blue-300"
            >
              ⌕
            </span>
            <input
              id={isLanding ? "landing-builder-search" : "builder-search"}
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Project name, @github-user, or owner/repository"
              className="w-full rounded-full border border-white/10 bg-[#080d16] py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-gray-700 focus:border-blue-400/45 focus:ring-2 focus:ring-blue-400/15"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-full border border-purple-400/40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-7 py-3.5 text-xs font-black uppercase tracking-[0.09em] text-white shadow-[3px_3px_0_0_rgba(0,0,0,0.85)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? "Checking sources…" : "Explore Project"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] leading-4 text-gray-600">
          <span>Uses public GitHub profiles, repositories and recent events.</span>
          <span className="font-bold uppercase tracking-[0.1em] text-gray-500">
            No private data · No ranking
          </span>
        </div>

        {validationMessage && (
          <p role="alert" className="mt-3 text-xs text-orange-300">
            {validationMessage}
          </p>
        )}
      </div>
    </form>
  );
}
