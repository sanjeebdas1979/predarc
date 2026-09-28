import type { ButtonHTMLAttributes } from "react";

export const colorfulButtonClass = [
  "relative isolate overflow-hidden bg-zinc-900 text-white",
  "shadow-[0_0_20px_rgba(129,140,248,0.22)]",
  "transition-all duration-200 hover:-translate-y-0.5",
  "hover:shadow-[0_0_28px_rgba(236,72,153,0.32)]",
  "before:pointer-events-none before:absolute before:inset-0 before:z-0",
  "before:bg-gradient-to-r before:from-indigo-500 before:via-purple-500 before:to-pink-500",
  "before:opacity-40 before:transition-opacity before:duration-500",
  "hover:before:opacity-80 disabled:hover:translate-y-0",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/70",
].join(" ");

export interface ButtonColorfulProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function ButtonColorful({
  className,
  label = "Explore Components",
  children,
  ...props
}: ButtonColorfulProps) {
  return (
    <button
      className={[colorfulButtonClass, "group", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {children ?? label}
        {children === undefined ? (
          <span aria-hidden="true">?</span>
        ) : null}
      </span>
    </button>
  );
}
