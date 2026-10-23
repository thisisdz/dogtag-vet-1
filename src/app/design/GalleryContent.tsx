"use client";

import {useState} from "react";
import {StatusBadge, type StatusTone} from "@/components/ui/StatusBadge";
import {AddressChip} from "@/components/ui/AddressChip";
import {HashCell} from "@/components/ui/HashCell";
import {DataTable, type DataTableColumn} from "@/components/ui/DataTable";
import {KeyValuePanel} from "@/components/ui/KeyValuePanel";
import {Timeline} from "@/components/ui/Timeline";
import {Banner} from "@/components/ui/Banner";
import {useSnackbar} from "@/components/ui/Snackbar";
import {FormField, FormSection} from "@/components/ui/FormSection";
import {Button, Input, Select} from "@/components/ui/controls";
import {QrSurface} from "@/components/ui/QrSurface";
import {BrandLockup, BrandMark} from "@/components/brand/BrandLockup";
import {Seal} from "@/components/brand/Seal";
import {Stepper} from "@/components/ui/Stepper";

const tones: StatusTone[] = ["ok", "warn", "danger", "info", "neutral"];

/** The brand kit palette (docs/BRAND.md); hex labels are documentation only - the swatch colors
 * come from the tokens. */
const swatches = [
  {name: "Tag Red", hex: "#CE372D", className: "bg-brand"},
  {name: "Coral", hex: "#E4584C", className: "bg-coral"},
  {name: "Ember", hex: "#A4241C", className: "bg-danger"},
  {name: "Blush Frost", hex: "#F8E9E6", className: "bg-brand-soft"},
  {name: "Porcelain", hex: "#F2EEEC", className: "bg-bg"},
  {name: "Ink", hex: "#1E1A19", className: "bg-ink"},
];

interface DemoRow {
  id: string;
  dogTagId: string;
  root: string;
  status: StatusTone;
  amount: string;
}

const demoRows: DemoRow[] = [
  {id: "1", dogTagId: "10042", root: "0x8f3c1e2a9b7d4e5f6a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7", status: "ok", amount: "1,204.00"},
  {id: "2", dogTagId: "10043", root: "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809", status: "warn", amount: "58.50"},
  {id: "3", dogTagId: "10044", root: "0x9988776655443322110099887766554433221100998877665544332211aabb", status: "danger", amount: "0.00"},
];

const demoColumns: DataTableColumn<DemoRow>[] = [
  {key: "dogTagId", header: "DogTag ID", render: (r) => r.dogTagId},
  {key: "root", header: "Root", mono: true, render: (r) => <HashCell value={r.root} kind="root" />},
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusBadge tone={r.status} label={r.status === "ok" ? "Active" : r.status === "warn" ? "Pending" : "Revoked"} />,
  },
  {key: "amount", header: "Amount", align: "right", mono: true, render: (r) => r.amount},
];

export function GalleryContent() {
  const snackbar = useSnackbar();
  const [selectValue, setSelectValue] = useState("owner");

  return (
    <div className="space-y-8 text-ink">
      <section>
        <h2 className="mb-3 text-section-title">Brand</h2>
        <div className="card space-y-6 rounded-card p-6">
          <div className="flex flex-wrap items-center gap-6">
            <BrandLockup height={40} />
            <BrandMark size={56} />
            {/* The signature element - only where a credential becomes real. */}
            <Seal size={96} issuerName="Acme Vet" />
          </div>
          <Stepper
            steps={[
              {key: "a", label: "Submitted"},
              {key: "b", label: "In review"},
              {key: "c", label: "Approved"},
              {key: "d", label: "Issued"},
            ]}
            reachedKey="b"
          />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {swatches.map((s) => (
              <div key={s.name} className="text-caption">
                <div className={`mb-1.5 h-12 rounded-control border border-border ${s.className}`} />
                <p className="font-medium text-ink">{s.name}</p>
                <p className="font-mono text-ink-muted">{s.hex}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-card p-4">
              <p className="text-caption font-medium uppercase tracking-wide text-ink-faint">01 Frost plate</p>
              <p className="mt-1 text-body">Functional layer only: sidebar, top bar, dialogs. Content sits on solid cards.</p>
            </div>
            <div className="glass-action rounded-card p-4">
              <p className="text-caption font-medium uppercase tracking-wide">02 Tag Red D</p>
              <p className="mt-1 text-body">Action: buttons, toggles, active tabs.</p>
            </div>
            <div className="glass-action rounded-card p-4">
              <span className="glass-chip inline-block rounded-badge px-2.5 py-0.5 text-caption font-medium">03 Bone glyph</span>
              <p className="mt-1 text-body">Detail: white glass on red.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <StatusBadge key={t} tone={t} label={t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Address chip / hash cell</h2>
        <div className="flex flex-col gap-2">
          <AddressChip address="0x1234567890abcdef1234567890ABCDEF12345678" chain="roax" label="operator" />
          <HashCell value="0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd" kind="root" label="root" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Data table</h2>
        <DataTable columns={demoColumns} rows={demoRows} getRowKey={(r) => r.id} />
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Key-value panel</h2>
        <KeyValuePanel
          title="Tag detail"
          rows={[
            {key: "id", label: "DogTag ID", value: "10042"},
            {key: "status", label: "Status", value: <StatusBadge tone="ok" label="Active" />},
            {key: "owner", label: "Operator", value: <AddressChip address="0x1234567890abcdef1234567890ABCDEF12345678" /> },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Timeline</h2>
        <Timeline
          timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          entries={[
            {
              id: "1",
              timestamp: Math.floor(Date.now() / 1000) - 3600,
              actor: "0x1234567890abcdef1234567890ABCDEF12345678",
              eventName: "TagIssued",
              txHash: "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
            },
            {
              id: "2",
              timestamp: Math.floor(Date.now() / 1000) - 1800,
              eventName: "GasRefunded",
              detail: "0.002 PLASMA refunded to operator",
            },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="mb-1 text-section-title">Banners</h2>
        <Banner tone="info" title="Setup incomplete" dismissKey="gallery-info">
          Connect a wallet to discover this clinic&apos;s clone.
        </Banner>
        <Banner tone="warn" title="Clone balance low" dismissKey="gallery-warn">
          Refunds may be skipped until the clone is topped up.
        </Banner>
        <Banner tone="danger" title="Entity revoked" dismissKey="gallery-danger">
          This entity was revoked in the registry. Contact the DogTag admin.
        </Banner>
        <Banner tone="ok" title="Wallet whitelisted" dismissKey="gallery-ok">
          This wallet can issue and revoke tags on the clone.
        </Banner>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Snackbar</h2>
        <Button variant="secondary" onClick={() => snackbar.show("Tag revoked", "ok")}>
          Trigger snackbar
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">Form section</h2>
        <FormSection title="Owner identity" helperText="Collected once at KYC time.">
          <FormField label="Full name" htmlFor="gallery-name">
            <Input id="gallery-name" placeholder="Jane Doe" />
          </FormField>
          <FormField label="Country" htmlFor="gallery-country" error="Required">
            <Select id="gallery-country" value={selectValue} onChange={(e) => setSelectValue(e.target.value)}>
              <option value="owner">US</option>
              <option value="staff">CA</option>
            </Select>
          </FormField>
        </FormSection>
      </section>

      <section>
        <h2 className="mb-3 text-section-title">QR surface</h2>
        <QrSurface data="https://vet.example.com/p/0123456789abcdef0123456789abcdef" caption="Scan to resolve mint session" expiresAt={Math.floor(Date.now() / 1000) + 600} />
      </section>
    </div>
  );
}
