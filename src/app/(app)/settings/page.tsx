import type {ReactNode} from "react";
import {PageHeader} from "@/components/shell/PageHeader";
import {Banner} from "@/components/ui/Banner";
import {KeyValuePanel} from "@/components/ui/KeyValuePanel";
import {StatusBadge} from "@/components/ui/StatusBadge";
import {AddressChip} from "@/components/ui/AddressChip";
import {auth} from "@/auth";
import {connectToDatabase} from "@/lib/db";
import {AvailabilityException, AvailabilityRule, getBookingSettings} from "@/lib/models/Availability";
import {getClinicSettings} from "@/lib/models/ClinicSettings";
import {listStaff} from "@/lib/models/Staff";
import {listBookablePractitioners} from "@/lib/booking/queries";
import {getServerEnv} from "@/lib/env";
import {resolveOperatorStatus} from "@/lib/issuanceOperatorStatus";
import {listRecentAbuse} from "@/lib/abuseLog";
import {AbuseLogSection} from "@/app/(app)/settings/AbuseLogSection";
import {BookingConfigSection} from "@/app/(app)/settings/BookingConfigSection";
import {ConsentRelayerSection} from "@/app/(app)/settings/ConsentRelayerSection";
import {IcsFeedSection} from "@/app/(app)/settings/IcsFeedSection";
import {MyProfileSection} from "@/app/(app)/settings/MyProfileSection";
import {MyWalletSection} from "@/app/(app)/settings/MyWalletSection";
import {OperatorsSection} from "@/app/(app)/settings/OperatorsSection";
import {SettingsForm} from "@/app/(app)/settings/SettingsForm";
import {StaffSection} from "@/app/(app)/settings/StaffSection";
import {isVetOrOwner} from "@/lib/staffRoleTone";
import {toPlain} from "@/lib/toPlain";
import {serverBrand} from "@/lib/brand.server";

