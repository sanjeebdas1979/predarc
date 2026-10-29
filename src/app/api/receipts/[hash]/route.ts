import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  formatUnits,
  http,
  isAddress,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { base } from "viem/chains";

import {
  HASH_PATTERN,
  isDirectPayment,
  receiptUsdcAbi,
  receiptUsdcDecimals,
} from "@/lib/receipts";
import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getPredarcNetwork,
  normalizePredarcChainId,
} from "@/lib/predarc-networks";

export const dynamic = "force-dynamic";

const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [getPredarcNetwork(ARC_MAINNET_CHAIN_ID).rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: getPredarcNetwork(ARC_MAINNET_CHAIN_ID).explorerUrl,
    },
  },
});

const clients = {
  [ARC_MAINNET_CHAIN_ID]: createPublicClient({
    chain: arcMainnet,
    transport: http(getPredarcNetwork(ARC_MAINNET_CHAIN_ID).rpcUrl, {
      timeout: 10_000,
      retryCount: 0,
    }),
  }),
  [BASE_MAINNET_CHAIN_ID]: createPublicClient({
    chain: base,
    transport: http(getPredarcNetwork(BASE_MAINNET_CHAIN_ID).rpcUrl, {
      timeout: 10_000,
      retryCount: 0,
    }),
  }),
} as const;

function baseUsdcPayment(
  tx: { to: Address | null; value: bigint; input: Hex; from: Address },
  receipt: { status: string; logs: TransactionReceipt["logs"] }
): { to: Address; amount: bigint } | null {
  const network = getPredarcNetwork(BASE_MAINNET_CHAIN_ID);
  if (
    tx.to?.toLowerCase() !== network.usdcAddress.toLowerCase() ||
    tx.value !== 0n ||
    receipt.status !== "success"
  ) {
    return null;
  }

  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: receiptUsdcAbi, data: tx.input });
  } catch {
    return null;
  }
  if (decoded.functionName !== "transfer" || !decoded.args) return null;
  const [to, amount] = decoded.args;
  if (
    typeof to !== "string" ||
    !isAddress(to) ||
    typeof amount !== "bigint" ||
    amount <= 0n
  ) {
    return null;
  }

  const matchingTransfer = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== network.usdcAddress.toLowerCase()) {
      return false;
    }
    try {
      const event = decodeEventLog({
        abi: receiptUsdcAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        event.eventName === "Transfer" &&
        event.args.from.toLowerCase() === tx.from.toLowerCase() &&
        event.args.to.toLowerCase() === to.toLowerCase() &&
        event.args.value === amount
      );
    } catch {
      return false;
    }
  });

  return matchingTransfer ? { to, amount } : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  if (!HASH_PATTERN.test(hash)) {
    return NextResponse.json(
      { error: "Invalid transaction hash." },
      { status: 400 }
    );
  }

  const chainId =
    normalizePredarcChainId(request.nextUrl.searchParams.get("chainId")) ??
    ARC_MAINNET_CHAIN_ID;
  const network = getPredarcNetwork(chainId);
  const client = clients[chainId];

  try {
    if ((await client.getChainId()) !== chainId) {
      throw new Error("RPC chain mismatch");
    }
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: hash as Hash }),
      client.getTransactionReceipt({ hash: hash as Hash }),
    ]);
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "Transaction reverted. No payment receipt was issued." },
        { status: 422 }
      );
    }

    let recipient: `0x${string}`;
    let amount: bigint;
    if (chainId === ARC_MAINNET_CHAIN_ID) {
      if (!isDirectPayment(tx, receipt.status) || !tx.to) {
        return NextResponse.json(
          {
            error:
              "This is not a supported direct native-USDC transfer on Arc Mainnet.",
          },
          { status: 422 }
        );
      }
      recipient = tx.to;
      amount = tx.value;
    } else {
      const payment = baseUsdcPayment(tx, receipt);
      if (!payment) {
        return NextResponse.json(
          {
            error:
              "This is not a supported official-USDC transfer on Base Mainnet.",
          },
          { status: 422 }
        );
      }
      recipient = payment.to;
      amount = payment.amount;
    }

    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash || tx.blockHash !== receipt.blockHash) {
      throw new Error("Inconsistent block data");
    }

    return NextResponse.json(
      {
        chainId,
        network: network.label,
        hash: receipt.transactionHash,
        from: tx.from,
        to: recipient,
        amount: formatUnits(amount, receiptUsdcDecimals(chainId)),
        currency: "USDC",
        fee: formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18),
        feeCurrency: network.nativeCurrency,
        blockNumber: receipt.blockNumber.toString(),
        timestamp: Number(block.timestamp),
        status: "confirmed",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const missing =
      name === "TransactionNotFoundError" ||
      name === "TransactionReceiptNotFoundError";
    return NextResponse.json(
      {
        error: missing
          ? `Not confirmed or not found on ${network.label}. Check the hash and selected network.`
          : `${network.label} could not be reached or verified. Please retry; no receipt has been issued.`,
      },
      { status: missing ? 404 : 503 }
    );
  }
}
