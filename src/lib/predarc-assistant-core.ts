import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getForecastRegistryAddress,
  getPredarcNetwork,
  isForecastRegistryReady,
  type PredarcChainId,
} from "@/lib/predarc-networks";

export const ASSISTANT_MAX_MESSAGES = 12;
export const ASSISTANT_MAX_MESSAGE_LENGTH = 800;
export const ASSISTANT_MAX_TOTAL_LENGTH = 5_000;
export const ASSISTANT_MAX_REPLY_LENGTH = 2_000;

export type PredarcAssistantRole = "user" | "assistant";

export type PredarcAssistantMessage = {
  role: PredarcAssistantRole;
  content: string;
};

export type PredarcAssistantSource = {
  id: string;
  label: string;
  href: string;
};

export type PredarcAssistantReply = {
  answer: string;
  mode: "verified" | "ai";
  sources: PredarcAssistantSource[];
};

export type OfficialArcDocsEntry = {
  title: string;
  description: string;
  markdownHref: string;
  href: string;
};

const SOURCE_CATALOG = {
  "predarc-home": {
    id: "predarc-home",
    label: "Predarc",
    href: "/",
  },
  "predarc-guide": {
    id: "predarc-guide",
    label: "Predarc Guide",
    href: "/guide",
  },
  "predarc-arena": {
    id: "predarc-arena",
    label: "Forecast Arena",
    href: "/arena",
  },
  "predarc-markets": {
    id: "predarc-markets",
    label: "Community Markets",
    href: "/markets",
  },
  "predarc-bridge": {
    id: "predarc-bridge",
    label: "Predarc Bridge",
    href: "/bridge",
  },
  "predarc-swap": {
    id: "predarc-swap",
    label: "Predarc Swap",
    href: "/swap",
  },
  "predarc-research": {
    id: "predarc-research",
    label: "Agent Research",
    href: "/research",
  },
  "predarc-agents": {
    id: "predarc-agents",
    label: "AI Agents",
    href: "/agents",
  },
  "predarc-receipts": {
    id: "predarc-receipts",
    label: "Predarc Receipts",
    href: "/receipts",
  },
  "arc-docs": {
    id: "arc-docs",
    label: "Official Arc Docs",
    href: "https://docs.arc.io/arc-chain",
  },
  "arc-connect": {
    id: "arc-connect",
    label: "Connect to Arc",
    href: "https://docs.arc.io/arc/references/connect-to-arc",
  },
  "arc-bridge": {
    id: "arc-bridge",
    label: "Arc App Kit Bridge",
    href: "https://docs.arc.io/app-kit/bridge",
  },
  "arc-swap": {
    id: "arc-swap",
    label: "Arc App Kit Swap",
    href: "https://docs.arc.io/app-kit/swap",
  },
  "arc-agentic": {
    id: "arc-agentic",
    label: "Agentic Economy on Arc",
    href: "https://docs.arc.io/build/agentic-economy",
  },
  "base-docs": {
    id: "base-docs",
    label: "Official Base Docs",
    href: "https://docs.base.org/",
  },
  "base-connect": {
    id: "base-connect",
    label: "Connect to Base",
    href: "https://docs.base.org/base-chain/quickstart/connecting-to-base",
  },
} as const satisfies Record<string, PredarcAssistantSource>;

type SourceId = keyof typeof SOURCE_CATALOG;

const ARC_DOCS_HOST = "docs.arc.io";
const ARC_DOC_SOURCE_PREFIX = "arc-doc:";
const ARC_DOC_LABEL_PREFIX = "Official Arc · ";
const BASE_DOCS_HOST = "docs.base.org";
const BASE_DOC_SOURCE_PREFIX = "base-doc:";
const BASE_DOC_LABEL_PREFIX = "Official Base · ";

const ARC_DOC_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "arc",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "use",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

