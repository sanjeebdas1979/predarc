import { NextRequest, NextResponse } from "next/server";

import {
  arcRepositoryEvidence,
  isArcRepository,
  isFixRelatedCommit,
  normalizeBuilderExplorerQuery,
  PUBLIC_ARC_CONTRIBUTION_REPOSITORIES,
  safePublicUrl,
  type BuilderExplorerQuery,
} from "@/lib/builder-explorer-core";
import { requestOriginAllowed } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_API_ROOT = "https://api.github.com";
const MAX_REPOSITORIES = 6;
const MAX_PUBLIC_EVENTS = 100;
const MAX_PUBLIC_CONTRIBUTIONS = 20;

type GitHubUser = {
  login?: unknown;
  name?: unknown;
  bio?: unknown;
  email?: unknown;
  html_url?: unknown;
  public_repos?: unknown;
  followers?: unknown;
  created_at?: unknown;
};

type GitHubRepository = {
  name?: unknown;
  full_name?: unknown;
  description?: unknown;
  html_url?: unknown;
  language?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  pushed_at?: unknown;
  archived?: unknown;
  fork?: unknown;
  topics?: unknown;
  owner?: {
    login?: unknown;
  } | null;
};

type GitHubSearchResponse<T> = {
  items?: T[];
};

type GitHubContributionSearchItem = {
  number?: unknown;
  title?: unknown;
  html_url?: unknown;
  repository_url?: unknown;
  state?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  closed_at?: unknown;
  pull_request?: unknown;
};

type GitHubPublicEvent = {
  type?: unknown;
  created_at?: unknown;
  repo?: {
    name?: unknown;
  } | null;
  payload?: {
    commits?: Array<{
      sha?: unknown;
      message?: unknown;
    }>;
  } | null;
};

type PublicArcContribution = {
  repository: string;
  number: number;
  title: string;
  url: string;
  kind: "pull-request" | "issue";
  state: "merged" | "open" | "closed";
  occurredAt: string | null;
  fixRelated: boolean;
};

class GitHubPublicDataError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "GitHubPublicDataError";
    this.status = status;
  }
}
function jsonReply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  });
}

