import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Local Arc Testnet prototype. Supports ordinary EOA wallets, not contract wallets.
export async function POST(request: NextRequest) {
  try {
    const origin = process.env.PREDARC_APP_ORIGIN;
    const chainId = Number(process.env.PREDARC_AUTH_CHAIN_ID);
    if (origin !== "http://localhost:3000" || chainId !== 5042002) {
      return reply({ error: "Local Arc Testnet login is not configured." }, 503);
    }
    if (request.headers.get("origin") !== origin) {
      return reply({ error: "Invalid request origin." }, 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return reply({ error: "Send a JSON request." }, 415);
    }
    const binding = request.cookies.get("predarc_challenge")?.value;
    if (!binding || !/^[0-9a-f]{64}$/.test(binding)) {
      return reply({ error: "Start a fresh sign-in in this browser." }, 401);
    }
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing request body." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return reply({ error: "Request is too large." }, 413);
      }
      chunks.push(value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply({ error: "Invalid JSON." }, 400);
    }
    if (!input || typeof input !== "object"
      || !("challengeId" in input) || !("signature" in input)
      || typeof input.challengeId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.challengeId)
      || typeof input.signature !== "string"
      || !/^0x[0-9a-f]{130}$/i.test(input.signature)) {
      return reply({ error: "Invalid challenge or wallet signature." }, 400);
    }
    const db = getSupabaseAdmin();
    const { data: challenge, error } = await db
      .from("predarc_auth_challenges")
      .select("id,wallet,chain_id,message,created_at,expires_at")
      .eq("id", input.challengeId)
      .eq("nonce_hash", hash(binding))
      .eq("chain_id", chainId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return reply({ error: "Sign-in service is temporarily unavailable." }, 503);
    if (!challenge) {
      return reply({ error: "Challenge expired or already used. Start sign-in again." }, 401);
    }
    // Never accept a client-supplied message, address, network or expiry.
    const lines = String(challenge.message).split("\n");
    if (!isAddress(challenge.wallet)
      || lines[0] !== `${new URL(origin).host} wants you to sign in with your Ethereum account:`
      || lines[1]?.toLowerCase() !== challenge.wallet
      || !lines.includes(`URI: ${origin}`)
      || !lines.includes(`Chain ID: ${chainId}`)
      || !lines.includes(`Expiration Time: ${new Date(challenge.expires_at).toISOString()}`)
      || new Date(challenge.created_at).getTime() > Date.now()) {
      return reply({ error: "Invalid challenge. Start sign-in again." }, 401);
    }
    let valid = false;
    try {
      valid = await verifyMessage({
        address: challenge.wallet as Address,
        message: challenge.message,
        signature: input.signature as Hex,
      });
    } catch {
      valid = false;
    }
    if (!valid) return reply({ error: "Signature does not match this wallet." }, 401);

    // A conditional UPDATE is atomic: only one concurrent verification can win.
    // Check expiry again after signature verification, including the exact boundary.
    const now = new Date();
    const { data: consumed, error: consumeError } = await db
      .from("predarc_auth_challenges")
      .update({ consumed_at: now.toISOString() })
      .eq("id", challenge.id)
      .eq("nonce_hash", hash(binding))
      .is("consumed_at", null)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (consumeError) return reply({ error: "Could not complete sign-in." }, 503);
    if (!consumed) return reply({ error: "Challenge expired or already used." }, 401);

    // Rotate any session already held by this browser. No raw session token is stored.
    const oldToken = request.cookies.get("predarc_session")?.value;
    if (oldToken && /^[0-9a-f]{64}$/.test(oldToken)) {
      const { error: revokeError } = await db.from("predarc_auth_sessions")
        .delete().eq("token_hash", hash(oldToken));
      if (revokeError) return reply({ error: "Start sign-in again." }, 503);
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const { error: sessionError } = await db.from("predarc_auth_sessions").insert({
      token_hash: hash(token), wallet: challenge.wallet, chain_id: chainId,
      created_at: now.toISOString(), expires_at: expiresAt.toISOString(),
    });
    // If session creation fails, leave the challenge consumed (fail closed).
    if (sessionError) return reply({ error: "Could not create session. Start sign-in again." }, 503);
    const response = reply({
      authenticated: true, wallet: challenge.wallet, chainId,
      expiresAt: expiresAt.toISOString(),
    });
    response.cookies.set("predarc_session", token, {
      httpOnly: true, sameSite: "strict", secure: false,
      path: "/", maxAge: 3600,
    });
    response.cookies.set("predarc_challenge", "", {
      httpOnly: true, sameSite: "strict", secure: false,
      path: "/", maxAge: 0,
    });
    return response;
  } catch {
    return reply({ error: "Sign-in service is temporarily unavailable." }, 503);
  }
}