export default async function SettingsPage() {
  const {org, Org, mode} = serverBrand();
  await connectToDatabase();
  const [settings, bookingSettings, rules, exceptions, abuseEntries, staff, practitioners, session] = await Promise.all([
    getClinicSettings(),
    getBookingSettings(),
    AvailabilityRule.find({}).lean().then(toPlain),
    AvailabilityException.find({}).sort({date: 1}).lean().then(toPlain),
    listRecentAbuse(),
    listStaff(),
    listBookablePractitioners(),
    auth(),
  ]);
  const env = getServerEnv();
  const smtpConfigured = Boolean(env.EMAIL_SERVER && env.EMAIL_FROM);
  const isOwner = session?.user?.role === "owner";
  // WP4.7C item 2 - "My issuance wallet" is a vet/owner SELF-service card, scoped to the signed-in
  // staff member's own row (`staff` here already came from `listStaff()` above, so no extra query
  // is needed to find it). `myStaff` can only be missing for a session whose Staff row was deleted
  // out from under it mid-session (this app only ever disables, never deletes - Staff.ts's own doc
  // comment - so this is a defensive absence check, not an expected path).
  const myStaff = staff.find((s) => s.staffId === session?.user?.staffId);
  // WP4.7C item 3 - resolved AFTER the Promise.all above since it needs both `myStaff` and
  // `settings.cloneAddress` from it; short-cached itself (`resolveOperatorStatus`'s own doc
  // comment), so this is not a second slow chain round trip on every navigation.
  const myOperatorStatus = isVetOrOwner(session?.user?.role)
    ? await resolveOperatorStatus({walletAddress: myStaff?.walletAddress, cloneAddress: settings.cloneAddress})
    : null;

  const clinicMode = mode !== "manual_verification";
  const sections = [
    {id: "profile", label: "Profile"},
    {id: "people", label: "People"},
    ...(clinicMode ? [{id: "booking", label: "Booking"}] : []),
    {id: "advanced", label: "Advanced"},
  ];

  return (
    <>
      <PageHeader title="Settings" description={`Deployment configuration for this ${org}.`} />
      {/* Section index: progressive disclosure for a long page (layout.md › Visual hierarchy). */}
      <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-badge border border-border-strong bg-surface px-3 py-1.5 text-body text-ink hover:bg-surface-2"
          >
            {section.label}
          </a>
        ))}
      </nav>
      {!settings.cloneAddress && (
        <div className="mb-6 max-w-3xl">
          <Banner tone="info" title="Chain identity is not set up" dismissKey="settings-no-clone">
            Run the setup wizard to connect a wallet and discover this {org}&apos;s clone.
          </Banner>
        </div>
      )}
      <div className="max-w-3xl space-y-10">
        <SettingsGroup id="profile" title="Profile">
          <SettingsForm initial={settings} isOwner={isOwner} operatorStatus={myOperatorStatus?.status} />
        </SettingsGroup>

        <SettingsGroup id="people" title="People">
          <StaffSection initial={staff} isOwner={isOwner} currentStaffId={session?.user?.staffId} />
          {/* WP4.13 item 3 - deliberately its OWN conditional, not folded into the MyWalletSection
              one below: profile editing (name/title/accreditation) has nothing to do with whether
              the chain could be read, and must not disappear just because myOperatorStatus came back
              null (an unreadable chain, or the clone not being set up yet). */}
          {isVetOrOwner(session?.user?.role) && myStaff && <MyProfileSection initial={myStaff} />}
          {isVetOrOwner(session?.user?.role) && myStaff && myOperatorStatus && (
            <div id="my-wallet" className="scroll-mt-6">
              <MyWalletSection initial={myStaff} status={myOperatorStatus.status} />
            </div>
          )}
          <OperatorsSection staff={staff} cloneAddress={settings.cloneAddress} isOwner={isOwner} />
        </SettingsGroup>

        {/* Booking hours and the appointments calendar feed only exist on clinic deployments. */}
        {clinicMode && (
          <SettingsGroup id="booking" title="Booking">
            <BookingConfigSection settings={bookingSettings} rules={rules} exceptions={exceptions} practitioners={practitioners} isOwner={isOwner} />
            <IcsFeedSection initialToken={settings.icsFeedToken} publicBaseUrl={env.PUBLIC_BASE_URL} />
          </SettingsGroup>
        )}

        {/* Rarely changed plumbing, collapsed until asked for. */}
        <section id="advanced" className="scroll-mt-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-section-title text-ink">
              <span aria-hidden className="inline-block transition-transform group-open:rotate-90">&#9656;</span>
              Advanced
              <span className="text-body font-normal text-ink-muted">chain identity, consent relayer, abuse log</span>
            </summary>
            <div className="mt-4 space-y-6">
              <KeyValuePanel
              title="Chain identity"
              rows={[
                {
                  key: "entity",
                  label: `${Org} account (entity)`,
                  value: settings.entityAccount ? <AddressChip address={settings.entityAccount} chain="roax" /> : "Not set up yet",
                },
                {
                  key: "clone",
                  label: `${Org} contract (clone)`,
                  value: settings.cloneAddress ? <AddressChip address={settings.cloneAddress} chain="roax" /> : "Not set up yet",
                },
                {
                  key: "smtp",
                  label: "Email sending (SMTP)",
                  value: smtpConfigured ? <StatusBadge tone="ok" label="Configured" /> : <StatusBadge tone="neutral" label="Not configured" />,
                },
              ]}
            />
              <ConsentRelayerSection initial={Boolean(settings.consentRelayerViaCloneEnabled)} isOwner={isOwner} />
              <AbuseLogSection entries={abuseEntries} timeZone={bookingSettings.timezone} />
            </div>
          </details>
        </section>
      </div>
    </>
  );
}

function SettingsGroup({id, title, children}: {id: string; title: string; children: ReactNode}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-6">
      <h2 id={`${id}-title`} className="border-b border-border pb-2 text-section-title text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
