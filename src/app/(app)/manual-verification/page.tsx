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
      <DataTable
        columns={[
          {
            key: "request",
            header: "Request",
            render: (r: ManualVerificationRequestDoc) => (
              <Link href={`/manual-verification/${r.requestId}`} className="font-medium text-link hover:underline">
                {manualVerificationKindLabel[r.kind]}
              </Link>
            ),
          },
          {
            key: "pet",
            header: "Pet",
            render: (r: ManualVerificationRequestDoc) => (r.petId ? petName.get(r.petId) : r.dogtag?.petName) ?? "-",
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
          {key: "next", header: "Next step", render: (r: ManualVerificationRequestDoc) => nextStepLabel(r.kind, r.status)},
          {key: "age", header: "Waiting", align: "right", mono: true, render: (r: ManualVerificationRequestDoc) => formatAge(r.submittedAt, now)},
          {
            key: "validUntil",
            header: "Vaccine valid until",
            render: (r: ManualVerificationRequestDoc) =>
              (r.vaccination?.confirmedFields as {validUntil?: string} | undefined)?.validUntil ?? "-",
          },
        ]}
        rows={requests}
        getRowKey={(r) => r.requestId}
        emptyMessage={status === "needs_me" ? "Nothing waiting on you." : "No requests match these filters."}
      />
    </>
  );
}
