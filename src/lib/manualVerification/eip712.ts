import {keccak256, stringToBytes, type Address, type Hex} from "viem";

/**
 * The `ManualVerificationRequest` EIP-712 struct - how the DogTag mobile app proves a manual-
 * verification call comes from the pet owner's own wallet (docs/MANUAL-VERIFICATION-API.md).
 *
 * Modelled on `lib/booking/mobileEip712.ts` and deliberately a SEPARATE copy rather than a
 * generalisation of it: a distinct domain name and primary type mean a booking signature can never
 * be replayed as a manual-verification request or vice versa. Same idiom as booking: the server
 * rebuilds the exact domain/message from server-trusted values and trusts nothing off the wire
 * except the claimed wallet, the signature and the signed timestamps/nonce.
 *
 * `payloadHash` binds the signature to the exact request body: the app sends its JSON payload as a
 * string (`payloadJson`) and signs `keccak256(utf8(payloadJson))`; the server hashes those exact
 * bytes BEFORE parsing them, so no JSON canonicalisation has to match across two codebases.
 * `action` binds it to one endpoint, so a "list my requests" signature cannot be replayed as a
 * submission.
 *
 * THE PRODUCTION DEFINITION every route verifies against. tests/unit/manualVerification/
 * eip712.vectors.test.ts keeps its own hardcoded copy so a typo here cannot pass unnoticed.
 */
export const MANUAL_VERIFICATION_PRIMARY_TYPE = "ManualVerificationRequest" as const;

export const MANUAL_VERIFICATION_TYPES = {
  ManualVerificationRequest: [
    {name: "clinic", type: "address"},
    {name: "action", type: "bytes32"},
    {name: "payloadHash", type: "bytes32"},
    {name: "wallet", type: "address"},
    {name: "nonce", type: "bytes32"},
    {name: "issuedAt", type: "uint64"},
    {name: "deadline", type: "uint64"},
  ],
} as const;

export interface ManualVerificationDomain {
  name: "DogTagManualVerification";
  version: "1";
  chainId: number;
  verifyingContract: Address;
}

export function buildManualVerificationDomain(chainId: number, verifyingContract: Address): ManualVerificationDomain {
  return {name: "DogTagManualVerification", version: "1", chainId, verifyingContract};
}

/** Every signed endpoint's action name. The signed value is `keccak256(utf8(name))`. */
export const MANUAL_VERIFICATION_ACTIONS = [
  "submit_dogtag",
  "submit_vaccination",
  "list",
  "get",
  "cancel",
  "redeem",
] as const;
export type ManualVerificationAction = (typeof MANUAL_VERIFICATION_ACTIONS)[number];

export function actionHash(action: ManualVerificationAction): Hex {
  return keccak256(stringToBytes(action));
}

/** `keccak256` of the payload string's exact UTF-8 bytes - the `payloadHash` the owner signs. */
export function computePayloadHash(payloadJson: string): Hex {
  return keccak256(stringToBytes(payloadJson));
}

/** Field values in the shape viem's `recoverTypedDataAddress`/`signTypedData` want (uint64 as bigint). */
export interface ManualVerificationMessage {
  clinic: Address;
  action: Hex;
  payloadHash: Hex;
  wallet: Address;
  nonce: Hex;
  issuedAt: bigint;
  deadline: bigint;
}
