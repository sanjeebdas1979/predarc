import { notFound } from "next/navigation";
import { HASH_PATTERN } from "@/lib/receipts";
import { normalizePredarcChainId } from "@/lib/predarc-networks";
import ReceiptsClient from "../ReceiptsClient";
export const metadata = { title: "Payment receipt | Predarc", robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ hash: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const { hash } = await params;
  if (!HASH_PATTERN.test(hash)) notFound();
  const { chain } = await searchParams;
  const receiptChainId = normalizePredarcChainId(chain) ?? undefined;
  return (
    <ReceiptsClient
      key={`${hash}:${receiptChainId ?? "arc"}`}
      hash={hash}
      receiptChainId={receiptChainId}
    />
  );
}