const ARC_QUERY_EXPANSIONS: ReadonlyArray<{
  pattern: RegExp;
  terms: readonly string[];
}> = [
  {
    pattern: /\b(?:l1|l2|layer[\s-]?(?:1|2|one|two))\b|লেয়ার\s*[১২]|লেয়ার\s*[১২]/i,
    terms: ["layer", "blockchain", "network", "purpose", "built"],
  },
  {
    pattern: /\b(?:gas|fee|fees|cost)\b|গ্যাস|ফি/i,
    terms: ["gas", "fee", "fees", "stable", "pricing"],
  },
  {
    pattern: /\b(?:rpc|chain[\s-]?id|wallet|connect|mainnet|testnet)\b|মেইননেট|টেস্টনেট|ওয়ালেট|ওয়ালেট/i,
    terms: ["connect", "wallet", "rpc", "network"],
  },
  {
    pattern: /\b(?:contract|address|token)\b|কনট্রাক্ট/i,
    terms: ["contract", "addresses", "token"],
  },
  {
    pattern: /\b(?:bridge|bridging|cctp|cross[\s-]?chain)\b|ব্রিজ/i,
    terms: ["bridge", "bridging", "cctp", "crosschain"],
  },
  {
    pattern: /\b(?:swap|slippage|rate|rates)\b|সোয়াপ|সোয়াপ/i,
    terms: ["swap", "slippage", "rate", "rates"],
  },
  {
    pattern: /\b(?:privacy|private|confidential)\b|প্রাইভেসি/i,
    terms: ["privacy", "private", "confidential"],
  },
  {
    pattern: /\b(?:finality|final|settlement|speed)\b/i,
    terms: ["finality", "final", "settlement", "deterministic"],
  },
  {
    pattern: /\b(?:agent|agents|ai|erc[\s-]?8004|erc[\s-]?8183)\b|এজেন্ট/i,
    terms: ["agent", "agents", "agentic", "identity", "reputation"],
  },
  {
    pattern: /\b(?:node|validator|consensus|poa|proof[\s-]?of[\s-]?authority)\b|নোড/i,
    terms: ["node", "validator", "consensus", "proof", "authority"],
  },
  {
    pattern: /\b(?:borrow|loan|collateral|liquidation)\b/i,
    terms: ["borrow", "loan", "collateral", "liquidation"],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim()
    : "";
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function includesArcWord(value: string): boolean {
  return /\barc\b/.test(value) || value.includes("আর্ক");
}

function includesBaseWord(value: string): boolean {
  return (
    /\bbase(?:\s+(?:mainnet|network|blockchain))?\b/.test(value) ||
    value.includes("বেস")
  );
}

function includesPredarcWord(value: string): boolean {
  return /\bpredarc\b/.test(value) || value.includes("প্রেডআর্ক");
}

function matchesPredictionIntent(value: string): boolean {
  return (
    /\b(?:arena|forecast(?:ed|ing|s)?|predict(?:ed|ing|ion|ions|s)?|higher|lower|rounds?)\b/.test(
      value
    ) ||
    includesAny(value, [
      "ভবিষ্যদ্বাণী",
      "প্রেডিকশন",
      "প্রেডিক্ট",
      "কিভাবে অনুমান",
      "কীভাবে অনুমান",
    ])
  );
}

function matchesPredarcProductIntent(value: string): boolean {
  return (
    matchesPredictionIntent(value) ||
    includesAny(value, [
      "what can i",
      "what can predarc",
      "features",
      "available",
      "use predarc",
      "bridge",
      "cross-chain",
      "crosschain",
      "swap",
      "agent research",
      "market analysis",
      "x402",
      "ai agent",
      "automation",
      "community market",
      "create market",
      "join market",
      "receipt",
      "transaction hash",
      "server point",
      "demo point",
      "ব্রিজ",
      "সোয়াপ",
      "সোয়াপ",
      "প্রেডিকশন",
    ])
  );
}

function isArcOnlyQuestion(value: string): boolean {
  return (
    includesArcWord(value) &&
    !includesBaseWord(value) &&
    !includesPredarcWord(value)
  );
}

function isBaseOnlyQuestion(value: string): boolean {
  return (
    includesBaseWord(value) &&
    !includesArcWord(value) &&
    !includesPredarcWord(value)
  );
}

function questionNetworkChainId(
  value: string,
  selectedChainId: PredarcChainId
): PredarcChainId {
  const mentionsArc = includesArcWord(value);
  const mentionsBase = includesBaseWord(value);

  if (mentionsArc && !mentionsBase) return ARC_MAINNET_CHAIN_ID;
  if (mentionsBase && !mentionsArc) return BASE_MAINNET_CHAIN_ID;
  return selectedChainId;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 48 &&
        !ARC_DOC_STOP_WORDS.has(token)
    );
}

export function normalizeOfficialArcMarkdownHref(
  value: string
): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== ARC_DOCS_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("//") ||
      !/^\/[a-z0-9][a-z0-9/_-]*\.md$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function parseOfficialArcDocsIndex(
  value: string
): OfficialArcDocsEntry[] {
  const entries: OfficialArcDocsEntry[] = [];
  const seen = new Set<string>();

  for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\):\s*(.+)$/);
    if (!match) continue;

    const title = cleanText(match[1]).slice(0, 120);
    const markdownHref = normalizeOfficialArcMarkdownHref(match[2]);
    const description = cleanText(match[3]).slice(0, 600);
    if (!title || !markdownHref || !description || seen.has(markdownHref)) {
      continue;
    }

    const href = markdownHref.replace(/\.md$/, "");
    seen.add(markdownHref);
    entries.push({ title, description, markdownHref, href });
  }

  return entries;
}

