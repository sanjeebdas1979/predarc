import type { Metadata } from "next";

import AgentAutomationClient from "@/app/components/agents/AgentAutomationClient";

export const metadata: Metadata = {
  title: "AI Agent Automation | Predarc",
  description:
    "Connect an AI agent to Predarc with wallet-authorized prediction limits.",
};

export default function AgentAutomationPage() {
  return <AgentAutomationClient />;
}
