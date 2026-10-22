import type {Brand} from "@/lib/brand";
import {ISSUER_DOMAIN_PATTERN, normalizeIssuerDomain} from "@/lib/schemas/settings";
import type {OperatorStatus} from "@/lib/staffRoleTone";

/**
 * Whether the signed-in staff member can sign C3 issuer attestations right now, as a checklist.
 * Mirrors what the attestation routes need (`api/tags/issue/[sessionId]/attestation`,
 * `api/records/[id]/attestation`): an issuer domain (refused without one) and the issuer name
 * (signed into every attestation; blank would sign ""), plus the chain identity (the clone that is
 * the EIP-712 verifying contract) and an operator wallet whitelisted on it. Pure, so the settings
 * form can re-run it on every keystroke.
 */
export type ReadinessKey = "name" | "domain" | "clone" | "wallet";

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  done: boolean;
  /** What to do next; only shown while not done. */
  hint: string;
  href?: string;
}

export interface IssuerReadiness {
  ready: boolean;
  items: ReadinessItem[];
}

export interface IssuerReadinessInput {
  name?: string;
  domain?: string;
  cloneAddress?: string;
  /** The signed-in staff member's operator status (`resolveOperatorStatus`); undefined when the
   * chain was not consulted (e.g. a reception account), which counts as not ready. */
  operatorStatus?: OperatorStatus;
}

export function isValidIssuerDomain(domain: string | undefined): boolean {
  return Boolean(domain) && ISSUER_DOMAIN_PATTERN.test(normalizeIssuerDomain(domain ?? ""));
}

const WALLET_HINTS: Record<OperatorStatus, string> = {
  whitelisted: "",
  "not-whitelisted": "Your recorded wallet is not whitelisted on the clone yet - apply in the DogTag admin portal.",
  "no-address": "Record the wallet you sign with under My issuance wallet.",
  "not-configured": "Finish chain identity setup first.",
  unreadable: "The chain could not be reached to check your wallet - try again shortly.",
};

export function issuerReadiness(input: IssuerReadinessInput, brand: Pick<Brand, "org" | "Org">): IssuerReadiness {
  const domain = input.domain?.trim() ?? "";
  const items: ReadinessItem[] = [
    {
      key: "name",
      label: `${brand.Org} name`,
      done: Boolean(input.name?.trim()),
      hint: `Enter the ${brand.org} name signed into every credential.`,
    },
    {
      key: "domain",
      label: "Issuer domain",
      done: isValidIssuerDomain(domain),
      hint: domain ? "Enter a bare domain, e.g. dogtagapp.com." : "Enter the domain credentials are signed under, e.g. dogtagapp.com.",
    },
    {
      key: "clone",
      label: "Chain identity",
      done: Boolean(input.cloneAddress),
      hint: "Run the setup wizard to connect this deployment to its issuer clone.",
      href: "/setup",
    },
    {
      key: "wallet",
      label: "Your issuance wallet",
      done: input.operatorStatus === "whitelisted",
      hint: input.operatorStatus ? WALLET_HINTS[input.operatorStatus] : "Only a vet or owner with a whitelisted wallet can sign attestations.",
      href: "/settings#my-wallet",
    },
  ];
  return {ready: items.every((item) => item.done), items};
}

export const ISSUER_READY_MESSAGE = "You are now ready to perform issuer attestations on your credentials.";
