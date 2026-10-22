import {Schema} from "mongoose";
import {randomUUID} from "node:crypto";
import {getOrCreateModel} from "@/lib/models/registerModel";
import {
  MANUAL_VERIFICATION_STATUSES,
  type ManualVerificationKind,
  type ManualVerificationStatus,
} from "@/lib/manualVerification/stateMachine";
import {MANUAL_VERIFICATION_REJECT_REASON_CODES, type ManualVerificationRejectReason} from "@/lib/manualVerification/reasonCodes";
import type {ClaimState} from "@/lib/manualVerification/claimToken";

/**
 * One request in DogTag's MANUAL verification track (docs/MANUAL-VERIFICATION-PLAN.md): an owner
 * asks DogTag - not a treating vet - to issue a DogTag ("dogtag") or to verify a vaccination
 * document and issue the record ("vaccination"). The regular vet issuance flows never create or
 * read these.
 *
 * Nested submission blocks (`dogtag.profile`, `vaccination.confirmedFields`, ...) are stored as
 * Mixed and validated by the zod schemas the existing tag/record flows already use, at the API
 * boundary, rather than re-declared here.
 */
export type ManualVerificationSource = "app" | "staff_on_behalf";

export interface ManualVerificationEvent {
  at: Date;
  actor: {type: "owner" | "staff" | "system"; id?: string};
  action: string;
  from?: ManualVerificationStatus;
  to?: ManualVerificationStatus;
  note?: string;
}

export interface ManualVerificationRequestDoc {
  requestId: string;
  kind: ManualVerificationKind;
  status: ManualVerificationStatus;
  source: ManualVerificationSource;

  requester: {wallet?: string; email: string; name: string; phone?: string};
  clientId?: string;
  petId?: string;

  dogtag?: {
    petName: string;
    profile: Record<string, unknown>;
    microchip?: Record<string, unknown>;
    ownerIdentity: Record<string, unknown>;
    /** Set at approval: the mint session the app binds into, and its allocated tag id. */
    mintSessionId?: string;
    dogTagIdDec?: string;
  };

  vaccination?: {
    dogTagIdDec?: string;
    documentId: string;
    documentSha256: string;
    ownerNotes?: string;
    /** What the certificate itself says - kept off chain, shown as "transcribed from document". */
    certificate?: {vetClinicName?: string; vetName?: string; microchipOnCert?: string};
    /** The reviewer-confirmed record fields (VaccinationRecordFormInput shape). */
    confirmedFields?: Record<string, unknown>;
    /** Set at approval: the RecordArtifact Dom signs on chain. */
    recordId?: string;
  };

  decision?: {reasonCode?: ManualVerificationRejectReason; note?: string; decidedBy: string; decidedAt: Date};

  claim?: ClaimState & {issuedAt: Date; sentAt?: Date; firstRedeemedAt?: Date; redeemCount: number};

  submittedAt: Date;
  firstReviewedAt?: Date;
  approvedAt?: Date;
  issuedAt?: Date;
  claimedAt?: Date;
  closedAt?: Date;

  events: ManualVerificationEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<ManualVerificationEvent>(
  {
    at: {type: Date, required: true},
    actor: {
      type: {type: String, enum: ["owner", "staff", "system"], required: true},
      id: String,
    },
    action: {type: String, required: true},
    from: {type: String, enum: MANUAL_VERIFICATION_STATUSES},
    to: {type: String, enum: MANUAL_VERIFICATION_STATUSES},
    note: String,
  },
  {_id: false},
);

const manualVerificationRequestSchema = new Schema<ManualVerificationRequestDoc>(
  {
    requestId: {type: String, required: true, unique: true, default: () => randomUUID()},
    kind: {type: String, enum: ["dogtag", "vaccination"], required: true},
    status: {type: String, enum: MANUAL_VERIFICATION_STATUSES, required: true, default: "submitted"},
    source: {type: String, enum: ["app", "staff_on_behalf"], required: true},
    requester: {
      wallet: {type: String, lowercase: true, trim: true},
      email: {type: String, required: true, lowercase: true, trim: true},
      name: {type: String, required: true, trim: true},
      phone: {type: String, trim: true},
    },
    clientId: String,
    petId: String,
    dogtag: {
      type: new Schema(
        {
          petName: {type: String, required: true},
          profile: {type: Schema.Types.Mixed, required: true},
          microchip: Schema.Types.Mixed,
          ownerIdentity: {type: Schema.Types.Mixed, required: true},
          mintSessionId: String,
          dogTagIdDec: String,
        },
        {_id: false, minimize: false},
      ),
      default: undefined,
    },
    vaccination: {
      type: new Schema(
        {
          dogTagIdDec: String,
          documentId: {type: String, required: true},
          documentSha256: {type: String, required: true},
          ownerNotes: String,
          certificate: {vetClinicName: String, vetName: String, microchipOnCert: String},
          confirmedFields: Schema.Types.Mixed,
          recordId: String,
        },
        {_id: false, minimize: false},
      ),
      default: undefined,
    },
    decision: {
      type: new Schema(
        {
          reasonCode: {type: String, enum: MANUAL_VERIFICATION_REJECT_REASON_CODES},
          note: String,
          decidedBy: {type: String, required: true},
          decidedAt: {type: Date, required: true},
        },
        {_id: false},
      ),
      default: undefined,
    },
    claim: {
      type: new Schema(
        {
          tokenHash: {type: String, required: true},
          exp: {type: Number, required: true},
          revokedAt: Date,
          issuedAt: {type: Date, required: true},
          sentAt: Date,
          firstRedeemedAt: Date,
          redeemCount: {type: Number, required: true, default: 0},
        },
        {_id: false},
      ),
      default: undefined,
    },
    submittedAt: {type: Date, required: true, default: () => new Date()},
    firstReviewedAt: Date,
    approvedAt: Date,
    issuedAt: Date,
    claimedAt: Date,
    closedAt: Date,
    events: {type: [eventSchema], default: []},
  },
  {timestamps: true},
);

manualVerificationRequestSchema.index({status: 1, kind: 1, submittedAt: -1});
manualVerificationRequestSchema.index({"requester.wallet": 1, submittedAt: -1});
manualVerificationRequestSchema.index({"claim.tokenHash": 1}, {unique: true, sparse: true});
manualVerificationRequestSchema.index({"vaccination.recordId": 1}, {sparse: true});
manualVerificationRequestSchema.index({"dogtag.mintSessionId": 1}, {sparse: true});

export const ManualVerificationRequest = getOrCreateModel<ManualVerificationRequestDoc>(
  "ManualVerificationRequest",
  manualVerificationRequestSchema,
);

/** Cap on stored events per request - the timeline is for humans, not an unbounded log. */
export const MAX_REQUEST_EVENTS = 100;
