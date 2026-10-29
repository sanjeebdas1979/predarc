import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  isPredarcChainId,
  type PredarcChainId,
} from "@/lib/predarc-networks";

export const authSessionMaxAgeSeconds =
  30 * 24 * 60 * 60;

export const authSessionRenewalWindowSeconds =
  7 * 24 * 60 * 60;

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function localAuthConfigured() {
  const appOrigin = process.env.PREDARC_APP_ORIGIN;

  return typeof appOrigin === "string"
    && /^https?:\/\/[^/]+$/.test(appOrigin);
}
export function requestOriginAllowed(
  request: NextRequest
) {
  const configuredOrigin =
    process.env.PREDARC_APP_ORIGIN;

  if (typeof configuredOrigin !== "string") {
    return false;
  }

  const allowedOrigins = new Set([
    configuredOrigin,
    "https://predarc.xyz",
    "https://www.predarc.xyz",
  ]);

  const requestOrigin =
    request.headers.get("origin");

  if (
    requestOrigin &&
    !allowedOrigins.has(requestOrigin)
  ) {
    return false;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ??
    request.nextUrl.host;

  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  if (!forwardedHost) {
    return false;
  }

  return allowedOrigins.has(
    `${forwardedProto}://${forwardedHost}`
  );
}

export function authReply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
}
export function sessionHash(request: NextRequest) {
  const token = request.cookies.get("predarc_session")?.value;
  return token && /^[0-9a-f]{64}$/.test(token)
    ? createHash("sha256").update(token).digest("hex") : null;
}
// Every protected API must call this helper; browser state is never authorization.
export async function readAuthSession(request: NextRequest) {
  if (!localAuthConfigured()) throw new Error("Auth not configured");
  const tokenHash = sessionHash(request);
  if (!tokenHash) return null;
  const { data, error } = await getSupabaseAdmin().from("predarc_auth_sessions")
    .select("wallet,chain_id,expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("Session lookup failed");
  const chainId = data?.chain_id;
  if (!data || !/^[0-9a-f]{40}$/.test(String(data.wallet).slice(2))
    || !String(data.wallet).startsWith("0x")
    || !isPredarcChainId(chainId)
    || !(Date.parse(data.expires_at) > Date.now())) return null;
  return {
    wallet: String(data.wallet),
    chainId: chainId as PredarcChainId,
    expiresAt: String(data.expires_at),
  };
}
