import {connectToDatabase} from "@/lib/db";
import {getServerEnv} from "@/lib/env";
import {enforceRateLimit, errorBody, jsonWithHeaders} from "@/lib/publicApi";
import {findRequestByClaimToken} from "@/lib/manualVerification/claims";
import {redeemClaim} from "@/lib/manualVerification/redeem";

const ROUTE = "/v1/manual-verification/claims/redeem";

/**
 * `POST /v1/manual-verification/claims/:token/redeem` - the DogTag app exchanges an emailed claim
 * link for a fresh delivery session (docs/MANUAL-VERIFICATION-API.md). POST only: opening the link
 * (GET /claim/:token) never redeems anything.
 *
 * 200 `{kind: "vaccination", petName, exportUrl, ttlSecs}` - the app then GETs `exportUrl` with its
 *     existing record-import code (the same `/e/<token>` it scans in clinic).
 * 404 `not_found` (unknown/malformed token), 410 `claim_expired` / `claim_revoked`,
 * 409 `not_ready` / `not_supported`, 429 rate limited.
 */
export async function POST(request: Request, {params}: {params: Promise<{token: string}>}) {
  const limited = enforceRateLimit(request, ROUTE, 20, 60_000);
  if (limited.limited) return limited.response;

  const {token} = await params;
  await connectToDatabase();
  const found = await findRequestByClaimToken(token);
  if (!found) return jsonWithHeaders(errorBody("not_found", "This link isn't valid."), {status: 404, headers: limited.headers});

  const baseUrl = getServerEnv().PUBLIC_BASE_URL ?? new URL(request.url).origin;
  const result = await redeemClaim(found, baseUrl, Math.floor(Date.now() / 1000));
  if (!result.ok) return jsonWithHeaders(errorBody(result.code, result.message), {status: result.status, headers: limited.headers});
  return jsonWithHeaders(
    {kind: result.kind, petName: result.petName, exportUrl: result.exportUrl, ttlSecs: result.ttlSecs},
    {headers: limited.headers},
  );
}