function githubHeaders() {
  const token = process.env.PREDARC_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Predarc-Builder-Explorer",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function githubRequest<T>(path: string, allowNotFound = false) {
  const response = await fetch(`${GITHUB_API_ROOT}${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (allowNotFound && response.status === 404) return null;

  if (response.status === 403 || response.status === 429) {
    throw new GitHubPublicDataError(
      "GitHub public-data capacity is temporarily limited.",
      503
    );
  }

  if (!response.ok) {
    throw new GitHubPublicDataError(
      `GitHub public-data request failed with ${response.status}.`,
      response.status >= 500 ? 503 : 502
    );
  }

  return (await response.json()) as T;
}

function cleanString(value: unknown, maxLength = 240) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return new Date(value).toISOString();
}

function repositoryFullName(repository: GitHubRepository) {
  return cleanString(repository.full_name, 180);
}

function repositoryOwner(repository: GitHubRepository) {
  return cleanString(repository.owner?.login, 39);
}

async function resolveEmailOwner(query: BuilderExplorerQuery) {
  const search = new URLSearchParams({
    q: `${query.normalized} in:email type:user`,
    per_page: "5",
  });
  const result = await githubRequest<GitHubSearchResponse<GitHubUser>>(
    `/search/users?${search.toString()}`
  );
  const candidates = (result?.items ?? [])
    .map((candidate) => cleanString(candidate.login, 39))
    .filter((login): login is string => Boolean(login))
    .slice(0, 5);

  const profiles = await Promise.all(
    candidates.map((login) =>
      githubRequest<GitHubUser>(`/users/${encodeURIComponent(login)}`, true)
    )
  );

  const exact = profiles.find(
    (profile) =>
      cleanString(profile?.email, 120)?.toLowerCase() === query.normalized
  );

  return cleanString(exact?.login, 39);
}

async function resolveProjectOwner(query: BuilderExplorerQuery) {
  if (query.repository) {
    const repository = await githubRequest<GitHubRepository>(
      `/repos/${encodeURIComponent(query.repository.owner)}/${encodeURIComponent(
        query.repository.name
      )}`,
      true
    );

    return repository
      ? {
          login: repositoryOwner(repository),
          repository,
        }
      : null;
  }

  const search = new URLSearchParams({
    q: `${query.normalized} in:name fork:false`,
    sort: "updated",
    order: "desc",
    per_page: "10",
  });
  const result = await githubRequest<GitHubSearchResponse<GitHubRepository>>(
    `/search/repositories?${search.toString()}`
  );
  const repositories = result?.items ?? [];
  const exact = repositories.find(
    (repository) =>
      cleanString(repository.name, 100)?.toLowerCase() ===
      query.normalized.toLowerCase()
  );
  const fallback = repositories.find((repository) => isArcRepository(repository));
  const repository = exact ?? fallback;

  return repository
    ? {
        login: repositoryOwner(repository),
        repository,
      }
    : null;
}

async function resolveSearchOwner(query: BuilderExplorerQuery) {
  if (query.kind === "github") {
    return {
      login: query.githubUsername ?? null,
      repository: null,
    };
  }

  if (query.kind === "email") {
    return {
      login: await resolveEmailOwner(query),
      repository: null,
    };
  }

  return resolveProjectOwner(query);
}

function uniqueRepositories(repositories: GitHubRepository[]) {
  const seen = new Set<string>();

  return repositories.filter((repository) => {
    const fullName = repositoryFullName(repository)?.toLowerCase();
    if (!fullName || seen.has(fullName)) return false;

    seen.add(fullName);
    return true;
  });
}

function publicRepository(repository: GitHubRepository, selected: boolean) {
  const url = safePublicUrl(repository.html_url, ["github.com", "www.github.com"]);
  const fullName = repositoryFullName(repository);
  const name = cleanString(repository.name, 100);

  if (!url || !fullName || !name) return null;

  const topics = Array.isArray(repository.topics)
    ? repository.topics
        .filter((topic): topic is string => typeof topic === "string")
        .slice(0, 8)
    : [];
  const evidence = arcRepositoryEvidence(repository);

  if (selected) evidence.unshift("Exact project match");

  return {
    name,
    fullName,
    description: cleanString(repository.description, 280),
    url,
    language: cleanString(repository.language, 40),
    stars: cleanNumber(repository.stargazers_count),
    forks: cleanNumber(repository.forks_count),
    pushedAt: cleanDate(repository.pushed_at),
    topics,
    evidence: [...new Set(evidence)].slice(0, 6),
  };
}

function publicCommitActivity(
  events: GitHubPublicEvent[],
  repositoryNames: Set<string>
) {
  const commits: Array<{
    repository: string;
    sha: string;
    message: string;
    occurredAt: string | null;
    url: string;
    fixRelated: boolean;
  }> = [];

  for (const event of events) {
    if (event.type !== "PushEvent") continue;

    const repository = cleanString(event.repo?.name, 180);
    if (!repository || !repositoryNames.has(repository.toLowerCase())) continue;

    const occurredAt = cleanDate(event.created_at);

    for (const commit of event.payload?.commits ?? []) {
      const sha = cleanString(commit.sha, 40);
      const message = cleanString(commit.message, 180);

      if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha) || !message) continue;

      commits.push({
        repository,
        sha,
        message,
        occurredAt,
        url: `https://github.com/${repository}/commit/${sha}`,
        fixRelated: isFixRelatedCommit(message),
      });
    }
  }

  return commits.slice(0, 20);
}

function repositoryFromApiUrl(value: unknown) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.github.com" ||
      segments.length !== 3 ||
      segments[0] !== "repos" ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(segments[1]) ||
      !/^[a-z\d._-]{1,100}$/i.test(segments[2])
    ) {
      return null;
    }

    return {
      name: segments[2],
      fullName: `${segments[1]}/${segments[2]}`,
    };
  } catch {
    return null;
  }
}

