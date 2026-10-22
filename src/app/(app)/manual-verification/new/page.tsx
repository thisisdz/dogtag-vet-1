import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {PageHeader} from "@/components/shell/PageHeader";
import {connectToDatabase} from "@/lib/db";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {Client, type ClientDoc} from "@/lib/models/Client";
import {isVetOrOwner} from "@/lib/staffRoleTone";
import {NewRequestForm, type TaggedPetOption} from "@/app/(app)/manual-verification/new/NewRequestForm";

/** File a vaccination verification on an owner's behalf (e.g. a certificate emailed to DogTag).
 * Only pets that already have a DogTag can be picked - the manual track requires one. */
export default async function NewManualVerificationRequestPage() {
  const session = await auth();
  if (!isVetOrOwner(session?.user?.role)) redirect("/dashboard?notice=vet-required");

  await connectToDatabase();
  const pets = await Pet.find(
    {"dogTag.dogTagIdField": {$exists: true, $ne: null}},
    {petId: 1, name: 1, species: 1, "dogTag.dogTagIdDec": 1, ownerClientIds: 1, primaryOwnerClientId: 1},
  )
    .sort({name: 1})
    .limit(1000)
    .lean<PetDoc[]>();
  const clientIds = [...new Set(pets.flatMap((p) => (p.primaryOwnerClientId ? [p.primaryOwnerClientId] : p.ownerClientIds.slice(0, 1))))];
  const clients = await Client.find({clientId: {$in: clientIds}}, {clientId: 1, name: 1, email: 1}).lean<ClientDoc[]>();
  const clientById = new Map(clients.map((c) => [c.clientId, c]));

  const options: TaggedPetOption[] = pets.map((p) => {
    const owner = clientById.get(p.primaryOwnerClientId ?? p.ownerClientIds[0] ?? "");
    return {
      petId: p.petId,
      label: `${p.name}${p.species ? ` (${p.species})` : ""} - DogTag ${p.dogTag?.dogTagIdDec ?? ""}`,
      ownerName: owner?.name ?? "",
      ownerEmail: owner?.email ?? "",
    };
  });

  return (
    <>
      <PageHeader
        title="New vaccination verification"
        description="File a request for an owner who sent DogTag their vaccination certificate directly."
      />
      <NewRequestForm pets={options} />
    </>
  );
}
