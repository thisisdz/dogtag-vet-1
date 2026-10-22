"use client";

import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {Select} from "@/components/ui/controls";
import {MANUAL_VERIFICATION_STATUSES} from "@/lib/manualVerification/stateMachine";
import {manualVerificationKindLabel, manualVerificationStatusLabel} from "@/lib/manualVerificationTone";

/** Queue filters - state lives in the URL so the page stays a server component (PaymentFilters pattern). */
export function ManualVerificationFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Select
        value={searchParams.get("status") ?? "needs_me"}
        onChange={(e) => setParam("status", e.target.value === "needs_me" ? "" : e.target.value)}
        className="w-auto"
        aria-label="Filter by status"
      >
        <option value="needs_me">Needs me</option>
        <option value="all">All requests</option>
        {MANUAL_VERIFICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {manualVerificationStatusLabel[status]}
          </option>
        ))}
      </Select>
      <Select
        value={searchParams.get("kind") ?? ""}
        onChange={(e) => setParam("kind", e.target.value)}
        className="w-auto"
        aria-label="Filter by kind"
      >
        <option value="">DogTag and vaccination</option>
        {(["dogtag", "vaccination"] as const).map((kind) => (
          <option key={kind} value={kind}>
            {manualVerificationKindLabel[kind]}
          </option>
        ))}
      </Select>
    </div>
  );
}