export function rankOfficialArcDocs(
  question: string,
  entries: readonly OfficialArcDocsEntry[],
  limit = 3
): OfficialArcDocsEntry[] {
  const boundedLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  if (boundedLimit === 0 || entries.length === 0) return [];

  const normalizedQuestion = normalizeSearchText(question);
  const terms = new Set(searchTokens(question));
  for (const expansion of ARC_QUERY_EXPANSIONS) {
    if (expansion.pattern.test(question)) {
      for (const term of expansion.terms) terms.add(term);
    }
  }

  const queryTerms = [...terms];
  const queryBigrams = queryTerms
    .slice(0, 12)
    .flatMap((term, index) =>
      index + 1 < queryTerms.length ? [`${term} ${queryTerms[index + 1]}`] : []
    );
  const seenContent = new Set<string>();

  const ranked = entries
    .map((entry, index) => {
      const title = normalizeSearchText(entry.title);
      const description = normalizeSearchText(entry.description);
      const path = normalizeSearchText(new URL(entry.markdownHref).pathname);
      const titleTokens = new Set(searchTokens(entry.title));
      const descriptionTokens = new Set(searchTokens(entry.description));
      const pathTokens = new Set(searchTokens(path));
      let score = 0;

      if (normalizedQuestion.length >= 4 && title.includes(normalizedQuestion)) {
        score += 40;
      }
      for (const term of queryTerms) {
        if (titleTokens.has(term)) score += 12;
        else if (title.includes(term)) score += 6;
        if (pathTokens.has(term)) score += 7;
        else if (path.includes(term)) score += 3;
        if (descriptionTokens.has(term)) score += 3;
      }
      for (const phrase of queryBigrams) {
        if (title.includes(phrase)) score += 10;
        if (description.includes(phrase)) score += 4;
      }

      return { entry, index, score, contentKey: `${title}|${description}` };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((candidate) => {
      if (seenContent.has(candidate.contentKey)) return false;
      seenContent.add(candidate.contentKey);
      return true;
    });

  if (ranked.length > 0) {
    return ranked.slice(0, boundedLimit).map(({ entry }) => entry);
  }

  if (includesArcWord(question.toLowerCase())) {
    const overview = entries.find(
      (entry) => normalizeSearchText(entry.title) === "arc network"
    );
    return overview ? [overview] : [];
  }

  return [];
}

export function officialArcDocsEntryToSource(
  entry: OfficialArcDocsEntry
): PredarcAssistantSource {
  const url = new URL(entry.href);
  const title = cleanText(entry.title).slice(0, 64);
  return {
    id: `${ARC_DOC_SOURCE_PREFIX}${url.pathname}`,
    label: `${ARC_DOC_LABEL_PREFIX}${title}`,
    href: url.href,
  };
}

export function normalizeOfficialBaseMarkdownHref(
  value: string
): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== BASE_DOCS_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("//") ||
      !/^\/[a-z0-9][a-z0-9/_-]*\.md$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function parseOfficialBaseDocsIndex(
  value: string
): OfficialArcDocsEntry[] {
  const entries: OfficialArcDocsEntry[] = [];
  const seen = new Set<string>();

  for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\):\s*(.+)$/);
    if (!match) continue;

    const title = cleanText(match[1]).slice(0, 120);
    const markdownHref = normalizeOfficialBaseMarkdownHref(match[2]);
    const description = cleanText(match[3]).slice(0, 600);
    if (!title || !markdownHref || !description || seen.has(markdownHref)) {
      continue;
    }

    seen.add(markdownHref);
    entries.push({
      title,
      description,
      markdownHref,
      href: markdownHref.replace(/\.md$/, ""),
    });
  }

  return entries;
}

export function officialBaseDocsEntryToSource(
  entry: OfficialArcDocsEntry
): PredarcAssistantSource {
  const url = new URL(entry.href);
  const title = cleanText(entry.title).slice(0, 64);
  return {
    id: `${BASE_DOC_SOURCE_PREFIX}${url.pathname}`,
    label: `${BASE_DOC_LABEL_PREFIX}${title}`,
    href: url.href,
  };
}

function trustedDynamicArcSource(
  value: Record<string, unknown>
): PredarcAssistantSource | null {
  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.href !== "string"
  ) {
    return null;
  }

  try {
    const url = new URL(value.href);
    if (
      url.protocol !== "https:" ||
      url.hostname !== ARC_DOCS_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("//") ||
      !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(url.pathname) ||
      value.id !== `${ARC_DOC_SOURCE_PREFIX}${url.pathname}` ||
      value.label !== cleanText(value.label) ||
      /[\r\n]/.test(value.label) ||
      !value.label.startsWith(ARC_DOC_LABEL_PREFIX) ||
      value.label.length <= ARC_DOC_LABEL_PREFIX.length ||
      value.label.length > ARC_DOC_LABEL_PREFIX.length + 64
    ) {
      return null;
    }
    return { id: value.id, label: value.label, href: url.href };
  } catch {
    return null;
  }
}

