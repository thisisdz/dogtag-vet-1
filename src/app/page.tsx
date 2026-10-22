import Link from "next/link";
import {BrandLockup} from "@/components/brand/BrandLockup";
import {serverBrand} from "@/lib/brand.server";

export default function LandingPage() {
  const brand = serverBrand();
  const manualVerification = brand.mode === "manual_verification";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass flex items-center justify-between border-x-0 border-t-0 px-6 py-3">
        <BrandLockup height={28} />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {manualVerification ? (
          <>
            <h1 className="text-hero text-ink">{brand.product}</h1>
            <p className="max-w-xl text-body text-ink-muted">
              DogTag&apos;s own verification desk: owners send vaccination records and DogTag requests from the DogTag app, and
              DogTag reviews and issues them.
            </p>
            <Link href="/sign-in" className="glass-action rounded-control px-5 py-2.5 text-body font-medium">
              Reviewer sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-hero text-ink">Your clinic&apos;s DogTag home</h1>
            <p className="max-w-xl text-body text-ink-muted">
              Clients, pets, appointments, DogTag issuance, verification, and payments - deployed and operated by your own clinic.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/book" className="glass-action rounded-control px-5 py-2.5 text-body font-medium">
                Book an appointment
              </Link>
              <Link href="/sign-in" className="glass rounded-control px-5 py-2.5 text-body font-medium text-ink hover:bg-surface">
                Staff sign in
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
