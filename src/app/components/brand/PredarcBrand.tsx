"use client";
import Link from "next/link";

import Image from "next/image";

type PredarcBrandProps = {
  compact?: boolean;
};

export default function PredarcBrand({
  compact = false,
}: PredarcBrandProps) {
  return (
    <Link href="/" aria-label="Predarc home" className="inline-flex rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70">
      <div className="flex items-center gap-3.5">

      <div
        className={`relative shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30 shadow-[0_0_28px_rgba(249,115,22,0.12)] ${
          compact
            ? "h-10 w-10"
            : "h-16 w-16"
        }`}
      >
        <Image
          src="/predarc-logo.png"
          alt="Predarc logo"
          fill
          priority
          sizes={
            compact
              ? "40px"
              : "64px"
          }
          className="object-cover"
        />
      </div>

      <div className="leading-none">
        <p
          className={`font-black tracking-tight text-white ${
            compact
              ? "text-xl"
              : "text-[1.75rem]"
          }`}
        >
          Predarc
        </p>

        {!compact && (
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
            Built on Arc
          </p>
        )}
      </div>
          </div>
    </Link>
  );
}