function trustedDynamicBaseSource(
  value: Record<string, unknown>
): PredarcAssistantSource | null {
  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.href !== "string"
  ) {
    return null;
  }

  try {
    const url = new URL(value.href);
    if (
      url.protocol !== "https:" ||
      url.hostname !== BASE_DOCS_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("//") ||
      !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(url.pathname) ||
      value.id !== `${BASE_DOC_SOURCE_PREFIX}${url.pathname}` ||
      value.label !== cleanText(value.label) ||
      /[\r\n]/.test(value.label) ||
      !value.label.startsWith(BASE_DOC_LABEL_PREFIX) ||
      value.label.length <= BASE_DOC_LABEL_PREFIX.length ||
      value.label.length > BASE_DOC_LABEL_PREFIX.length + 64
    ) {
      return null;
    }
    return { id: value.id, label: value.label, href: url.href };
  } catch {
    return null;
  }
}

export function normalizeAssistantMessages(
  value: unknown
): PredarcAssistantMessage[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > ASSISTANT_MAX_MESSAGES
  ) {
    return null;
  }

  const messages: PredarcAssistantMessage[] = [];
  let totalLength = 0;

  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) {
      return null;
    }

    const content = cleanText(item.content);
    if (!content || content.length > ASSISTANT_MAX_MESSAGE_LENGTH) {
      return null;
    }

    totalLength += content.length;
    if (totalLength > ASSISTANT_MAX_TOTAL_LENGTH) return null;

    if (
      messages.length > 0 &&
      messages[messages.length - 1]?.role === item.role
    ) {
      return null;
    }

    messages.push({ role: item.role, content });
  }

  if (messages[0]?.role !== "user" || messages.at(-1)?.role !== "user") {
    return null;
  }

  return messages;
}

export function containsSensitiveAssistantMaterial(value: string): boolean {
  return (
    /(?:^|[^0-9a-f])0x[0-9a-f]{64}(?![0-9a-f])/i.test(value) ||
    /(?:seed|recovery|mnemonic)\s+phrase\s*(?::|=|-|is\b)\s*\S+/i.test(
      value
    ) ||
    /(?:private\s*key|api\s*key|agent\s*(?:api\s*)?token)\s*(?::|=|-|is\b)\s*\S+/i.test(
      value
    ) ||
    /authorization\s*:\s*bearer\s+\S+/i.test(value)
  );
}

export function assistantQuestionIsInScope(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    includesPredarcWord(normalized) ||
    includesArcWord(normalized) ||
    includesBaseWord(normalized) ||
    matchesPredictionIntent(normalized) ||
    /\b(?:gas|rpc)\b/.test(normalized) ||
    includesAny(normalized, [
      "forecast",
      "prediction",
      "higher",
      "lower",
      "community market",
      "bridge",
      "swap",
      "usdc",
      "eurc",
      "cirbtc",
      "wallet",
      "metamask",
      "rabby",
      "agent",
      "research",
      "receipt",
      "server point",
      "chain id",
      "mainnet",
      "testnet",
    ])
  );
}

export function selectAssistantSources(
  question: string,
  chainId: PredarcChainId = ARC_MAINNET_CHAIN_ID
): PredarcAssistantSource[] {
  const normalized = question.toLowerCase();
  const arcOnly = isArcOnlyQuestion(normalized);
  const baseOnly = isBaseOnlyQuestion(normalized);
  const mentionsArc = includesArcWord(normalized);
  const mentionsBase = includesBaseWord(normalized);
  const questionNetwork = getPredarcNetwork(
    questionNetworkChainId(normalized, chainId)
  );
  const selected: SourceId[] = [];
  const add = (id: SourceId) => {
    if (!selected.includes(id) && selected.length < 3) selected.push(id);
  };

  if (mentionsArc && mentionsBase) {
    add("predarc-guide");
    add("arc-docs");
    add("base-docs");
  } else if (
    includesArcWord(normalized) &&
    includesAny(normalized, [
      "layer 1",
      "layer-1",
      "layer1",
      "layer 2",
      "layer-2",
      "layer2",
      "l1",
      "l2",
      "লেয়ার ১",
      "লেয়ার ২",
      "লেয়ার ১",
      "লেয়ার ২",
    ])
  ) {
    add("arc-docs");
    add("arc-connect");
  } else if (baseOnly && !matchesPredarcProductIntent(normalized)) {
    add("base-docs");
    add("base-connect");
  } else if (
    arcOnly &&
    (!matchesPredarcProductIntent(normalized) || normalized.includes("app kit"))
  ) {
    add("arc-docs");
    add("arc-connect");
  } else if (includesAny(normalized, ["bridge", "cross-chain", "crosschain"])) {
    add("predarc-bridge");
    add(questionNetwork.key === "arc" ? "arc-bridge" : "base-docs");
  } else if (
    includesAny(normalized, ["swap", "exchange token", "trade token"]) ||
    (includesPredarcWord(normalized) &&
      includesAny(normalized, ["eurc", "cirbtc"]))
  ) {
    add("predarc-swap");
    add(questionNetwork.key === "arc" ? "arc-swap" : "base-docs");
  } else if (includesAny(normalized, ["research", "x402", "model call"])) {
    add("predarc-research");
    add("predarc-guide");
  } else if (includesAny(normalized, ["ai agent", "automation", "api token"])) {
    add("predarc-agents");
    add(questionNetwork.key === "arc" ? "arc-agentic" : "base-docs");
  } else if (includesAny(normalized, ["community", "create market"])) {
    add("predarc-markets");
    add("predarc-guide");
  } else if (includesAny(normalized, ["receipt", "transaction hash"])) {
    add("predarc-receipts");
    add("predarc-guide");
  } else if (matchesPredictionIntent(normalized)) {
    add("predarc-arena");
    add("predarc-guide");
  } else if (
    includesAny(normalized, [
      "what can i",
      "features",
      "available",
      "use predarc",
    ])
  ) {
    add("predarc-guide");
    add(questionNetwork.key === "arc" ? "arc-docs" : "base-docs");
  } else if (
    includesAny(normalized, [
      "builder code",
      "erc-8021",
      "erc8021",
      "forecastregistry",
      "forecast registry",
      "prediction contract",
      "smart contract address",
    ])
  ) {
    add("predarc-guide");
    add(questionNetwork.key === "arc" ? "arc-docs" : "base-docs");
  } else if (
    includesAny(normalized, ["chain id", "rpc", "gas", "wallet", "mainnet", "testnet"])
  ) {
    add(questionNetwork.key === "arc" ? "arc-connect" : "base-connect");
    add(questionNetwork.key === "arc" ? "arc-docs" : "base-docs");
  } else if (includesArcWord(normalized)) {
    add("arc-docs");
    add("arc-connect");
  } else if (includesBaseWord(normalized)) {
    add("base-docs");
    add("base-connect");
  } else {
    add("predarc-guide");
    add("predarc-home");
  }

  return selected.map((id) => SOURCE_CATALOG[id]);
}

