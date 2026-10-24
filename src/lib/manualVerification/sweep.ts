import "server-only";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {recoverInterruptedRecords} from "@/lib/records/bootRecovery";
import {syncRequest} from "@/lib/manualVerification/sync";

export interface SweepResult {
  checked: number;
  issued: number;
  needsAttention: number;
  failed: number;
}

/**
 * The worker's manual verification pass (every MANUAL_VERIFICATION_SYNC_MS). Requests only advance
 * when something syncs them; without this, a record that confirmed while nobody had its request
 * open left the request `approved` and the owner without their claim email.
 *
 * 1. Records of these requests left `issuing` past the staleness window (the reviewer signed, then
 *    closed the tab before the app confirmed) are reconciled against the chain - the same check the
 *    confirm route and boot recovery use.
 * 2. Every request waiting on the chain is synced: active record -> `issued` + claim email (sent at
 *    most once, see sync.ts); failed record -> `needs_attention`.
 */
export async function sweepManualVerification(limit = 200): Promise<SweepResult> {
  const waiting = await ManualVerificationRequest.find(
    {kind: "vaccination", status: {$in: ["approved", "needs_attention"]}, "vaccination.recordId": {$exists: true}},
    {events: 0},
  )
    .sort({approvedAt: 1})
    .limit(limit)
    .lean<ManualVerificationRequestDoc[]>();
  const result: SweepResult = {checked: waiting.length, issued: 0, needsAttention: 0, failed: 0};
  if (waiting.length === 0) return result;

  await recoverInterruptedRecords({recordIds: waiting.map((r) => r.vaccination!.recordId!)});

  for (const request of waiting) {
    try {
      const synced = await syncRequest(request);
      if (synced.status === "issued" && request.status !== "issued") result.issued++;
      else if (synced.status === "needs_attention" && request.status !== "needs_attention") result.needsAttention++;
    } catch (err) {
      result.failed++;
      console.error(`[worker] manual verification sync failed for ${request.requestId}`, err);
    }
  }
  return result;
}
