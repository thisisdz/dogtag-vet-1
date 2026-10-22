/**
 * Manual-verification request lifecycle - one table for both kinds, pure and I/O-free.
 *
 *   submitted -> in_review -> approved -> ...
 *            \-> rejected / cancelled (owner withdraws before a decision)
 *
 *   dogtag:       approved -> bound (owner's app bound the profile) -> issued (Dom signed issueTag)
 *   vaccination:  approved -> issued (Dom signed issueRecord) -> claimed (owner pulled it into the app)
 *
 * `needs_attention` is a holding state when the linked mint session or record lands in `error`;
 * Dom recovers it with the existing retry/confirm tools and the request moves on from there.
 * A lapsed claim link is not a status: it is a property of the claim, and "re-send" issues a new one.
 */
export type ManualVerificationKind = "dogtag" | "vaccination";

export const MANUAL_VERIFICATION_STATUSES = [
  "submitted",
  "in_review",
  "approved",
  "bound",
  "issued",
  "claimed",
  "rejected",
  "cancelled",
  "needs_attention",
] as const;
export type ManualVerificationStatus = (typeof MANUAL_VERIFICATION_STATUSES)[number];

interface Transition {
  to: ManualVerificationStatus;
  /** Restricts a transition to one kind; absent means both. */
  kind?: ManualVerificationKind;
}

const TRANSITIONS: Record<ManualVerificationStatus, readonly Transition[]> = {
  submitted: [{to: "in_review"}, {to: "rejected"}, {to: "cancelled"}],
  in_review: [{to: "approved"}, {to: "rejected"}, {to: "cancelled"}],
  // Dom may still withdraw an approval (rejected) until anything is signed on chain.
  approved: [
    {to: "bound", kind: "dogtag"},
    {to: "issued", kind: "vaccination"},
    {to: "needs_attention"},
    {to: "rejected"},
  ],
  bound: [{to: "issued", kind: "dogtag"}, {to: "needs_attention", kind: "dogtag"}],
  needs_attention: [
    {to: "approved"},
    {to: "bound", kind: "dogtag"},
    {to: "issued"},
    {to: "rejected"},
  ],
  issued: [{to: "claimed", kind: "vaccination"}],
  claimed: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(
  kind: ManualVerificationKind,
  from: ManualVerificationStatus,
  to: ManualVerificationStatus,
): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && (t.kind === undefined || t.kind === kind));
}

/** Statuses with nothing left to do. */
export function isTerminal(kind: ManualVerificationKind, status: ManualVerificationStatus): boolean {
  return MANUAL_VERIFICATION_STATUSES.every((to) => !canTransition(kind, status, to));
}

/** MongoDB filter for the queue's default "needs me" view: everything `waitingOn` attributes to the
 * reviewer, including an approved vaccination (Dom still has to sign `issueRecord`). */
export const NEEDS_REVIEWER_FILTER = {
  $or: [
    {status: {$in: ["submitted", "in_review", "bound", "needs_attention"]}},
    {kind: "vaccination", status: "approved"},
  ],
} as const;

/** Statuses an owner may still withdraw from. */
export function isCancellableByOwner(status: ManualVerificationStatus): boolean {
  return status === "submitted" || status === "in_review";
}

/** Who the request is waiting on - drives the queue's "waiting on" column and "needs me" filter. */
export function waitingOn(kind: ManualVerificationKind, status: ManualVerificationStatus): "reviewer" | "owner" | "none" {
  switch (status) {
    case "submitted":
    case "in_review":
    case "needs_attention":
      return "reviewer";
    case "bound":
      return "reviewer"; // dogtag: owner has bound, Dom signs issueTag next
    case "approved":
      return kind === "dogtag" ? "owner" : "reviewer"; // dogtag: owner binds; vaccination: Dom signs issueRecord
    case "issued":
      return kind === "vaccination" ? "owner" : "none"; // vaccination: owner claims into the app
    default:
      return "none";
  }
}
