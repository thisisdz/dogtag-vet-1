import Link from "next/link";
import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {PageHeader} from "@/components/shell/PageHeader";
import {Button} from "@/components/ui/controls";
import {DataTable} from "@/components/ui/DataTable";
import {StatusBadge} from "@/components/ui/StatusBadge";
import {connectToDatabase} from "@/lib/db";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {MANUAL_VERIFICATION_STATUSES, NEEDS_REVIEWER_FILTER, type ManualVerificationStatus} from "@/lib/manualVerification/stateMachine";
import {
  formatAge,
  manualVerificationKindLabel,
  manualVerificationStatusLabel,
  manualVerificationStatusTone,
  nextStepLabel,
} from "@/lib/manualVerificationTone";
import {isVetOrOwner} from "@/lib/staffRoleTone";
import {toPlain} from "@/lib/toPlain";
import {ManualVerificationFilters} from "@/app/(app)/manual-verification/ManualVerificationFilters";

interface SearchParams {
  status?: string;
  kind?: string;
}

/**
 * DogTag's manual verification queue: owner requests for a DogTag or a vaccination verification,
 * reviewed and signed by DogTag itself (separate from the regular vet issuance flows). Oldest first,
 * so nothing waits longest by accident. Vet/owner only, like the other DogTag pages.
 */
export default async function ManualVerificationPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const session = await auth();
  if (!isVetOrOwner(session?.user?.role)) redirect("/dashboard?notice=vet-required");

  const {status = "needs_me", kind} = await searchParams;
  const filter: Record<string, unknown> = {};
  if (status === "needs_me") Object.assign(filter, NEEDS_REVIEWER_FILTER);
  else if ((MANUAL_VERIFICATION_STATUSES as readonly string[]).includes(status)) filter.status = status as ManualVerificationStatus;
  if (kind === "dogtag" || kind === "vaccination") filter.kind = kind;

  await connectToDatabase();
  const requests = await ManualVerificationRequest.find(filter, {events: 0})
    .sort({submittedAt: 1})
    .limit(500)
    .lean<ManualVerificationRequestDoc[]>()
    .then(toPlain);
  const petIds = requests.map((r) => r.petId).filter((id): id is string => Boolean(id));
  const pets = await Pet.find({petId: {$in: petIds}}, {petId: 1, name: 1}).lean<Pick<PetDoc, "petId" | "name">[]>();
  const petName = new Map(pets.map((p) => [p.petId, p.name]));
  const now = Date.now();

  const pet = (r: ManualVerificationRequestDoc) => (r.petId ? petName.get(r.petId) : r.dogtag?.petName) ?? "Unnamed pet";
  const validUntil = (r: ManualVerificationRequestDoc) => (r.vaccination?.confirmedFields as {validUntil?: string} | undefined)?.validUntil;
  const emptyAction = (
    <>
      <Link href="/manual-verification/new">
        <Button>New request</Button>
      </Link>
      {status === "needs_me" && (
        <Link href="/manual-verification?status=all">
          <Button variant="secondary">Show all requests</Button>
        </Link>
      )}
    </>
  );
  const emptyMessage = status === "needs_me" ? "Nothing is waiting on you." : "No requests match these filters.";

  return (
    <>
      <PageHeader
        title="Manual verification"
        description="Owner requests for a DogTag or a vaccination verification, reviewed and issued by DogTag."
        action={
          <Link href="/manual-verification/new">
            <Button>New request</Button>
          </Link>
        }
      />
      <ManualVerificationFilters />

      {/* Phones and tablets: one stacked row per request, no sideways scrolling. */}
      <div className="lg:hidden">
        {requests.length === 0 ? (
          <div className="card rounded-card px-4 py-10 text-center text-body text-ink-muted">
            {emptyMessage}
            <div className="mt-3 flex flex-wrap justify-center gap-2">{emptyAction}</div>
          </div>
        ) : (
          <ul className="card divide-y divide-border overflow-hidden rounded-card">
            {requests.map((r) => (
              <li key={r.requestId}>
                <Link href={`/manual-verification/${r.requestId}`} className="block px-4 py-3 hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-emphasized font-semibold text-ink">{pet(r)}</p>
                      <p className="truncate text-body text-ink-muted">
                        {manualVerificationKindLabel[r.kind]} &middot; {r.requester.name}
                      </p>
                    </div>
                    <StatusBadge tone={manualVerificationStatusTone[r.status]} label={manualVerificationStatusLabel[r.status]} />
                  </div>
                  <p className="mt-1.5 text-caption text-ink-faint">
                    {nextStepLabel(r.kind, r.status)} &middot; waiting {formatAge(r.submittedAt, now)}
                    {validUntil(r) ? ` · valid until ${validUntil(r)}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: the table, trimmed so it fits without scrolling. */}
      <div className="hidden lg:block">
        <DataTable
          columns={[
            {
              key: "pet",
              header: "Pet",
              render: (r: ManualVerificationRequestDoc) => (
                <Link href={`/manual-verification/${r.requestId}`} className="font-medium text-link hover:underline">
                  {pet(r)}
                  <span className="block text-caption font-normal text-ink-muted">{manualVerificationKindLabel[r.kind]}</span>
                </Link>
              ),
            },
            {
              key: "owner",
              header: "Owner",
              render: (r: ManualVerificationRequestDoc) => (
                <span>
                  {r.requester.name}
                  <span className="block text-caption text-ink-muted">{r.requester.email}</span>
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (r: ManualVerificationRequestDoc) => (
                <StatusBadge tone={manualVerificationStatusTone[r.status]} label={manualVerificationStatusLabel[r.status]} />
              ),
            },
            {
              key: "next",
              header: "Next step",
              render: (r: ManualVerificationRequestDoc) => (
                <span>
                  {nextStepLabel(r.kind, r.status)}
                  {validUntil(r) && <span className="block text-caption text-ink-muted">Valid until {validUntil(r)}</span>}
                </span>
              ),
            },
            {key: "age", header: "Waiting", align: "right", mono: true, render: (r: ManualVerificationRequestDoc) => formatAge(r.submittedAt, now)},
          ]}
          rows={requests}
          getRowKey={(r) => r.requestId}
          emptyMessage={emptyMessage}
          emptyAction={emptyAction}
        />
      </div>
    </>
  );
}
