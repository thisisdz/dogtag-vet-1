import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import {cn} from "@/lib/cn";
import {AlertIcon} from "@/components/ui/icons";

// Inputs stay solid (not glass) for legibility; the stronger border keeps them visible on a card
// (docs/BRAND.md). 16px on phones so iOS Safari does not zoom the page on focus.
const baseControlClasses =
  "w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-[16px] leading-6 sm:text-body text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50";

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

// Primary is the red glass action - one per view. Secondary is a solid outlined button (buttons sit in
// the content layer, where glass does not belong - docs/BRAND.md). Danger is solid
// Ember and always carries an alert icon (rendered by Button below), because Ember and Tag Red are
// too close to tell apart by color alone.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "glass-action",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-surface-2",
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
  // 44px tall on phones (touch), 40px from sm up.
  md: "min-h-11 px-4 py-2 text-body sm:min-h-10",
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
