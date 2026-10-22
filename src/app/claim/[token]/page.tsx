import {BrandLockup} from "@/components/brand/BrandLockup";
import {QrSurface} from "@/components/ui/QrSurface";
import {connectToDatabase} from "@/lib/db";
import {getServerEnv} from "@/lib/env";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {claimUsability} from "@/lib/manualVerification/claimToken";
import {claimUrl, findRequestByClaimToken} from "@/lib/manualVerification/claims";

export const metadata = {title: "Add to DogTag"};

/**
 * `/claim/<token>` - the page behind the magic link and QR in a manual-verification email. Public
 * and side-effect free: opening it (or an email scanner fetching it) changes nothing; the DogTag
 * app redeems the claim via `POST /v1/manual-verification/claims/:token/redeem`. On a phone with
 * the app, the universal link opens the app directly; this page is the fallback (open-in-app
 * button, store links) and, on a computer, shows the QR to scan.
 */
export default async function ClaimPage({params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  await connectToDatabase();
  const request = await findRequestByClaimToken(token);
  const env = getServerEnv();
  const now = Math.floor(Date.now() / 1000);
  const state = !request?.claim ? "invalid" : claimUsability(request.claim, now);
  const pet = request?.petId ? await Pet.findOne({petId: request.petId}, {name: 1}).lean<Pick<PetDoc, "name">>() : null;
  const petName = pet?.name ?? request?.dogtag?.petName ?? "your pet";
  const what = request?.kind === "dogtag" ? `${petName}'s DogTag` : `${petName}'s verified vaccination record`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <BrandLockup height={32} />
      <div className="glass w-full max-w-md rounded-card p-6 text-center">
        {state === "usable" ? (
          <>
            <h1 className="text-section-title text-ink">{what} is ready</h1>
            <p className="mt-2 text-body text-ink-muted">Add it to the DogTag app on your phone.</p>
            <a
              href={`${env.DOGTAG_APP_URL_SCHEME}://claim/${token}`}
              className="glass-action mt-6 inline-block w-full rounded-control px-5 py-3 text-emphasized font-semibold"
            >
              Open in the DogTag app
            </a>
            {(env.DOGTAG_APP_STORE_URL || env.DOGTAG_PLAY_STORE_URL) && (
              <p className="mt-4 text-caption text-ink-muted">
                Don&apos;t have the app?{" "}
                {env.DOGTAG_APP_STORE_URL && (
                  <a className="text-link hover:underline" href={env.DOGTAG_APP_STORE_URL}>
                    App Store
                  </a>
                )}
                {env.DOGTAG_APP_STORE_URL && env.DOGTAG_PLAY_STORE_URL && " · "}
                {env.DOGTAG_PLAY_STORE_URL && (
                  <a className="text-link hover:underline" href={env.DOGTAG_PLAY_STORE_URL}>
                    Google Play
                  </a>
                )}
              </p>
            )}
            <div className="mt-6 hidden flex-col items-center gap-2 border-t border-border pt-6 sm:flex">
              <p className="text-body text-ink-muted">On a computer? Scan this with your phone:</p>
              <QrSurface data={claimUrl(token)} size={200} />
            </div>
            {request?.claim && (
              <p className="mt-4 text-caption text-ink-faint">
                This link works until {new Date(request.claim.exp * 1000).toLocaleDateString("en-US", {dateStyle: "long", timeZone: "UTC"})}.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-section-title text-ink">
              {state === "expired" ? "This link has expired" : state === "revoked" ? "This link was replaced" : "This link isn't valid"}
            </h1>
            <p className="mt-2 text-body text-ink-muted">
              {state === "revoked"
                ? "A newer link was sent to your email - use that one."
                : "Reply to DogTag's email and we'll send you a new link."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