export function verifiedAssistantAnswer(
  question: string,
  chainId: PredarcChainId = ARC_MAINNET_CHAIN_ID
): string | null {
  const normalized = question.toLowerCase();
  const predarcMentioned = includesPredarcWord(normalized);
  const arcOnly = isArcOnlyQuestion(normalized);
  const baseOnly = isBaseOnlyQuestion(normalized);
  const answerChainId = questionNetworkChainId(normalized, chainId);
  const network = getPredarcNetwork(answerChainId);
  const forecastRegistryAddress = getForecastRegistryAddress(answerChainId);
  const forecastReady = isForecastRegistryReady(answerChainId);

  if (
    includesArcWord(normalized) &&
    includesAny(normalized, [
      "layer 1",
      "layer-1",
      "layer1",
      "layer 2",
      "layer-2",
      "layer2",
      "l1",
      "l2",
      "লেয়ার ১",
      "লেয়ার ২",
      "লেয়ার ১",
      "লেয়ার ২",
    ])
  ) {
    return "Arc is a purpose-built Layer-1 blockchain, not a Layer-2. Arc Mainnet is Arc's production network; the word Mainnet describes the live production environment, not its L1/L2 classification. Arc is EVM-compatible, uses USDC as its native gas token and provides deterministic sub-second finality.";
  }

  if (
    arcOnly &&
    includesAny(normalized, [
      "chain id",
      "rpc",
      "network",
      "connect",
      "wallet",
      "gas",
      "mainnet",
      "testnet",
    ])
  ) {
    return "Arc Mainnet is an EVM-compatible Layer-1 built for stablecoin-native financial applications. Its chain ID is 5042, primary RPC is https://rpc.mainnet.arc.io, explorer is https://explorer.arc.io, and native gas is paid in USDC with 18 decimals. Predarc currently offers MetaMask and Rabby connection options.";
  }

  if (
    arcOnly &&
    (/^(?:what(?:'s| is)|explain|tell me about)\s+(?:the\s+)?arc(?:\s+(?:network|blockchain))?\s*[?.!]*$/.test(
      normalized.trim()
    ) ||
      includesAny(normalized, ["arc ki", "আর্ক কি", "আর্ক কী"]))
  ) {
    return "Arc is Circle's EVM-compatible Layer-1 for stablecoin-native financial applications. USDC is the native gas token, fees are denominated in USDC and transactions have deterministic sub-second finality. Official Arc documentation should be used for current network, contract and developer details.";
  }

  // Broader Arc-only questions must use retrieved official Arc documentation.
  if (
    arcOnly &&
    (!matchesPredarcProductIntent(normalized) || normalized.includes("app kit"))
  ) {
    return null;
  }

  if (
    baseOnly &&
    includesAny(normalized, [
      "chain id",
      "rpc",
      "network",
      "connect",
      "wallet",
      "gas",
      "mainnet",
      "layer 2",
      "layer-2",
      "l2",
    ])
  ) {
    return "Base Mainnet is an Ethereum Layer-2 network. Its chain ID is 8453, public RPC is https://mainnet.base.org, explorer is https://basescan.org, and gas is paid in ETH. Predarc supports MetaMask and Rabby and keeps Base activity separate from Arc Mainnet activity.";
  }

  if (
    baseOnly &&
    (/^(?:(?:what|whai)(?:'s| is)|explain|tell me about)\s+(?:the\s+)?base(?:\s+(?:mainnet|network|blockchain))?\s*[?.!]*$/.test(
      normalized.trim()
    ) ||
      includesAny(normalized, ["base ki", "বেস কি", "বেস কী"]))
  ) {
    return "Base is an Ethereum Layer-2 network. Base Mainnet uses chain ID 8453, settles transactions to Ethereum, and uses ETH for gas. Predarc supports Base as a separate production network alongside Arc Mainnet, with network-bound sign-in, activity and wallet prompts.";
  }

  if (
    baseOnly &&
    includesAny(normalized, [
      "usdc address",
      "usdc contract",
      "official usdc",
      "which usdc",
      "usdc decimals",
    ])
  ) {
    return "Official native USDC on Base Mainnet is the ERC-20 token at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 and uses 6 decimals. Base gas is still paid in ETH. Always verify the network and token address before approving or transferring an asset.";
  }

  if (
    includesBaseWord(normalized) &&
    includesAny(normalized, ["builder code", "erc-8021", "erc8021"])
  ) {
    return "Predarc uses Base Builder Code attribution only on eligible Base Mainnet wallet writes. The ERC-8021 data suffix identifies Predarc as the originating app without changing the transaction destination, value or contract call. It is not a fee, token approval or wallet permission, and it is never attached to Arc transactions.";
  }

  if (
    predarcMentioned &&
    includesAny(normalized, [
      "forecastregistry",
      "forecast registry",
      "prediction contract",
      "contract address",
      "smart contract address",
    ])
  ) {
    return forecastRegistryAddress
      ? `Predarc's ${network.label} ForecastRegistryV2 is configured at ${forecastRegistryAddress}. Forecast submissions and settlement stay bound to this network; Predarc never reuses the Arc registry on Base or the Base registry on Arc.`
      : `Predarc does not currently have a verified ForecastRegistryV2 address configured for ${network.label}. Forecasting, Community Markets and AI-agent automation fail closed on that network instead of falling back to another chain.`;
  }

  // Broader Base-only questions must use retrieved official Base documentation.
  if (baseOnly && !matchesPredarcProductIntent(normalized)) return null;

  if (
    includesAny(normalized, [
      "bridge",
      "cross-chain",
      "crosschain",
      "move usdc",
      "ব্রিজ",
    ])
  ) {
    return `Open Bridge, choose the source chain, destination chain and USDC amount, then review every wallet prompt. Predarc defaults the route from the selected ${network.label}. Popular Base routes are available in both directions with Arc, Ethereum, Arbitrum, OP Mainnet, Polygon PoS and Avalanche through Circle App Kit. An ERC-20 source may require an approval for exactly the entered amount before the bridge transaction. Never approve an unexpected or unlimited amount.`;
  }

  if (
    includesAny(normalized, ["swap", "exchange token", "trade token", "সোয়াপ", "সোয়াপ"]) ||
    (predarcMentioned && includesAny(normalized, ["eurc", "cirbtc"]))
  ) {
    return network.key === "arc"
      ? "Predarc Swap provides live Arc Mainnet routes for supported pairs using USDC, EURC and cirBTC. Choose the assets and amount, review the current quote and final wallet transaction, and confirm only if every detail is correct. Quotes can change with market conditions."
      : "Predarc Swap provides live Base Mainnet routes for supported pairs using USDC, EURC and WETH. Choose the assets and amount, review the current quote and final wallet transaction, and confirm only if every detail is correct. Base gas is paid in ETH and quotes can change with market conditions.";
  }

  if (
    includesAny(normalized, [
      "agent research",
      "market analysis",
      "research",
      "x402",
      "paid ai",
      "free preview",
    ])
  ) {
    return `Agent Research has two separate paths on the selected ${network.label}. Free Preview evaluates finalized market evidence and creates a verifiable zero-cost receipt. Paid AI Research obtains an exact BlockRun x402 quote bound to ${network.label} USDC, checks the user's per-call and rolling limits, requests a one-time wallet authorization and records the model, evidence, cost and payment reference. Research never submits a prediction automatically.`;
  }

  if (
    includesAny(normalized, [
      "ai agent",
      "connect agent",
      "automated prediction",
      "automation",
      "api token",
    ])
  ) {
    return forecastReady
      ? `On ${network.label}, Predarc lets a user authorize an external AI agent with bounded markets, durations, per-prediction and daily server-point limits, minimum confidence and expiry. The agent cannot access Bridge, Swap or wallet funds. Connections can be paused, resumed or revoked, and the API token must stay in a secure server-side secret store.`
      : `AI-agent controls are network-bound. ${network.label} automation remains disabled until the verified ForecastRegistry address is configured for that network; Predarc will not reuse the Arc contract on Base. The agent never receives access to Bridge, Swap or wallet funds.`;
  }

  if (
    includesAny(normalized, [
      "community market",
      "create market",
      "join market",
      "user-created market",
      "user created market",
    ])
  ) {
    return forecastReady
      ? `Signed-in users on ${network.label} can create a Community Market by choosing a supported asset, target, direction and duration. The signature binds the network and security-sensitive fields. Activity and settlement remain isolated from the other network.`
      : `${network.label} Community Markets remain disabled until its verified ForecastRegistry deployment is configured. Predarc fails closed and never sends a Base request to the Arc contract.`;
  }

  if (
    includesAny(normalized, [
      "receipt",
      "verify transaction",
      "check transaction",
      "transaction hash",
    ])
  ) {
    return `Predarc Receipts verifies supported ${network.label} USDC transfers from a transaction hash and displays status, sender, recipient, amount, block and timestamp. Reverted, zero-value, contract-creation and unrelated calldata transactions are not treated as valid payment receipts.`;
  }

  if (
    includesAny(normalized, [
      "connect wallet",
      "wallet connect",
      "metamask",
      "rabby",
      "sign in",
      "login",
    ])
  ) {
    return `Choose MetaMask or Rabby, connect the intended account, select Arc Mainnet or Base Mainnet, and approve the wallet network switch. The current selection is ${network.label}. Wallet connection and Predarc sign-in are separate: the sign-in message is gas-free and is not a token approval. Always read every wallet prompt.`;
  }

  if (includesAny(normalized, ["builder explorer", "public builder"])) {
    return "Builder Explorer organizes source-linked public GitHub activity for Arc and Base projects. Search by a public GitHub username, repository or project name, then inspect the original evidence links. Results are public activity signals, not an official ranking, identity claim or Arc or Base community role.";
  }

  if (
    predarcMentioned &&
    includesAny(normalized, [
      "which network",
      "what network",
      "which chain",
      "what chain",
      "runs on",
      "arc mainnet",
      "network",
      "chain",
      "mainnet or testnet",
    ])
  ) {
    return `Predarc supports Arc Mainnet and Base Mainnet with network-bound sign-in, data and wallet prompts. The current selection is ${network.label}. Bridge can route USDC across supported chains; always verify the source, destination, asset and amount before confirming.`;
  }

  if (
    includesAny(normalized, [
      "real money",
      "cash value",
      "earn money",
      "make money",
      "profit",
      "reward",
      "server point",
      "server-point",
      "demo point",
      "practice point",
    ])
  ) {
    return "Forecast Arena and Community Markets use server demo points, which have no cash value. Bridge, Swap and opt-in Paid AI Research are separate wallet-controlled flows that can involve real assets, native USDC and network or provider fees. Free Agent Research Preview costs 0 USDC.";
  }

  if (
    predarcMentioned &&
    includesAny(normalized, [
      "supported asset",
      "supported coin",
      "supported market",
      "which asset",
      "which coin",
      "which market",
    ])
  ) {
    return `Predarc forecasting, Community Markets and Agent Research support BTC, ETH, BNB, SOL and XRP. Bridge focuses on USDC across supported chains. Swap uses USDC, EURC and ${network.key === "arc" ? "cirBTC" : "WETH"} on the selected ${network.label}.`;
  }

  if (
    predarcMentioned &&
    includesAny(normalized, [
      "fee",
      "fees",
      "cost",
      "charge",
      "charges",
      "is predarc free",
    ])
  ) {
    return "Predarc does not have one fixed cost for every feature. Server demo points have no cash value, but wallet-confirmed onchain actions can include network gas or provider fees. Agent Research Preview costs 0 USDC; Paid AI Research displays an exact short-lived quote and checks it against the user's limits before requesting authorization. Always rely on the current page and final wallet prompt for the actual amount.";
  }

  if (
    predarcMentioned &&
    includesAny(normalized, [
      "safe",
      "safety",
      "secure",
      "security",
      "private key",
      "seed phrase",
    ])
  ) {
    return "Predarc keeps private keys in the user's wallet, separates gas-free sign-in from token approvals, applies bounded agent permissions and shows reviewable wallet prompts. No dapp is risk-free: verify the Predarc URL, selected network, asset, amount and permission before signing, start with a small amount, and never share a seed phrase, private key or agent token.";
  }

  if (
    matchesPredictionIntent(normalized) &&
    includesAny(normalized, [
      "accurate",
      "accuracy",
      "guarantee",
      "guaranteed",
      "win rate",
      "winning rate",
    ])
  ) {
    return "Predarc does not guarantee prediction accuracy, a win rate or profit. Higher/Lower choices and Agent Research signals are informational, and crypto prices can move unpredictably. Review the evidence and make your own decision; never treat a Predarc signal as financial advice.";
  }

  if (
    matchesPredictionIntent(normalized) &&
    includesAny(normalized, [
      "settle",
      "settlement",
      "result",
      "winner",
      "outcome",
      "price source",
      "decided",
    ])
  ) {
    return "Predarc captures the live Binance price when an Arena prediction is submitted, records that exact entry in the Arc or Base ForecastRegistryV2 transaction, and verifies the confirmed transaction before the server ledger accepts it. Settlement compares the finalized Binance close with that stored entry: Higher wins above entry, Lower wins below entry, and an equal price is void. Each prediction is settled only once.";
  }

  if (
    matchesPredictionIntent(normalized)
  ) {
    return forecastReady
      ? `Connect MetaMask or Rabby, select ${network.label}, complete the gas-free network-bound Predarc sign-in, then open Forecast Arena. Choose BTC, ETH, SOL, BNB or XRP; select a 1, 5 or 15 minute round; choose Higher or Lower; and enter server points. Review the ${network.label} wallet confirmation, then follow settlement.`
      : `${network.label} forecasting is not yet enabled because its verified ForecastRegistry address is missing. Select Arc Mainnet or wait until the Base deployment is configured; Predarc will not fall back across networks.`;
  }

  if (
    (predarcMentioned || arcOnly || baseOnly) &&
    includesAny(normalized, [
      "what can i",
      "what can predarc",
      "features",
      "what is available on predarc",
      "ki ki",
      "use predarc",
    ])
  ) {
    const explicitlyTargetsOneNetwork =
      includesArcWord(normalized) !== includesBaseWord(normalized);
    if (!explicitlyTargetsOneNetwork) {
      const baseForecasting = isForecastRegistryReady(BASE_MAINNET_CHAIN_ID)
        ? "Base Mainnet also provides forecasting, Community Markets and bounded AI-agent automation"
        : "Base Mainnet currently provides Bridge, USDC/EURC/WETH Swap, Agent Research and Base USDC receipt verification; forecasting, Community Markets and AI-agent automation remain disabled until Predarc configures its separate verified Base ForecastRegistry";
      return `Predarc supports both Arc Mainnet and Base Mainnet. Arc Mainnet provides multi-market forecasting, Community Markets, bounded AI-agent automation, Bridge, USDC/EURC/cirBTC Swap, Agent Research and native-USDC receipt verification. ${baseForecasting}. The current app selection is ${getPredarcNetwork(chainId).label}, and Arc and Base sessions, activity and limits remain separate.`;
    }
    const forecasting = forecastReady
      ? "multi-market forecasting, create or join Community Markets and bounded AI agent automation"
      : "USDC and research features now; forecasting, Community Markets and AI agent automation remain disabled until this network's verified ForecastRegistry is configured";
    return `On ${network.label}, Predarc provides ${forecasting}, USDC bridging, ${network.key === "arc" ? "USDC/EURC/cirBTC" : "USDC/EURC/WETH"} swaps, free or opt-in x402 Agent Research and supported USDC receipt verification. Arc and Base sessions and activity are kept separate.`;
  }

  if (
    predarcMentioned &&
    includesAny(normalized, ["what", "what is", "ki", "about", "explain"])
  ) {
    if (includesArcWord(normalized) !== includesBaseWord(normalized)) {
      const forecasting = forecastReady
        ? "Forecast Arena, Community Markets and bounded AI-agent automation are enabled"
        : "Forecast Arena, Community Markets and bounded AI-agent automation remain disabled until a separate verified ForecastRegistry is configured";
      return `Predarc on ${network.label} combines network-bound sign-in, ${forecasting}, USDC bridging, ${network.key === "arc" ? "USDC/EURC/cirBTC" : "USDC/EURC/WETH"} swaps, Agent Research and supported USDC receipt verification. Arc and Base activity is never mixed.`;
    }
    return "Predarc is a network-aware forecasting and stablecoin application for Arc Mainnet and Base Mainnet. It combines multi-market Higher/Lower forecasting, Community Markets, USDC bridging, per-network swaps, verifiable Agent Research, bounded AI-agent automation and transaction receipts in one interface.";
  }

  return null;
}

export function parseAssistantReply(value: unknown): PredarcAssistantReply | null {
  if (!isRecord(value)) return null;

  const answer = cleanText(value.answer);
  if (!answer || answer.length > ASSISTANT_MAX_REPLY_LENGTH) return null;
  if (value.mode !== "verified" && value.mode !== "ai") return null;
  if (!Array.isArray(value.sources) || value.sources.length > 3) return null;

  const sources: PredarcAssistantSource[] = [];
  const seenSources = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source) || typeof source.id !== "string") return null;
    const trusted = SOURCE_CATALOG[source.id as SourceId];
    let accepted: PredarcAssistantSource | null = null;
    if (trusted) {
      if (source.label !== trusted.label || source.href !== trusted.href) {
        return null;
      }
      accepted = trusted;
    } else {
      accepted =
        trustedDynamicArcSource(source) ?? trustedDynamicBaseSource(source);
    }
    if (!accepted || seenSources.has(accepted.id)) return null;
    seenSources.add(accepted.id);
    sources.push(accepted);
  }

  return { answer, mode: value.mode, sources };
}
