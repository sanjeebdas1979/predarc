import { Attribution } from "ox/erc8021";
import { isHex, type EIP1193Provider, type Hex } from "viem";

export const BASE_BUILDER_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;
const BASE_MAINNET_CHAIN_ID = 8453;

export function normalizeBaseBuilderCode(
  value: string | undefined
): string | undefined {
  const code = value?.trim();

  if (!code) {
    return undefined;
  }

  if (!BASE_BUILDER_CODE_PATTERN.test(code)) {
    throw new Error(
      "NEXT_PUBLIC_BASE_BUILDER_CODE must contain 1-32 lowercase letters, numbers or underscores."
    );
  }

  return code;
}

export function createBaseBuilderDataSuffix(code: string): Hex {
  const normalized = normalizeBaseBuilderCode(code);

  if (!normalized) {
    throw new Error("A Base Builder Code is required.");
  }

  return Attribution.toDataSuffix({
    codes: [normalized],
  });
}

export const BASE_BUILDER_CODE = normalizeBaseBuilderCode(
  process.env.NEXT_PUBLIC_BASE_BUILDER_CODE
);

export const BASE_BUILDER_DATA_SUFFIX = BASE_BUILDER_CODE
  ? createBaseBuilderDataSuffix(BASE_BUILDER_CODE)
  : undefined;

export function baseBuilderAttribution(
  chainId: number
): { dataSuffix: Hex } | Record<string, never> {
  return chainId === BASE_MAINNET_CHAIN_ID && BASE_BUILDER_DATA_SUFFIX
    ? { dataSuffix: BASE_BUILDER_DATA_SUFFIX }
    : {};
}

function appendSuffix(data: unknown, suffix: Hex): Hex {
  const current = typeof data === "string" && isHex(data) ? data : "0x";

  if (current.toLowerCase().endsWith(suffix.slice(2).toLowerCase())) {
    return current;
  }

  return `${current}${suffix.slice(2)}` as Hex;
}

type ProviderRequest = {
  method: string;
  params?: readonly unknown[] | object;
};

export function attributeBaseProviderRequest(
  request: ProviderRequest,
  chainId: number,
  dataSuffix: Hex | undefined = BASE_BUILDER_DATA_SUFFIX
): ProviderRequest {
  if (
    chainId !== BASE_MAINNET_CHAIN_ID ||
    !dataSuffix ||
    !Array.isArray(request.params) ||
    request.params.length === 0
  ) {
    return request;
  }

  if (request.method === "eth_sendTransaction") {
    const transaction = request.params[0];

    if (!transaction || typeof transaction !== "object") {
      return request;
    }

    return {
      ...request,
      params: [
        {
          ...transaction,
          data: appendSuffix(
            (transaction as { data?: unknown }).data,
            dataSuffix
          ),
        },
        ...request.params.slice(1),
      ],
    };
  }

  if (request.method === "wallet_sendCalls") {
    const callRequest = request.params[0];

    if (!callRequest || typeof callRequest !== "object") {
      return request;
    }

    const existingCapabilities =
      "capabilities" in callRequest &&
      callRequest.capabilities &&
      typeof callRequest.capabilities === "object"
        ? callRequest.capabilities
        : {};

    if ("dataSuffix" in existingCapabilities) {
      return request;
    }

    return {
      ...request,
      params: [
        {
          ...callRequest,
          capabilities: {
            ...existingCapabilities,
            dataSuffix: {
              value: dataSuffix,
              optional: true,
            },
          },
        },
        ...request.params.slice(1),
      ],
    };
  }

  return request;
}

/**
 * Circle App Kit receives an EIP-1193 provider rather than a Wagmi write call.
 * This proxy adds Predarc's suffix only to Base submission methods while
 * preserving the provider's event methods and `this` binding.
 */
export function withBaseBuilderAttribution(
  provider: EIP1193Provider,
  chainId: number
): EIP1193Provider {
  if (chainId !== BASE_MAINNET_CHAIN_ID || !BASE_BUILDER_DATA_SUFFIX) {
    return provider;
  }

  return new Proxy(provider, {
    get(target, property) {
      if (property === "request") {
        return (request: ProviderRequest) =>
          target.request(
            attributeBaseProviderRequest(request, chainId) as Parameters<
              EIP1193Provider["request"]
            >[0]
          );
      }

      const value = Reflect.get(target, property, target);

      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
