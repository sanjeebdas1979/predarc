import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, zeroAddress } from "viem";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const configuredOrigin = process.env.PREDARC_APP_ORIGIN;
    const allowedOrigins = new Set([
      configuredOrigin,
    ]);

    if (configuredOrigin === "https://predarc.xyz") {
      allowedOrigins.add("https://www.predarc.xyz");
    }

    if (configuredOrigin === "https://www.predarc.xyz") {
      allowedOrigins.add("https://predarc.xyz");
    }

    const chainId = Number(process.env.PREDARC_AUTH_CHAIN_ID);
    if (!configuredOrigin || ![5042002, 5042].includes(chainId)) {
      return reply({ error: "Arc login is not configured." }, 503);
    }
    const appUrl = new URL(configuredOrigin);
    if (appUrl.origin !== configuredOrigin) {
      return reply({ error: "Use an app origin without a trailing slash or path." }, 503);
    }
    if (!allowedOrigins.has(
      request.headers.get("origin") ?? ""
    )) {
      return reply({ error: "Invalid request origin." }, 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return reply({ error: "Send a JSON request." }, 415);
    }
    // Read a bounded body, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing request body." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
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
    if (!input || typeof input !== "object" || !("wallet" in input)
      || typeof input.wallet !== "string" || !isAddress(input.wallet)
      || input.wallet.toLowerCase() === zeroAddress) {
      return reply({ error: "Enter a valid wallet address." }, 400);
    }
    const address = getAddress(input.wallet);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const nonce = randomBytes(16).toString("hex");
    // Independent browser binding: the message nonce is public, this cookie is not.
    const browserToken = randomBytes(32).toString("hex");
    const nonceHash = createHash("sha256").update(browserToken).digest("hex");
    const message = [
      `${appUrl.host} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "Sign in to Predarc on Arc Testnet. This does not send a transaction or grant token approval.",
      "",
      `URI: ${appUrl.origin}`,
      "Version: 1",
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${now.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
    ].join("\n");
    const { data, error } = await getSupabaseAdmin()
      .from("predarc_auth_challenges")
      .insert({
        wallet: address.toLowerCase(), chain_id: chainId,
        nonce_hash: nonceHash, message,
        created_at: now.toISOString(), expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) return reply({ error: "Could not create a sign-in challenge." }, 503);
    const response = reply({ challengeId: data.id, message, chainId });
    response.cookies.set("predarc_challenge", browserToken, {
      httpOnly: true, sameSite: "strict", secure: false,
      path: "/", maxAge: 300,
    });
    return response;
  } catch {
    return reply({ error: "Sign-in service is temporarily unavailable." }, 503);
  }
}

