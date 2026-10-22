import {describe, expect, it} from "vitest";
import {visibleGroups} from "@/components/shell/Sidebar";
import {navGroups} from "@/components/shell/nav";

/**
 * WP4.7 A2: the sidebar hides the whole "DogTag" nav group (Tags, Issue tag, Verify,
 * Verification history, On-chain activity) for a plain `staff` session - the UI half of the same
 * `isVetOrOwner` gate `requireVetSession` and the `/tags`/`/tags/issue` page redirects enforce
 * (`tests/unit/models/staffRoleGuard.test.ts`). Every OTHER group must stay untouched regardless
 * of role - this is a visibility filter, not a re-authorization of the whole nav.
 */
describe("Sidebar.visibleGroups", () => {
  const dogTagGroup = navGroups.find((g) => g.label === "DogTag");

  it("the DogTag group actually exists in nav.ts (sanity check the fixture this suite depends on)", () => {
    expect(dogTagGroup).toBeDefined();
    expect(dogTagGroup!.items.length).toBeGreaterThan(0);
  });

  it.each(["vet", "owner"] as const)("keeps every group, including DogTag, for role %s", (role) => {
    expect(visibleGroups(role)).toEqual(navGroups);
  });

  it("hides only the DogTag group for plain staff", () => {
    const groups = visibleGroups("staff");
    expect(groups.some((g) => g.label === "DogTag")).toBe(false);
    expect(groups.length).toBe(navGroups.length - 1);
    // Every other group survives unchanged, in the same order.
    expect(groups).toEqual(navGroups.filter((g) => g.label !== "DogTag"));
  });

  it("hides the DogTag group for an undefined role too (unauthenticated/loading - fail closed)", () => {
    expect(visibleGroups(undefined).some((g) => g.label === "DogTag")).toBe(false);
  });
});

describe("Sidebar.visibleGroups - manual verification deployment", () => {
  const hrefs = (groups: ReturnType<typeof visibleGroups>) => groups.flatMap((g) => g.items.map((i) => i.href));

  it("shows the trimmed menu, starting with the manual verification queue", () => {
    const items = hrefs(visibleGroups("owner", "manual_verification"));
    expect(items[0]).toBe("/manual-verification");
    expect(items).toEqual(expect.arrayContaining(["/tags", "/tags/issue", "/clients", "/pets", "/settings"]));
  });

  it("leaves out the clinic-only sections", () => {
    const items = hrefs(visibleGroups("owner", "manual_verification"));
    for (const clinicOnly of ["/calendar", "/appointments", "/services", "/payments", "/accounting"]) {
      expect(items).not.toContain(clinicOnly);
    }
  });

  it("still hides the DogTag group from plain staff", () => {
    expect(hrefs(visibleGroups("staff", "manual_verification"))).not.toContain("/manual-verification");
  });

  it("defaults to the full clinic menu", () => {
    expect(visibleGroups("owner")).toEqual(navGroups);
  });
});
