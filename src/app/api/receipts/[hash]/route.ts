import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http, type Hash } from "viem";
import { arcTestnet } from "viem/chains";
import { HASH_PATTERN, isDirectPayment, RECEIPT_CHAIN_ID } from "@/lib/receipts";

export const dynamic = "force-dynamic";
const client = createPublicClient({ chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.io", { timeout: 10000, retryCount: 0 }) });

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!HASH_PATTERN.test(hash)) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 });
  try {
    if (await client.getChainId() !== RECEIPT_CHAIN_ID) throw new Error("RPC chain mismatch");
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: hash as Hash }),
      client.getTransactionReceipt({ hash: hash as Hash }),
    ]);
    if (receipt.status !== "success") return NextResponse.json({ error: "Transaction reverted. No payment receipt was issued." }, { status: 422 });
    if (!isDirectPayment(tx, receipt.status)) return NextResponse.json({ error: "This transaction is not a supported direct native-USDC transfer." }, { status: 422 });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash || tx.blockHash !== receipt.blockHash) throw new Error("Inconsistent block data");
    return NextResponse.json({ chainId: RECEIPT_CHAIN_ID, network: "Arc Testnet", hash: receipt.transactionHash,
      from: tx.from, to: tx.to, amount: formatUnits(tx.value, 18),
      fee: formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18),
      blockNumber: receipt.blockNumber.toString(), timestamp: Number(block.timestamp), status: "confirmed" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const missing = name === "TransactionNotFoundError" || name === "TransactionReceiptNotFoundError";
    return NextResponse.json({ error: missing ? "Not confirmed or not found on Arc Testnet. Check the hash and try again." : "Arc could not be reached or verified. Please retry; no receipt has been issued." }, { status: missing ? 404 : 503 });
  }
}
