import { NextRequest } from "next/server";
import {
  authChainId,
  authReply,
  localAuthConfigured,
  readAuthSession,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST because the first successful call grants starting testnet demo points.
// No wallet, balance or session hash is accepted from the request body.
export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Account API is available only in the local testnet setup." }, 503);
  }
  const origin = process.env.PREDARC_APP_ORIGIN;
  if (request.headers.get("origin") !== origin || request.nextUrl.origin !== origin) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const tokenHash = sessionHash(request);
    if (!tokenHash) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }
    const session = await readAuthSession(request);
    if (!session) {
      return authReply({ error: "Your session has ended. Sign in again." }, 401);
    }

    // The RPC checks the session again under a database lock. This protects
    // against logout/expiry between the helper lookup and account creation.
    const { data, error } = await getSupabaseAdmin()
      .rpc("predarc_account_v1", { p_session_hash: tokenHash })
      .abortSignal(AbortSignal.timeout(8000));

    if (error) {
      if (error.code === "28000") {
        return authReply({ error: "Your session has ended. Sign in again." }, 401);
      }
      return authReply({ error: "Account service is temporarily unavailable. Please retry." }, 503);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)
      || data.wallet !== session.wallet || data.chainId !== authChainId
      || typeof data.balance !== "string" || !/^(0|[1-9][0-9]*)$/.test(data.balance)) {
      return authReply({ error: "Account service returned an unexpected result." }, 503);
    }

    // Return only public account fields; never return the cookie/hash or key.
    return authReply({
      authenticated: true,
      wallet: data.wallet,
      chainId: data.chainId,
      balance: data.balance,
    });
  } catch {
    return authReply({ error: "Account service is temporarily unavailable. Please retry." }, 503);
  }
}
