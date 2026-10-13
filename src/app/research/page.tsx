import type { Metadata } from "next";

import AgentResearchClient from "@/app/components/agents/AgentResearchClient";

export const metadata: Metadata = {
  title: "Predarc Agent Research | Predarc",
  description:
    "AI market intelligence with source-linked, tamper-evident research receipts.",
};

export default function AgentResearchPage() {
  return <AgentResearchClient />;
}
