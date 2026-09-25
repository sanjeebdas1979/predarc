import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { authReply, localAuthConfigured, sessionHash } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configuredOrigin =
    process.env.PREDARC_APP_ORIGIN;

  const allowedOrigins = new Set([
    configuredOrigin,
  ]);

  if (configuredOrigin === "https://predarc.xyz") {
    allowedOrigins.add("https://www.predarc.xyz");
  }

  if (configuredOrigin === "https://www.predarc.xyz") {
    allowedOrigins.add("https://predarc.xyz");
  }

  if (!localAuthConfigured()) return authReply({ error: "Local login is not configured." }, 503);
  if (!allowedOrigins.has(
      request.headers.get("origin") ?? ""
    )) {
    return authReply({ error: "Invalid request origin." }, 403);
  }
  try {
    const db = getSupabaseAdmin();
    const tokenHash = sessionHash(request);
    if (tokenHash) {
      const { error } = await db.from("predarc_auth_sessions").delete().eq("token_hash", tokenHash);
      if (error) throw new Error("Session revocation failed");
    }
    const binding = request.cookies.get("predarc_challenge")?.value;
    if (binding && /^[0-9a-f]{64}$/.test(binding)) {
      const { error } = await db.from("predarc_auth_challenges").delete()
        .eq("nonce_hash", createHash("sha256").update(binding).digest("hex"));
      if (error) throw new Error("Challenge revocation failed");
    }
    const response = authReply({ authenticated: false });
    for (const name of ["predarc_session", "predarc_challenge"]) {
      response.cookies.set(name, "", { httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 0 });
    }
    return response;
  } catch {
    return authReply({ error: "Logout could not complete. Please retry." }, 503);
  }
}
