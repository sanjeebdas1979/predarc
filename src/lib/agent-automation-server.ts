import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { verifyTypedData } from "viem";

import {
  buildAgentAuthorizationTypedData,
  canonicalAgentPolicy,
  type AgentAutomationPolicy,
} from "@/lib/agent-automation-core";

const AGENT_TOKEN_PATTERN = /^pa_agent_[A-Za-z0-9_-]{43}$/;

export function agentPolicyHash(policy: AgentAutomationPolicy): string {
  return createHash("sha256").update(canonicalAgentPolicy(policy)).digest("hex");
}

export function createAgentApiToken(): string {
  return `pa_agent_${randomBytes(32).toString("base64url")}`;
}

export function hashAgentApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAgentChallengeNonce(): string {
  return randomBytes(32).toString("hex");
}

export function readAgentBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);

  return AGENT_TOKEN_PATTERN.test(token) ? token : null;
}

export async function verifyAgentPolicyAuthorization(input: {
  wallet: string;
  chainId: number;
  challengeId: string;
  nonce: string;
  policy: AgentAutomationPolicy;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    const typedData = buildAgentAuthorizationTypedData(input);

    return await verifyTypedData({
      address: input.wallet.toLowerCase() as `0x${string}`,
      signature: input.signature,
      ...typedData,
    });
  } catch {
    return false;
  }
}
