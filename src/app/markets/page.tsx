import type { Metadata } from "next";

import CommunityMarketsClient from "@/app/components/community/CommunityMarketsClient";

export const metadata: Metadata = {
  title: "Community Markets | Predarc",
  description:
    "Create and join deterministic crypto prediction markets on Predarc.",
};

export default function CommunityMarketsPage() {
  return <CommunityMarketsClient />;
}
