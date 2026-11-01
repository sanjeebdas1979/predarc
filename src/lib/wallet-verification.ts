import {
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";

const FORECAST_REGISTRY_OWNER_ABI = [
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const WALLET_VERIFICATION_CALL_DATA =
  encodeFunctionData({
    abi: FORECAST_REGISTRY_OWNER_ABI,
    functionName: "owner",
  });

type BuilderAttribution =
  | { dataSuffix: Hex }
  | Record<string, never>;

/**
 * Build a gas-only transaction to Predarc's ForecastRegistryV2 contract.
 *
 * Do not verify with an attributed self-transfer. An EIP-7702 delegated
 * account executes calldata sent to itself, so the ERC-8021 Builder Code
 * suffix can invoke the wallet implementation and revert. Calling the
 * registry's read-only owner() selector avoids that smart-account edge case,
 * transfers no native currency and still attributes Base transactions.
 */
export function createWalletVerificationTransaction<
  const TChainId extends number,
>(
  registryAddress: Address,
  chainId: TChainId,
  attribution: BuilderAttribution
) {
  return {
    to: registryAddress,
    value: 0n,
    data: WALLET_VERIFICATION_CALL_DATA,
    chainId,
    ...attribution,
  };
}
