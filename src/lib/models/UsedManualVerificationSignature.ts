import {Schema} from "mongoose";
import {getOrCreateModel} from "@/lib/models/registerModel";

/**
 * Replay protection for signed manual-verification calls: each (wallet, action, nonce) may be used
 * once. Rows expire one day after the signature's own deadline - by then the signature is dead
 * anyway (`verifyManualVerificationSignature` rejects expired claims), so nothing is lost.
 */
export interface UsedManualVerificationSignatureDoc {
  digestKey: string;
  expiresAt: Date;
}

const usedManualVerificationSignatureSchema = new Schema<UsedManualVerificationSignatureDoc>({
  digestKey: {type: String, required: true, unique: true},
  expiresAt: {type: Date, required: true, expires: 0},
});

export const UsedManualVerificationSignature = getOrCreateModel<UsedManualVerificationSignatureDoc>(
  "UsedManualVerificationSignature",
  usedManualVerificationSignatureSchema,
);

/** Records a signature as used; returns false if it was already used (a replay). */
export async function consumeSignature(digestKey: string, deadline: number): Promise<boolean> {
  try {
    await UsedManualVerificationSignature.create({
      digestKey,
      expiresAt: new Date((deadline + 24 * 60 * 60) * 1000),
    });
    return true;
  } catch (err) {
    if ((err as {code?: number}).code === 11000) return false;
    throw err;
  }
}
