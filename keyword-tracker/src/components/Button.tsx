import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui";

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-border bg-surface-2 text-white hover:bg-surface-2/70",
  danger: "border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
