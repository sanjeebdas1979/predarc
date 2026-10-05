export const BUILDER_EXPLORER_QUERY_MAX_LENGTH = 120;

export type BuilderExplorerQueryKind = "email" | "github" | "project";

export type BuilderExplorerQuery = {
  kind: BuilderExplorerQueryKind;
  normalized: string;
  githubUsername?: string;
  repository?: {
    owner: string;
    name: string;
  };
};

export type PublicRepositoryShape = {
  name?: unknown;
  full_name?: unknown;
  description?: unknown;
  homepage?: unknown;
  topics?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const GITHUB_REPOSITORY_PATTERN = /^([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/([a-z\d._-]{1,100})$/i;
const FIX_COMMIT_PATTERN = /\b(?:bug\s*fix|bugfix|fix(?:e[ds])?|hotfix|regression|patch)\b/i;

const ARC_REPOSITORY_SIGNALS = [
  "arc mainnet",
  "arc testnet",
  "arc network",
  "build on arc",
  "buildonarc",
  "circle usdc",
  "native usdc",
  "arc-mainnet",
  "arc-testnet",
  "arc-network",
  "build-on-arc",
];

export const PUBLIC_ARC_CONTRIBUTION_REPOSITORIES = [
  "circlefin/arc-node",
] as const;

const RECOGNIZED_ARC_REPOSITORIES = new Map<string, string>([
  [PUBLIC_ARC_CONTRIBUTION_REPOSITORIES[0], "Arc Node repository"],
]);

function cleanQuery(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ");
}
function githubPath(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname)) {
      return null;
    }

    return url.pathname.split("/").filter(Boolean).slice(0, 2);
  } catch {
    return null;
  }
}

export function normalizeBuilderExplorerQuery(
  value: unknown
): BuilderExplorerQuery | null {
  const normalized = cleanQuery(value);

  if (
    normalized.length < 2 ||
    normalized.length > BUILDER_EXPLORER_QUERY_MAX_LENGTH
  ) {
    return null;
  }

  if (EMAIL_PATTERN.test(normalized)) {
    return {
      kind: "email",
      normalized: normalized.toLowerCase(),
    };
  }

  const path = githubPath(normalized);
  if (path?.length === 1 && GITHUB_USERNAME_PATTERN.test(path[0])) {
    return {
      kind: "github",
      normalized: `@${path[0].toLowerCase()}`,
      githubUsername: path[0],
    };
  }

  if (
    path?.length === 2 &&
    GITHUB_USERNAME_PATTERN.test(path[0]) &&
    /^[a-z\d._-]{1,100}$/i.test(path[1])
  ) {
    return {
      kind: "project",
      normalized: `${path[0]}/${path[1]}`,
      repository: {
        owner: path[0],
        name: path[1],
      },
    };
  }

  if (normalized.startsWith("@")) {
    const username = normalized.slice(1);

    if (!GITHUB_USERNAME_PATTERN.test(username)) return null;

    return {
      kind: "github",
      normalized: `@${username.toLowerCase()}`,
      githubUsername: username,
    };
  }

  const repositoryMatch = normalized.match(GITHUB_REPOSITORY_PATTERN);
  if (repositoryMatch) {
    return {
      kind: "project",
      normalized: `${repositoryMatch[1]}/${repositoryMatch[2]}`,
      repository: {
        owner: repositoryMatch[1],
        name: repositoryMatch[2],
      },
    };
  }

  if (/^[a-z\d][a-z\d._ -]{1,79}$/i.test(normalized)) {
    return {
      kind: "project",
      normalized,
    };
  }

  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function topicValues(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((topic): topic is string => typeof topic === "string")
    .map((topic) => topic.toLowerCase());
}

export function arcRepositoryEvidence(repository: PublicRepositoryShape) {
  const name = stringValue(repository.name).toLowerCase();
  const fullName = stringValue(repository.full_name).toLowerCase();
  const description = stringValue(repository.description).toLowerCase();
  const homepage = stringValue(repository.homepage).toLowerCase();
  const topics = topicValues(repository.topics);
  const searchable = [name, fullName, description, homepage, ...topics].join(" ");
  const evidence = new Set<string>();

  const recognizedRepository = RECOGNIZED_ARC_REPOSITORIES.get(fullName);
  if (recognizedRepository) evidence.add(recognizedRepository);

  if (name === "predarc" || /(?:^|[-_.])predarc(?:$|[-_.])/.test(name)) {
    evidence.add("Predarc project name");
  }

  for (const signal of ARC_REPOSITORY_SIGNALS) {
    if (searchable.includes(signal)) {
      evidence.add(signal.replaceAll("-", " "));
    }
  }

  if (topics.some((topic) => ["arc", "circle", "usdc"].includes(topic))) {
    evidence.add("Arc/Circle topic");
  }

  return [...evidence];
}

export function isArcRepository(repository: PublicRepositoryShape) {
  return arcRepositoryEvidence(repository).length > 0;
}

export function isFixRelatedCommit(message: unknown) {
  return typeof message === "string" && FIX_COMMIT_PATTERN.test(message);
}

export function safePublicUrl(value: unknown, allowedHosts: readonly string[]) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
