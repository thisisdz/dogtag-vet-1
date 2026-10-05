"use client";

import {useState} from "react";
import {FormField, FormSection} from "@/components/ui/FormSection";
import {Button, Input} from "@/components/ui/controls";
import {useSnackbar} from "@/components/ui/Snackbar";
import type {ClinicSettingsDoc, ReceivingAddress} from "@/lib/models/ClinicSettings";
import {paymentChainByKey, paymentChainDisplayName, type PaymentChainKey} from "@/lib/chains";
import {ALL_CHAIN_KEYS} from "@/lib/payments/tokenTable";
import {normalizeIssuerDomain} from "@/lib/schemas/settings";

/** Form-side error keys: the API's dotted payload path, except receiving addresses, which the API
 * reports by array index ("receivingAddresses.0.address") and this form keys by chain
 * ("receiving.roax") since blank chains are filtered out of the submitted array. */
type FieldErrors = Record<string, string | undefined>;

const FIELD_LABELS: Record<string, string> = {
  "businessProfile.name": "Clinic name",
  "businessProfile.logoUrl": "Logo URL",
  "businessProfile.contactEmail": "Booking notification email",
  "businessProfile.domain": "Issuer domain",
  "businessProfile.phone": "Public phone",
  "businessProfile.primaryColor": "Brand color",
  "businessProfile.address.line1": "Address line 1",
  "businessProfile.address.line2": "Address line 2",
  "businessProfile.address.city": "City",
  "businessProfile.address.region": "Region or state",
  "businessProfile.address.postalCode": "Postal code",
  "businessProfile.address.country": "Country",
  "businessProfile.coordinates.lat": "Latitude",
  "businessProfile.coordinates.lng": "Longitude",
  "rpcOverrides.roax": "ROAX RPC override",
};

/** The API's 400 shape: error.details.fieldErrors keyed by dotted payload path (see
 * `app/api/settings/route.ts`). */
function parseFieldErrors(body: unknown, submittedReceiving: ReceivingAddress[]): {message?: string; fields: FieldErrors} {
  const error = (body as {error?: {message?: string; details?: {fieldErrors?: Record<string, string[]>}}} | null)?.error;
  const fields: FieldErrors = {};
  for (const [path, messages] of Object.entries(error?.details?.fieldErrors ?? {})) {
    if (!messages?.[0]) continue;
    const receivingMatch = /^receivingAddresses\.(\d+)/.exec(path);
    const chainKey = receivingMatch ? submittedReceiving[Number(receivingMatch[1])]?.chainKey : undefined;
    fields[chainKey ? `receiving.${chainKey}` : path] = messages[0];
  }
  return {message: error?.message, fields};
}

function fieldLabel(key: string): string {
  if (key.startsWith("receiving.")) return `${paymentChainLabel(key.slice("receiving.".length) as PaymentChainKey)} receiving address`;
  return FIELD_LABELS[key] ?? key;
}

/** "ROAX" alone, or "ROAX (testnet)" if `chains.ts`'s registry ever marks it otherwise - derived
 * from the registry (`paymentChainByKey[key].testnet`) rather than a second hardcoded label, so
 * this can never drift from `PaymentForm.tsx`'s own testnet badge. */
function paymentChainLabel(chainKey: PaymentChainKey): string {
  const name = paymentChainDisplayName[chainKey];
  return paymentChainByKey[chainKey].testnet ? `${name} (testnet)` : name;
}

