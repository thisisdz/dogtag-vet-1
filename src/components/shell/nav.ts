export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export type AppMode = "clinic" | "manual_verification";

/**
 * The menu for DogTag's own manual-verification deployment (DOGTAG_APP_MODE=manual_verification):
 * only what reviewing requests and issuing credentials needs - no calendar, booking or billing.
 * The DogTag group keeps its label so the sidebar's vet/owner-only gating still applies to it.
 */
export const manualVerificationNavGroups: NavGroup[] = [
  {
    label: "DogTag",
    items: [
      {href: "/manual-verification", label: "Manual verification"},
      {href: "/tags", label: "Tags"},
      {href: "/tags/issue", label: "Issue tag"},
      {href: "/verify/records", label: "Verify vaccination record"},
      {href: "/verifications", label: "Verification history"},
      {href: "/activity", label: "On-chain activity"},
    ],
  },
  {
    label: "Records",
    items: [
      {href: "/clients", label: "Clients"},
      {href: "/pets", label: "Pets"},
    ],
  },
  {
    label: "Administration",
    items: [
      {href: "/setup", label: "Setup wizard"},
      {href: "/settings", label: "Settings"},
    ],
  },
];

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{href: "/dashboard", label: "Dashboard"}],
  },
  {
    label: "Clinic",
    items: [
      {href: "/calendar", label: "Calendar"},
      {href: "/appointments", label: "Appointments"},
      {href: "/clients", label: "Clients"},
      {href: "/pets", label: "Pets"},
      {href: "/services", label: "Services"},
    ],
  },
  {
    label: "DogTag",
    items: [
      {href: "/manual-verification", label: "Manual verification"},
      {href: "/tags", label: "Tags"},
      {href: "/tags/issue", label: "Issue tag"},
      {href: "/verify", label: "Verify"},
      {href: "/verify/redacted", label: "Verify redacted artifact"},
      {href: "/verify/records", label: "Verify vaccination record"},
      {href: "/verifications", label: "Verification history"},
      {href: "/activity", label: "On-chain activity"},
    ],
  },
  {
    label: "Billing",
    items: [
      {href: "/payments", label: "Payments"},
      {href: "/accounting", label: "Accounting"},
    ],
  },
  {
    label: "Administration",
    items: [
      {href: "/setup", label: "Setup wizard"},
      {href: "/settings", label: "Settings"},
    ],
  },
];
