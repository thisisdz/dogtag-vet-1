import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import {cn} from "@/lib/cn";
import {AlertIcon} from "@/components/ui/icons";

// Inputs stay solid (not glass) for legibility; the stronger border keeps them visible on a frosted
// card (docs/BRAND.md).
const baseControlClasses =
  "w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const {className, ...rest} = props;
  return <input className={cn(baseControlClasses, className)} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const {className, ...rest} = props;
  return <select className={cn(baseControlClasses, className)} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const {className, ...rest} = props;
  return <textarea className={cn(baseControlClasses, className)} {...rest} />;
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

// Liquid-glass layers (globals.css): primary is red glass, secondary is frost glass. Danger is solid
// Ember and always carries an alert icon (rendered by Button below), because Ember and Tag Red are
// too close to tell apart by color alone.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "glass-action",
  secondary: "glass text-ink hover:bg-surface",
  danger: "bg-danger text-on-brand hover:bg-brand-hover",
  ghost: "text-ink hover:bg-brand-soft",
};

// "sm" is for controls that live inside an already-dense DESKTOP row (a DataTable's own actions
// column, matching design-system.md's "density with breathing room: compact rows" principle)
// rather than standing alone as a page-level action - see WalletsPanel.tsx's per-wallet
// Receipt/Revoke controls. It is NOT a substitute for design-system.md's separate "44px touch
// targets on mobile" rule - that rule governs the native mobile apps' own components, never this
// web control, and nothing in this app renders "sm" as a mobile tap target.
const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-caption",
  md: "px-4 py-2 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({variant = "primary", size = "md", className, children, ...rest}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {variant === "danger" && <AlertIcon size={size === "sm" ? 14 : 16} className="shrink-0" />}
      {children}
    </button>
  );
}