export function SettingsForm({initial}: {initial: ClinicSettingsDoc}) {
  const snackbar = useSnackbar();
  const [businessName, setBusinessName] = useState(initial.businessProfile?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.businessProfile?.logoUrl ?? "");
  const [contactEmail, setContactEmail] = useState(initial.businessProfile?.contactEmail ?? "");
  const [domain, setDomain] = useState(initial.businessProfile?.domain ?? "");
  const [phone, setPhone] = useState(initial.businessProfile?.phone ?? "");
  const [primaryColor, setPrimaryColor] = useState(initial.businessProfile?.primaryColor ?? "");
  const [address, setAddress] = useState({
    line1: initial.businessProfile?.address?.line1 ?? "",
    line2: initial.businessProfile?.address?.line2 ?? "",
    city: initial.businessProfile?.address?.city ?? "",
    region: initial.businessProfile?.address?.region ?? "",
    postalCode: initial.businessProfile?.address?.postalCode ?? "",
    country: initial.businessProfile?.address?.country ?? "",
  });
  const [lat, setLat] = useState(initial.businessProfile?.coordinates?.lat?.toString() ?? "");
  const [lng, setLng] = useState(initial.businessProfile?.coordinates?.lng?.toString() ?? "");
  const [receiving, setReceiving] = useState<Record<PaymentChainKey, string>>(() => {
    const map: Record<PaymentChainKey, string> = {roax: ""};
    for (const entry of initial.receivingAddresses ?? []) map[entry.chainKey] = entry.address;
    return map;
  });
  const [rpc, setRpc] = useState<Record<PaymentChainKey, string>>({
    roax: initial.rpcOverrides?.roax ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /** Editing a field retires its stale error; the next save revalidates. */
  function clearError(key: string) {
    setFieldErrors((prev) => (prev[key] ? {...prev, [key]: undefined} : prev));
  }

  function setAddressField(key: keyof typeof address, value: string) {
    setAddress((p) => ({...p, [key]: value}));
    clearError(`businessProfile.address.${key}`);
  }

  async function handleSave() {
    setSaving(true);
    setFieldErrors({});
    // Accept a pasted URL ("https://acmevet.com/") and show the bare domain that is actually saved.
    const normalizedDomain = normalizeIssuerDomain(domain);
    setDomain(normalizedDomain);
    const receivingAddresses: ReceivingAddress[] = ALL_CHAIN_KEYS.filter((key) => receiving[key]).map((key) => ({
      chainKey: key,
      address: receiving[key],
    }));
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          businessProfile: {
            name: businessName || undefined,
            logoUrl: logoUrl || undefined,
            contactEmail: contactEmail || undefined,
            domain: normalizedDomain || undefined,
            phone: phone || undefined,
            primaryColor: primaryColor || undefined,
            address: Object.values(address).some(Boolean)
              ? {
                  line1: address.line1 || undefined,
                  line2: address.line2 || undefined,
                  city: address.city || undefined,
                  region: address.region || undefined,
                  postalCode: address.postalCode || undefined,
                  country: address.country || undefined,
                }
              : undefined,
            coordinates: lat && lng ? {lat: Number(lat), lng: Number(lng)} : undefined,
          },
          receivingAddresses,
          rpcOverrides: {
            roax: rpc.roax || undefined,
          },
        }),
      });
      if (!res.ok) {
        // Name the rejected field instead of a generic retry toast - an issuer domain pasted as a
        // URL used to produce only "Could not save settings - try again".
        const {message, fields} = parseFieldErrors(await res.json().catch(() => null), receivingAddresses);
        setFieldErrors(fields);
        const firstField = Object.entries(fields).find((entry): entry is [string, string] => Boolean(entry[1]));
        snackbar.show(
          firstField ? `${fieldLabel(firstField[0])}: ${firstField[1]}` : (message ?? "Could not save settings - try again"),
          "danger",
        );
        return;
      }
      snackbar.show("Settings saved", "ok");
    } catch {
      snackbar.show("Could not save settings - try again", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <FormSection title="Business profile" helperText="Shown on invoices and the clinic's public entity card.">
        <FormField label="Clinic name" htmlFor="business-name" error={fieldErrors["businessProfile.name"]}>
          <Input
            id="business-name"
            value={businessName}
            onChange={(e) => {
              setBusinessName(e.target.value);
              clearError("businessProfile.name");
            }}
          />
        </FormField>
        <FormField
          label="Logo URL"
          htmlFor="logo-url"
          helperText="From the admin directory, or your own hosting."
          error={fieldErrors["businessProfile.logoUrl"]}
        >
          <Input
            id="logo-url"
            value={logoUrl}
            onChange={(e) => {
              setLogoUrl(e.target.value);
              clearError("businessProfile.logoUrl");
            }}
            placeholder="https://"
          />
        </FormField>
        <FormField
          label="Booking notification email"
          htmlFor="contact-email"
          helperText="Where a public booking or cancellation notice is sent. Leave blank to skip clinic notifications."
          error={fieldErrors["businessProfile.contactEmail"]}
        >
          <Input
            id="contact-email"
            type="email"
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              clearError("businessProfile.contactEmail");
            }}
          />
        </FormField>
        <FormField
          label="Issuer domain"
          htmlFor="business-domain"
          helperText="This clinic's stable DNS-domain identity, e.g. acmevet.com - signed into every issued DogTag's C3 attestation. Not a URL and not required to resolve to anything; distinct from the notification email above. A pasted https:// prefix or trailing slash is removed on save."
          error={fieldErrors["businessProfile.domain"]}
        >
          <Input
            id="business-domain"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              clearError("businessProfile.domain");
            }}
            placeholder="acmevet.com"
          />
        </FormField>
        <FormField
          label="Public phone"
          htmlFor="business-phone"
          helperText="Shown on the public entity card."
          error={fieldErrors["businessProfile.phone"]}
        >
          <Input
            id="business-phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearError("businessProfile.phone");
            }}
          />
        </FormField>
        <FormField
          label="Brand color"
          htmlFor="primary-color"
          helperText="Accent color for the public entity card, e.g. #2563eb."
          error={fieldErrors["businessProfile.primaryColor"]}
        >
          <Input
            id="primary-color"
            value={primaryColor}
            onChange={(e) => {
              setPrimaryColor(e.target.value);
              clearError("businessProfile.primaryColor");
            }}
            placeholder="#2563eb"
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Address and location"
        helperText="Shown on the public entity card. Coordinates default to 0,0 until set - enter real ones before going live."
      >
        <FormField label="Address line 1" htmlFor="address-line1" error={fieldErrors["businessProfile.address.line1"]}>
          <Input id="address-line1" value={address.line1} onChange={(e) => setAddressField("line1", e.target.value)} />
        </FormField>
        <FormField label="Address line 2" htmlFor="address-line2" error={fieldErrors["businessProfile.address.line2"]}>
          <Input id="address-line2" value={address.line2} onChange={(e) => setAddressField("line2", e.target.value)} />
        </FormField>
        <FormField label="City" htmlFor="address-city" error={fieldErrors["businessProfile.address.city"]}>
          <Input id="address-city" value={address.city} onChange={(e) => setAddressField("city", e.target.value)} />
        </FormField>
        <FormField label="Region or state" htmlFor="address-region" error={fieldErrors["businessProfile.address.region"]}>
          <Input id="address-region" value={address.region} onChange={(e) => setAddressField("region", e.target.value)} />
        </FormField>
        <FormField label="Postal code" htmlFor="address-postal" error={fieldErrors["businessProfile.address.postalCode"]}>
          <Input
            id="address-postal"
            value={address.postalCode}
            onChange={(e) => setAddressField("postalCode", e.target.value)}
          />
        </FormField>
        <FormField
          label="Country"
          htmlFor="address-country"
          helperText="ISO 3166-1 alpha-2, e.g. US."
          error={fieldErrors["businessProfile.address.country"]}
        >
          <Input
            id="address-country"
            value={address.country}
            maxLength={2}
            onChange={(e) => setAddressField("country", e.target.value.toUpperCase())}
          />
        </FormField>
        <FormField label="Latitude" htmlFor="address-lat" error={fieldErrors["businessProfile.coordinates.lat"]}>
          <Input
            id="address-lat"
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              clearError("businessProfile.coordinates.lat");
            }}
            placeholder="0"
          />
        </FormField>
        <FormField label="Longitude" htmlFor="address-lng" error={fieldErrors["businessProfile.coordinates.lng"]}>
          <Input
            id="address-lng"
            value={lng}
            onChange={(e) => {
              setLng(e.target.value);
              clearError("businessProfile.coordinates.lng");
            }}
            placeholder="0"
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Receiving addresses"
        helperText="One address per chain for accepting crypto payments. Leave blank to not accept that chain."
      >
        {ALL_CHAIN_KEYS.map((key) => (
          <FormField key={key} label={paymentChainLabel(key)} htmlFor={`receiving-${key}`} error={fieldErrors[`receiving.${key}`]}>
            <Input
              id={`receiving-${key}`}
              placeholder="0x..."
              value={receiving[key]}
              onChange={(e) => {
                setReceiving((prev) => ({...prev, [key]: e.target.value.trim()}));
                clearError(`receiving.${key}`);
              }}
            />
          </FormField>
        ))}
      </FormSection>

      <FormSection title="Chain RPC overrides" helperText="Leave blank to use the built-in public default.">
        {ALL_CHAIN_KEYS.map((key) => (
          <FormField key={key} label={paymentChainLabel(key)} htmlFor={`rpc-${key}`} error={fieldErrors[`rpcOverrides.${key}`]}>
            <Input
              id={`rpc-${key}`}
              value={rpc[key]}
              onChange={(e) => {
                setRpc((p) => ({...p, [key]: e.target.value}));
                clearError(`rpcOverrides.${key}`);
              }}
            />
          </FormField>
        ))}
      </FormSection>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
