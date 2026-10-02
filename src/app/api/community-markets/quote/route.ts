import { NextRequest } from "next/server";

import {
  isCommunityMarketAsset,
  normalizeCommunityPrice,
} from "@/lib/community-markets-core";
import { fetchCommunitySpotPrice } from "@/lib/community-markets-server";
import {
  authReply,
  localAuthConfigured,
  requestOriginAllowed,
} from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Community markets are not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  const asset = request.nextUrl.searchParams.get("asset");

  if (!isCommunityMarketAsset(asset)) {
    return authReply({ error: "Choose a supported market asset." }, 400);
  }

  try {
    const quote = await fetchCommunitySpotPrice(asset);
    const price = normalizeCommunityPrice(String(quote.price));

    if (!price) throw new Error("Invalid community market quote.");

    return authReply({
      asset,
      price,
      observedAt: quote.observedAt,
    });
  } catch (error) {
    console.error("Community market quote failed", error);
    return authReply({ error: "Live market price is temporarily unavailable." }, 503);
  }
}
