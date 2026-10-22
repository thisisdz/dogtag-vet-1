import {
  ManualVerificationRequest,
  MAX_REQUEST_EVENTS,
  type ManualVerificationEvent,
  type ManualVerificationRequestDoc,
} from "@/lib/models/ManualVerificationRequest";
import {canTransition, type ManualVerificationStatus} from "@/lib/manualVerification/stateMachine";

export interface TransitionInput {
  request: Pick<ManualVerificationRequestDoc, "requestId" | "kind" | "status">;
  to: ManualVerificationStatus;
  actor: ManualVerificationEvent["actor"];
  action: string;
  note?: string;
  /** Extra fields to set in the same atomic write (timestamps, decision, links...). */
  set?: Record<string, unknown>;
}

export type TransitionResult =
  | {ok: true; request: ManualVerificationRequestDoc}
  | {ok: false; reason: "illegal_transition" | "conflict"};

/**
 * The only way a request changes status. Checks the transition table, then applies the change with
 * a conditional update on the CURRENT status, so two concurrent clicks (or an approve racing an
 * owner cancel) cannot both win: the loser gets `conflict`. Appends an audit event in the same write.
 */
export async function transitionRequest(input: TransitionInput): Promise<TransitionResult> {
  const {request, to} = input;
  if (!canTransition(request.kind, request.status, to)) return {ok: false, reason: "illegal_transition"};

  const event: ManualVerificationEvent = {
    at: new Date(),
    actor: input.actor,
    action: input.action,
    from: request.status,
    to,
    ...(input.note ? {note: input.note} : {}),
  };
  const updated = await ManualVerificationRequest.findOneAndUpdate(
    {requestId: request.requestId, status: request.status},
    {
      $set: {status: to, ...(input.set ?? {})},
      $push: {events: {$each: [event], $slice: -MAX_REQUEST_EVENTS}},
    },
    {new: true},
  ).lean<ManualVerificationRequestDoc>();
  return updated ? {ok: true, request: updated} : {ok: false, reason: "conflict"};
}

/** Appends an audit event without a status change (e.g. "claim re-sent", "fields edited"). */
export async function appendRequestEvent(
  requestId: string,
  event: Omit<ManualVerificationEvent, "at">,
  set?: Record<string, unknown>,
): Promise<ManualVerificationRequestDoc | null> {
  return ManualVerificationRequest.findOneAndUpdate(
    {requestId},
    {
      ...(set ? {$set: set} : {}),
      $push: {events: {$each: [{...event, at: new Date()}], $slice: -MAX_REQUEST_EVENTS}},
    },
    {new: true},
  ).lean<ManualVerificationRequestDoc>();
}
