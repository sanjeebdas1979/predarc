import type { Metadata } from "next";

import BuilderExplorerClient from "@/app/components/builders/BuilderExplorerClient";

export const metadata: Metadata = {
  title: "Arc Project Explorer | Predarc",
  description:
    "Discover evidence-backed public GitHub activity for projects building on Arc.",
};

export default function BuilderExplorerPage() {
  return <BuilderExplorerClient />;
}
