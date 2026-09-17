import { notFound } from "next/navigation";
import { HASH_PATTERN } from "@/lib/receipts";
import ReceiptsClient from "../ReceiptsClient";
export const metadata = { title: "Payment receipt | Predarc", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!HASH_PATTERN.test(hash)) notFound();
  return <ReceiptsClient key={hash} hash={hash} />;
}
