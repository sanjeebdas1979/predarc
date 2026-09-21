import { NextRequest } from "next/server";
import { authReply, readAuthSession } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await readAuthSession(request);
    return authReply(session ? { authenticated: true, ...session } : { authenticated: false });
  } catch {
    return authReply({ error: "Session status is temporarily unavailable." }, 503);
  }
}