function publicArcContribution(
  item: GitHubContributionSearchItem,
  kind: PublicArcContribution["kind"]
) {
  const repository = repositoryFromApiUrl(item.repository_url);
  const number = cleanNumber(item.number);
  const title = cleanString(item.title, 180);
  const url = safePublicUrl(item.html_url, ["github.com", "www.github.com"]);

  if (
    !repository ||
    number < 1 ||
    !title ||
    !url ||
    !isArcRepository({
      name: repository.name,
      full_name: repository.fullName,
    })
  ) {
    return null;
  }

  const issueState = cleanString(item.state, 20)?.toLowerCase();
  if (kind === "issue" && !["open", "closed"].includes(issueState ?? "")) {
    return null;
  }

  return {
    repository: repository.fullName,
    number,
    title,
    url,
    kind,
    state:
      kind === "pull-request"
        ? ("merged" as const)
        : issueState === "open"
          ? ("open" as const)
          : ("closed" as const),
    occurredAt:
      cleanDate(item.closed_at) ??
      cleanDate(item.updated_at) ??
      cleanDate(item.created_at),
    fixRelated: isFixRelatedCommit(title),
  } satisfies PublicArcContribution;
}

async function publicArcContributions(login: string) {
  const repositories = PUBLIC_ARC_CONTRIBUTION_REPOSITORIES.map(
    (repository) => `repo:${repository}`
  ).join(" ");
  const mergedPullRequestSearch = new URLSearchParams({
    q: `author:${login} ${repositories} is:pull-request is:merged`,
    sort: "updated",
    order: "desc",
    per_page: "30",
  });
  const issueSearch = new URLSearchParams({
    q: `author:${login} ${repositories} is:issue`,
    sort: "updated",
    order: "desc",
    per_page: "30",
  });

  try {
    const [pullRequests, issues] = await Promise.all([
      githubRequest<GitHubSearchResponse<GitHubContributionSearchItem>>(
        `/search/issues?${mergedPullRequestSearch.toString()}`
      ),
      githubRequest<GitHubSearchResponse<GitHubContributionSearchItem>>(
        `/search/issues?${issueSearch.toString()}`
      ),
    ]);
    const candidates = [
      ...(pullRequests?.items ?? [])
        .filter((item) => item.pull_request !== null && item.pull_request !== undefined)
        .map((item) => publicArcContribution(item, "pull-request")),
      ...(issues?.items ?? [])
        .filter((item) => item.pull_request === null || item.pull_request === undefined)
        .map((item) => publicArcContribution(item, "issue")),
    ]
      .filter(
        (item): item is PublicArcContribution => item !== null
      )
      .sort((left, right) =>
        (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "")
      );
    const seen = new Set<string>();
    const contributions = candidates.filter((item) => {
      const key = `${item.kind}:${item.repository.toLowerCase()}:${item.number}`;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    return {
      available: true,
      contributions: contributions.slice(0, MAX_PUBLIC_CONTRIBUTIONS),
    };
  } catch (error) {
    console.warn("Builder Explorer contribution search unavailable", {
      message: error instanceof Error ? error.message : "Unknown GitHub error",
    });

    return {
      available: false,
      contributions: [] as PublicArcContribution[],
    };
  }
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return jsonReply({ error: "Request origin is not allowed." }, 403);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonReply({ error: "Enter a public builder search." }, 400);
  }

  const query = normalizeBuilderExplorerQuery(
    typeof body === "object" && body !== null && "query" in body
      ? (body as { query?: unknown }).query
      : null
  );

  if (!query) {
    return jsonReply(
      {
        error:
          "Use a public email, @GitHub username, GitHub repository or Arc project name.",
      },
      400
    );
  }

  try {
    const resolved = await resolveSearchOwner(query);
    const login = cleanString(resolved?.login, 39);

    if (!login) {
      return jsonReply(
        {
          error:
            "No exact public profile match was found. Try @GitHubUsername or owner/repository.",
        },
        404
      );
    }

    const [profile, repositories, events] = await Promise.all([
      githubRequest<GitHubUser>(`/users/${encodeURIComponent(login)}`, true),
      githubRequest<GitHubRepository[]>(
        `/users/${encodeURIComponent(login)}/repos?sort=pushed&direction=desc&per_page=100`
      ),
      githubRequest<GitHubPublicEvent[]>(
        `/users/${encodeURIComponent(login)}/events/public?per_page=${MAX_PUBLIC_EVENTS}`
      ),
    ]);

    const profileLogin = cleanString(profile?.login, 39);
    const profileUrl = safePublicUrl(profile?.html_url, [
      "github.com",
      "www.github.com",
    ]);

    if (!profile || !profileLogin || !profileUrl) {
      return jsonReply({ error: "The public GitHub profile was not found." }, 404);
    }

    const contributionResult = await publicArcContributions(profileLogin);

    const selectedFullName = repositoryFullName(resolved?.repository ?? {})?.toLowerCase();
    const candidates = uniqueRepositories([
      ...(resolved?.repository ? [resolved.repository] : []),
      ...(repositories ?? []).filter(
        (repository) =>
          repository.archived !== true &&
          repository.fork !== true &&
          isArcRepository(repository)
      ),
    ]).slice(0, MAX_REPOSITORIES);
    const publicRepositories = candidates
      .map((repository) =>
        publicRepository(
          repository,
          repositoryFullName(repository)?.toLowerCase() === selectedFullName
        )
      )
      .filter((repository): repository is NonNullable<typeof repository> =>
        Boolean(repository)
      );
    const repositoryNames = new Set(
      publicRepositories.map((repository) => repository.fullName.toLowerCase())
    );
    const recentCommits = publicCommitActivity(events ?? [], repositoryNames);
    const latestRepositoryActivity = publicRepositories
      .map((repository) => repository.pushedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const latestCommitActivity = recentCommits
      .map((commit) => commit.occurredAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const latestContributionActivity = contributionResult.contributions
      .map((contribution) => contribution.occurredAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return jsonReply({
      query: {
        kind: query.kind,
        label: query.kind === "email" ? "Public email match" : query.normalized,
      },
      profile: {
        login: profileLogin,
        name: cleanString(profile.name, 100) ?? profileLogin,
        bio: cleanString(profile.bio, 280),
        url: profileUrl,
        publicRepositories: cleanNumber(profile.public_repos),
        followers: cleanNumber(profile.followers),
        joinedAt: cleanDate(profile.created_at),
      },
      arcProjects: publicRepositories,
      activity: {
        recentCommits,
        recentCommitCount: recentCommits.length,
        fixRelatedCommitCount: recentCommits.filter((commit) => commit.fixRelated)
          .length,
        contributions: contributionResult.contributions,
        contributionSearchAvailable: contributionResult.available,
        publicContributionCount: contributionResult.contributions.length,
        mergedPullRequestCount: contributionResult.contributions.filter(
          (contribution) => contribution.kind === "pull-request"
        ).length,
        publicIssueCount: contributionResult.contributions.filter(
          (contribution) => contribution.kind === "issue"
        ).length,
        latestPublicActivityAt:
          [
            latestRepositoryActivity,
            latestCommitActivity,
            latestContributionActivity,
          ]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null,
      },
      privacy: {
        publicSourcesOnly: true,
        queryStored: false,
        emailReturned: false,
        signedInPagesScraped: false,
      },
      sourceNotes: [
        "GitHub profile, repositories, recent public events, merged pull requests and issues",
        "Repository relevance is evidence-based and never treated as an official Arc role",
        "Only public GitHub data is used; no private account data or project ranking is requested",
      ],
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof GitHubPublicDataError) {
      console.error("Builder Explorer GitHub request failed", {
        status: error.status,
        message: error.message,
      });

      return jsonReply(
        { error: "Public GitHub activity is temporarily unavailable." },
        error.status
      );
    }

    console.error("Builder Explorer failed", error);
    return jsonReply({ error: "Builder Explorer is temporarily unavailable." }, 503);
  }
}
