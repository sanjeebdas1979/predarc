import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  assistantQuestionIsInScope,
  containsSensitiveAssistantMaterial,
  normalizeAssistantMessages,
  selectAssistantSources,
  verifiedAssistantAnswer,
  type PredarcAssistantReply,
} from "@/lib/predarc-assistant-core";
import {
  assistantAiEnabled,
  requestAssistantAnswer,
} from "@/lib/predarc-assistant-server";
import { requestOriginAllowed } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 20_000;
const ASSISTANT_MINUTE_LIMIT = 8;
const ASSISTANT_DAY_LIMIT = 50;
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reply(
  body: object,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Origin",
      ...extraHeaders,
    },
  });
}

function safeReply(
  answer: string,
  question: string,
  mode: PredarcAssistantReply["mode"] = "verified"
) {
  return reply({
    answer,
    mode,
    sources: selectAssistantSources(question),
  } satisfies PredarcAssistantReply);
}

function clientFingerprint(request: NextRequest, clientId: string): string {
  const forwardedFor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown";
  return createHash("sha256")
    .update(`predarc-assistant-v1|${clientId}|${forwardedFor}|${userAgent}`)
    .digest("hex");
}

async function consumeAssistantQuota(
  request: NextRequest,
  clientId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "predarc_consume_assistant_quota_v1",
    {
      p_client_hash: clientFingerprint(request, clientId),
      p_minute_limit: ASSISTANT_MINUTE_LIMIT,
      p_day_limit: ASSISTANT_DAY_LIMIT,
    }
  );

  if (error || !isRecord(data) || typeof data.allowed !== "boolean") {
    throw new Error("Assistant quota check failed.");
  }

  return {
    allowed: data.allowed,
    retryAfterSeconds:
      typeof data.retryAfterSeconds === "number" &&
      Number.isSafeInteger(data.retryAfterSeconds)
        ? Math.max(1, data.retryAfterSeconds)
        : 60,
  };
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return reply({ error: "Request origin is not allowed." }, 403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return reply({ error: "Assistant request is too large." }, 413);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return reply({ error: "Assistant request is too large." }, 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return reply({ error: "Invalid assistant request." }, 400);
  }

  const messages = isRecord(body)
    ? normalizeAssistantMessages(body.messages)
    : null;
  if (!messages) {
    return reply({ error: "Invalid assistant conversation." }, 400);
  }

  const latestQuestion = messages.at(-1)?.content ?? "";
  if (
    messages.some(
      (message) =>
        message.role === "user" &&
        containsSensitiveAssistantMaterial(message.content)
    )
  ) {
    return safeReply(
      "Please remove the secret-like material from your message. Predarc Assistant never needs seed phrases, private keys, API keys, agent tokens or wallet credentials. Use Predarc Receipts for transaction hashes.",
      latestQuestion
    );
  }

  const verified = verifiedAssistantAnswer(latestQuestion);
  if (verified) return safeReply(verified, latestQuestion);

  const recentUserContext = messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content)
    .join("\n");

  if (!assistantQuestionIsInScope(recentUserContext)) {
    return safeReply(
      "I can help with Predarc features and verified Arc information. Please ask about forecasting, Community Markets, Bridge, Swap, Agent Research, AI agents, receipts, wallets or the Arc network.",
      latestQuestion
    );
  }

  if (!assistantAiEnabled()) {
    return safeReply(
      "I cannot verify that detail from the built-in Predarc knowledge right now. Please use the trusted source links below. Live AI answers remain disabled until the project owner enables a budgeted server-side AI Gateway connection.",
      latestQuestion
    );
  }

  const clientId = request.headers.get("x-predarc-client")?.trim() ?? "";
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return reply({ error: "Invalid assistant client identifier." }, 400);
  }

  try {
    const quota = await consumeAssistantQuota(request, clientId);
    if (!quota.allowed) {
      return reply(
        {
          error: "Assistant usage limit reached. Please try again later.",
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(quota.retryAfterSeconds) }
      );
    }

    const fallbackSources = selectAssistantSources(recentUserContext);
    const result = await requestAssistantAnswer({
      messages,
      question: recentUserContext,
      fallbackSources,
    });
    return reply({
      answer: result.answer,
      mode: "ai",
      sources: result.sources,
    } satisfies PredarcAssistantReply);
  } catch (error) {
    console.error(
      "Predarc Assistant request failed",
      error instanceof Error ? error.message : "Unknown assistant error"
    );
    return safeReply(
      "Live assistance is temporarily unavailable, so I will not guess. Please check the trusted Predarc and Arc sources below and try again later.",
      latestQuestion
    );
  }
}
