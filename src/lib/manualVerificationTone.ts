import type {StatusTone} from "@/components/ui/StatusBadge";
import type {ManualVerificationKind, ManualVerificationStatus} from "@/lib/manualVerification/stateMachine";

/** Display labels/tones for manual verification requests (the queue and detail pages). */
export const manualVerificationKindLabel: Record<ManualVerificationKind, string> = {
  dogtag: "DogTag",
  vaccination: "Vaccination",
};

export const manualVerificationStatusLabel: Record<ManualVerificationStatus, string> = {
  submitted: "New",
  in_review: "In review",
  approved: "Approved",
  bound: "Ready to issue",
  issued: "Issued",
  claimed: "In owner's app",
  rejected: "Rejected",
  cancelled: "Cancelled",
  needs_attention: "Needs attention",
};

export const manualVerificationStatusTone: Record<ManualVerificationStatus, StatusTone> = {
  submitted: "info",
  in_review: "info",
  approved: "warn",
  bound: "warn",
  issued: "ok",
  claimed: "ok",
  rejected: "neutral",
  cancelled: "neutral",
  needs_attention: "danger",
};

/** Short "what happens next" line per status, from the reviewer's point of view. */
export function nextStepLabel(kind: ManualVerificationKind, status: ManualVerificationStatus): string {
  switch (status) {
    case "submitted":
      return "Open and review";
    case "in_review":
      return kind === "vaccination" ? "Check the document, then approve or reject" : "Check the details, then approve or reject";
    case "approved":
      return kind === "vaccination" ? "Sign the record in MetaMask" : "Waiting for the owner's app to bind";
    case "bound":
      return "Sign the DogTag in MetaMask";
    case "issued":
      return kind === "vaccination" ? "Waiting for the owner to claim" : "Done";
    case "claimed":
      return "Done";
    case "needs_attention":
      return "Retry the on-chain step";
    case "rejected":
      return "Nothing - this request was rejected";
    case "cancelled":
      return "Nothing - the owner cancelled this request";
  }
}

const EVENT_LABELS: Record<string, string> = {
  submitted: "Request submitted",
  review_started: "Review started",
  approved: "Approved - record drafted",
  rejected: "Rejected",
  cancelled: "Cancelled by the owner",
  record_confirmed_on_chain: "Record confirmed on chain",
  record_issuance_error: "On-chain issuance failed",
  claim_resent: "Claim link re-sent",
};

/** Audit-trail wording for one event. */
export function eventLabel(action: string, actorType: "owner" | "staff" | "system"): string {
  if (action === "submitted" && actorType === "staff") return "Filed on the owner's behalf";
  const known = EVENT_LABELS[action];
  if (known) return known;
  const text = action.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "3h", "2d" - time since submission, for the queue's age column. */
export function formatAge(from: Date | string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
