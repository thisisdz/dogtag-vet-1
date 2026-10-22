"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {Banner} from "@/components/ui/Banner";
import {Button, Input, Select, Textarea} from "@/components/ui/controls";
import {FormField, FormSection} from "@/components/ui/FormSection";
import {KeyValuePanel} from "@/components/ui/KeyValuePanel";
import {Timeline} from "@/components/ui/Timeline";
import {useSnackbar} from "@/components/ui/Snackbar";
import {IssueRecordForm} from "@/components/pets/IssueRecordForm";
import type {ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import type {PetDoc} from "@/lib/models/Pet";
import type {RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {MANUAL_VERIFICATION_REJECT_REASONS, type ManualVerificationRejectReason} from "@/lib/manualVerification/reasonCodes";
import {eventLabel, nextStepLabel} from "@/lib/manualVerificationTone";

const REJECTABLE = new Set(["submitted", "in_review", "approved", "needs_attention"]);

/**
 * The reviewer's working view for one request: the owner's document on the left, the decision on
 * the right (start review -> confirm fields and approve -> sign in MetaMask, or reject with a reason
 * the owner will see), and the audit trail below. The on-chain steps reuse the vet track's
 * IssueRecordForm unchanged from the draft onward.
 */
export function RequestReview({
  request,
  pet,
  record,
  document,
}: {
  request: ManualVerificationRequestDoc;
  pet: PetDoc | null;
  record: RecordArtifactDoc | null;
  /** Null once the document's bytes have been purged (or if it never existed). */
  document: ReviewDocumentInfo | null;
}) {
  const router = useRouter();
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [certificate, setCertificate] = useState({
    vetClinicName: request.vaccination?.certificate?.vetClinicName ?? "",
    vetName: request.vaccination?.certificate?.vetName ?? "",
    microchipOnCert: request.vaccination?.certificate?.microchipOnCert ?? "",
  });
  const [rejecting, setRejecting] = useState(false);
  const [reasonCode, setReasonCode] = useState<ManualVerificationRejectReason>("document_illegible");
  const [note, setNote] = useState("");

  async function post(path: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/manual-verification/${request.requestId}/${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        snackbar.show(json?.error?.message ?? "That didn't work - try again.", "danger");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (await post("reject", {reasonCode, note: note.trim() || undefined})) {
      snackbar.show("Request rejected", "ok");
      setRejecting(false);
    }
  }

  const documentUrl = `/api/manual-verification/${request.requestId}/document`;
  const certificateInput = Object.fromEntries(Object.entries(certificate).filter(([, v]) => v.trim())) as typeof certificate;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-6">
      <Banner
        tone="info"
        title={request.status === "rejected" || request.status === "cancelled" ? "Closed" : `Next: ${nextStepLabel(request.kind, request.status)}`}
      >
        DogTag manual verification - the record is issued by DogTag from the owner&apos;s document, not by a treating vet.
      </Banner>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: the owner's evidence. */}
        <div className="space-y-4">
          {request.vaccination && (
            <div className="glass overflow-hidden rounded-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-caption text-ink-muted">
                <span>Owner&apos;s document</span>
                <a href={documentUrl} target="_blank" rel="noreferrer" className="text-link hover:underline">
                  Open in new tab
                </a>
              </div>
              <DocumentViewer url={documentUrl} document={document} />
            </div>
          )}
          <KeyValuePanel
            title="Request"
            rows={[
              {key: "pet", label: "Pet", value: pet ? <Link className="text-link hover:underline" href={`/pets/${pet.petId}`}>{pet.name}</Link> : "Not linked"},
              {key: "tag", label: "DogTag ID", value: <span className="font-mono">{request.vaccination?.dogTagIdDec ?? pet?.dogTag?.dogTagIdDec ?? "-"}</span>},
              {key: "microchip", label: "Microchip on file", value: <span className="font-mono">{pet?.microchip?.code ?? "-"}</span>},
              {key: "owner", label: "Owner", value: `${request.requester.name} - ${request.requester.email}`},
              {key: "source", label: "Submitted via", value: request.source === "app" ? "DogTag app" : "Staff, on the owner's behalf"},
              {key: "notes", label: "Owner's note", value: request.vaccination?.ownerNotes ?? "-"},
              {key: "hash", label: "Document SHA-256", value: <span className="break-all font-mono text-caption">{request.vaccination?.documentSha256 ?? "-"}</span>},
              ...(request.decision?.reasonCode
                ? [{key: "reason", label: "Rejected because", value: `${MANUAL_VERIFICATION_REJECT_REASONS[request.decision.reasonCode]}${request.decision.note ? ` (${request.decision.note})` : ""}`}]
                : []),
            ]}
          />
        </div>

        {/* Right: the decision. */}
        <div className="space-y-4">
          {request.status === "submitted" && (
            <FormSection title="Start review" helperText="Opening the request tells the owner it's being looked at.">
              <Button onClick={() => post("review")} disabled={busy}>
                Start review
              </Button>
            </FormSection>
          )}

          {request.kind === "vaccination" && request.status === "in_review" && pet && (
            <>
              <FormSection
                title="What the certificate says"
                helperText="Transcribed from the owner's document. Kept with the request, not written on chain."
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Vet clinic on the certificate" htmlFor="vetClinicName">
                    <Input id="vetClinicName" value={certificate.vetClinicName} onChange={(e) => setCertificate((c) => ({...c, vetClinicName: e.target.value}))} />
                  </FormField>
                  <FormField label="Vet name on the certificate" htmlFor="vetName">
                    <Input id="vetName" value={certificate.vetName} onChange={(e) => setCertificate((c) => ({...c, vetName: e.target.value}))} />
                  </FormField>
                  <FormField label="Microchip on the certificate" htmlFor="microchipOnCert" helperText={pet.microchip?.code ? `On file: ${pet.microchip.code}` : undefined}>
                    <Input id="microchipOnCert" value={certificate.microchipOnCert} onChange={(e) => setCertificate((c) => ({...c, microchipOnCert: e.target.value}))} />
                  </FormField>
                </div>
              </FormSection>
              <IssueRecordForm
                petId={pet.petId}
                onDone={() => router.refresh()}
                manualVerification={{requestId: request.requestId, certificate: certificateInput, onApproved: () => router.refresh()}}
              />
            </>
          )}

          {request.kind === "vaccination" && record && ["approved", "needs_attention", "issued", "claimed"].includes(request.status) && pet && (
            <IssueRecordForm petId={pet.petId} onDone={() => router.refresh()} initialRecord={record} />
          )}

          {request.status === "issued" && request.kind === "vaccination" && (
            <Banner tone="ok" title="Issued on chain">
              The owner can now receive this record in the DogTag app.
            </Banner>
          )}

          {REJECTABLE.has(request.status) && (
            <FormSection title="Reject" helperText="The owner sees the reason in the app.">
              {rejecting ? (
                <div className="space-y-3">
                  <FormField label="Reason" htmlFor="reasonCode">
                    <Select id="reasonCode" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as ManualVerificationRejectReason)}>
                      {Object.entries(MANUAL_VERIFICATION_REJECT_REASONS).map(([code, text]) => (
                        <option key={code} value={code}>
                          {text}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Note to the owner" htmlFor="note" helperText={reasonCode === "other" ? "Required" : "Optional"}>
                    <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  </FormField>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={reject} disabled={busy || (reasonCode === "other" && !note.trim())}>
                      Reject request
                    </Button>
                    <Button variant="ghost" onClick={() => setRejecting(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setRejecting(true)}>
                  Reject...
                </Button>
              )}
            </FormSection>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-section-title text-ink">History</h2>
        <Timeline
          timeZone={tz}
          entries={[...request.events].reverse().map((e, i) => ({
            id: `${i}`,
            timestamp: Math.floor(new Date(e.at).getTime() / 1000),
            eventName: eventLabel(e.action, e.actor.type),
            detail: [e.actor.type === "system" ? "Automatic" : e.actor.type === "owner" ? "Owner" : "Reviewer", e.note].filter(Boolean).join(" - "),
          }))}
          emptyMessage="No history yet."
        />
      </section>
    </div>
  );
}

/** Images inline; PDFs in an iframe (the document route serves them with nosniff and no-store). */
function DocumentViewer({url, document}: {url: string; document: ReviewDocumentInfo | null}) {
  if (!document) return <div className="p-4 text-body text-ink-muted">The document is no longer stored.</div>;
  if (document.contentType === "application/pdf") {
    return <iframe src={url} title="Owner's vaccination document" className="h-[40rem] w-full bg-surface" />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- an authenticated, uncached API response, not a static asset
  return <img src={url} alt="Owner's vaccination document" className="max-h-[40rem] w-full bg-surface object-contain" />;
}

export interface ReviewDocumentInfo {
  contentType: string;
  byteLength: number;
}
