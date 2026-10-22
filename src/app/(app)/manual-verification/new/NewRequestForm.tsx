"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";
import {Banner} from "@/components/ui/Banner";
import {Button, Input, Select, Textarea} from "@/components/ui/controls";
import {FormField, FormSection} from "@/components/ui/FormSection";
import {useSnackbar} from "@/components/ui/Snackbar";

export interface TaggedPetOption {
  petId: string;
  label: string;
  ownerName: string;
  ownerEmail: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,application/pdf";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function NewRequestForm({pets}: {pets: TaggedPetOption[]}) {
  const router = useRouter();
  const snackbar = useSnackbar();
  const [petId, setPetId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function pickPet(id: string) {
    setPetId(id);
    const pet = pets.find((p) => p.petId === id);
    if (pet) {
      setName((v) => v || pet.ownerName);
      setEmail((v) => v || pet.ownerEmail);
    }
  }

  const fileProblem = file && file.size > MAX_BYTES ? "The file is larger than 5 MB." : null;

  async function submit() {
    if (!file) return;
    setSaving(true);
    try {
      const res = await fetch("/api/manual-verification", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          kind: "vaccination",
          petId,
          name: name.trim(),
          email: email.trim(),
          ownerNotes: ownerNotes.trim() || undefined,
          document: {contentType: file.type, base64: await readAsBase64(file)},
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        snackbar.show(body?.error?.message ?? "Could not file the request", "danger");
        return;
      }
      snackbar.show("Request filed", "ok");
      router.push(`/manual-verification/${body.request.requestId}`);
    } finally {
      setSaving(false);
    }
  }

  if (pets.length === 0) {
    return (
      <Banner tone="info" title="No pets with a DogTag yet">
        Vaccination verification needs a pet that already has a DogTag.
      </Banner>
    );
  }

  return (
    <div className="max-w-2xl">
      <FormSection title="Request" helperText="The owner will receive the verified record in the DogTag app.">
        <FormField label="Pet" htmlFor="pet">
          <Select id="pet" value={petId} onChange={(e) => pickPet(e.target.value)}>
            <option value="">Choose a pet with a DogTag...</option>
            {pets.map((p) => (
              <option key={p.petId} value={p.petId}>
                {p.label}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Owner name" htmlFor="ownerName">
            <Input id="ownerName" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Owner email" htmlFor="ownerEmail" helperText="Where the claim link is sent">
            <Input id="ownerEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Vaccination certificate" htmlFor="document" helperText="JPEG, PNG or PDF, up to 5 MB" error={fileProblem ?? undefined}>
          <Input id="document" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FormField>
        <FormField label="Note" htmlFor="ownerNotes" helperText="Optional - anything the owner said about it">
          <Textarea id="ownerNotes" rows={3} value={ownerNotes} onChange={(e) => setOwnerNotes(e.target.value)} />
        </FormField>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving || !petId || !name.trim() || !email.trim() || !file || Boolean(fileProblem)}>
            {saving ? "Filing..." : "File request"}
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
