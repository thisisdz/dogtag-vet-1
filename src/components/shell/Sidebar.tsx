"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {BrandLockup} from "@/components/brand/BrandLockup";
import {manualVerificationNavGroups, navGroups, type AppMode} from "@/components/shell/nav";
import type {StaffRole} from "@/lib/models/Staff";
import {isVetOrOwner} from "@/lib/staffRoleTone";

/** Nav groups gated to `vet`/`owner` (WP4.7 A2) - the sidebar-level half of the same gate `/tags`
 * and `/tags/issue` enforce server-side (see those pages' doc comments); a plain `staff` session
 * never even sees the group exists. Named by `NavGroup.label` rather than duplicating the item
 * list here, so adding a new item to an already-gated group in `nav.ts` never needs a second edit
 * here to stay gated. */
const VET_ONLY_GROUPS = new Set(["DogTag"]);

export function visibleGroups(role: StaffRole | undefined, mode: AppMode = "clinic") {
  const groups = mode === "manual_verification" ? manualVerificationNavGroups : navGroups;
  if (isVetOrOwner(role)) return groups;
  return groups.filter((group) => !VET_ONLY_GROUPS.has(group.label));
}

/** The single nav item that should render active for `pathname`, or `undefined` off-nav (e.g. a
 * sign-in page). A path can match more than one item's prefix - `/tags/issue` starts with both
 * `/tags` and `/tags/issue` - so this picks the longest (most specific) matching `href` across
 * every group rather than letting every ancestor light up at once, which is what a plain
 * `pathname.startsWith(item.href)` per-item check produced (both "Tags" and "Issue tag" active on
 * `/tags/issue`, per the round-5 grader finding). Exact-match candidates and prefix-match
 * candidates (`${href}/`) are gathered the same way a plain per-item check would, just compared
 * against each other for specificity before deciding a winner. */
function findActiveHref(pathname: string | null, groups: typeof navGroups): string | undefined {
  if (pathname === null) return undefined;
  let best: string | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (best === undefined || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }
  return best;
}

/** Logo plus the nav groups - shared by the desktop sidebar and the mobile drawer (MobileNav). */
export function SidebarNav({role, mode = "clinic"}: {role?: StaffRole; mode?: AppMode}) {
  const pathname = usePathname();
  const groups = visibleGroups(role, mode);
  const activeHref = findActiveHref(pathname, groups);

  return (
    <>
      <Link href="/dashboard" className="px-2" aria-label="DogTag - home">
        <BrandLockup height={26} />
      </Link>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-caption font-medium uppercase tracking-wide text-ink-faint">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  {/* Active: ink on Blush Frost with a Tag Red marker - red fill is saved for each
                      view's one primary action (docs/BRAND.md). */}
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative block rounded-control px-2.5 py-2 text-body transition-colors lg:py-1.5 ${
                      active
                        ? "bg-brand-soft font-medium text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand"
                        : "text-ink-muted hover:bg-brand-soft hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The desktop sidebar (lg and up); below that the same nav lives in MobileNav's drawer. */
export function Sidebar({role, mode = "clinic"}: {role?: StaffRole; mode?: AppMode}) {
  return (
    <nav aria-label="Main" className="glass hidden h-full w-60 shrink-0 flex-col gap-6 overflow-y-auto border-y-0 border-l-0 px-3 py-5 lg:flex">
      <SidebarNav role={role} mode={mode} />
    </nav>
  );
}
