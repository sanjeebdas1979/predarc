import { NextRequest } from "next/server";
import {
  authCookieOptions,
  authReply,
  authSessionMaxAgeSeconds,
  authSessionRenewalWindowSeconds,
  readAuthSession,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await readAuthSession(request);

    if (!session) {
      return authReply({ authenticated: false });
    }

    let expiresAt = session.expiresAt;
    const remainingSeconds =
      (Date.parse(expiresAt) - Date.now()) / 1000;
    const token = request.cookies.get("predarc_session")?.value;
    const tokenHash = sessionHash(request);

    if (
      remainingSeconds <= authSessionRenewalWindowSeconds &&
      token &&
      /^[0-9a-f]{64}$/.test(token) &&
      tokenHash
    ) {
      const nextExpiry = new Date(
        Date.now() + authSessionMaxAgeSeconds * 1000
      ).toISOString();
      const { data } = await getSupabaseAdmin()
        .from("predarc_auth_sessions")
        .update({ expires_at: nextExpiry })
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .select("expires_at")
        .maybeSingle();

      if (
        data?.expires_at &&
        Date.parse(String(data.expires_at)) >=
          Date.parse(nextExpiry) - 1000
      ) {
        expiresAt = String(data.expires_at);
      }
    }

    const response = authReply({
      authenticated: true,
      ...session,
      expiresAt,
    });

    if (expiresAt !== session.expiresAt && token) {
      response.cookies.set(
        "predarc_session",
        token,
        authCookieOptions(authSessionMaxAgeSeconds)
      );
    }

    return response;
  } catch {
    return authReply({ error: "Session status is temporarily unavailable." }, 503);
  }
}
