import {notFound, redirect} from "next/navigation";
import {auth} from "@/auth";
import {PageHeader} from "@/components/shell/PageHeader";
import {StatusBadge} from "@/components/ui/StatusBadge";
import {connectToDatabase} from "@/lib/db";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {ManualVerificationDocument, type ManualVerificationDocumentDoc} from "@/lib/models/ManualVerificationDocument";
import {syncRequest} from "@/lib/manualVerification/sync";
import {manualVerificationKindLabel, manualVerificationStatusLabel, manualVerificationStatusTone} from "@/lib/manualVerificationTone";
import {isVetOrOwner} from "@/lib/staffRoleTone";
import {toPlain} from "@/lib/toPlain";
import {getClinicSettings} from "@/lib/models/ClinicSettings";
import {IssuerReadinessBanner} from "@/components/IssuerReadinessBanner";
import {RequestReview} from "@/app/(app)/manual-verification/[requestId]/RequestReview";

/** One manual verification request: the owner's document beside the record form, the decision
 * controls, and the audit trail. Synced with the chain on every load. */
export default async function ManualVerificationRequestPage({params}: {params: Promise<{requestId: string}>}) {
  const session = await auth();
  if (!isVetOrOwner(session?.user?.role)) redirect("/dashboard?notice=vet-required");

  const {requestId} = await params;
  await connectToDatabase();
  const found = await ManualVerificationRequest.findOne({requestId}).lean<ManualVerificationRequestDoc>();
  if (!found) notFound();
  const request = toPlain(await syncRequest(found));

  const pet = request.petId ? await Pet.findOne({petId: request.petId}).lean<PetDoc>().then(toPlain) : null;
  const record = request.vaccination?.recordId
    ? await RecordArtifact.findOne({recordId: request.vaccination.recordId}).lean<RecordArtifactDoc>().then(toPlain)
    : null;
  const documentMeta = request.vaccination?.documentId
    ? await ManualVerificationDocument.findOne(
        {documentId: request.vaccination.documentId, deletedAt: {$exists: false}},
        {contentType: 1, byteLength: 1, _id: 0},
      ).lean<Pick<ManualVerificationDocumentDoc, "contentType" | "byteLength">>()
    : null;

  // Only while there is still something to sign for this request.
  const signingAhead = ["submitted", "in_review", "approved", "bound", "issued", "needs_attention"].includes(request.status);
  const settings = signingAhead ? await getClinicSettings() : null;

  return (
    <>
      <PageHeader
        title={`${manualVerificationKindLabel[request.kind]} verification${pet ? ` - ${pet.name}` : ""}`}
        description={`Requested by ${request.requester.name} (${request.requester.email})`}
        action={<StatusBadge tone={manualVerificationStatusTone[request.status]} label={manualVerificationStatusLabel[request.status]} />}
      />
      {settings && (
        <IssuerReadinessBanner
          input={{name: settings.businessProfile?.name, domain: settings.businessProfile?.domain, cloneAddress: settings.cloneAddress}}
        />
      )}
      <RequestReview
        request={request}
        pet={pet}
        record={record}
        document={documentMeta ? {contentType: documentMeta.contentType, byteLength: documentMeta.byteLength} : null}
      />
    </>
  );
}
