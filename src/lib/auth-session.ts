import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const authChainId = 5042002;
export function localAuthConfigured() {
  const appOrigin = process.env.PREDARC_APP_ORIGIN;

  return typeof appOrigin === "string"
    && /^https?:\/\/[^/]+$/.test(appOrigin)
    && Number(process.env.PREDARC_AUTH_CHAIN_ID) === authChainId;
}
export function requestOriginAllowed(request: NextRequest) {
  const appOrigin = process.env.PREDARC_APP_ORIGIN;
  if (typeof appOrigin !== "string") return false;

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== appOrigin) return false;

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  if (!forwardedHost) return false;

  return `${forwardedProto}://${forwardedHost}` === appOrigin;
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
    .eq("token_hash", tokenHash).eq("chain_id", authChainId)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("Session lookup failed");
  if (!data || !/^[0-9a-f]{40}$/.test(String(data.wallet).slice(2))
    || !String(data.wallet).startsWith("0x")
    || !(Date.parse(data.expires_at) > Date.now())) return null;
  return { wallet: String(data.wallet), chainId: authChainId, expiresAt: String(data.expires_at) };
}
