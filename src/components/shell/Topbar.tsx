"use client";

import {signOut} from "next-auth/react";
import {Button} from "@/components/ui/controls";
import {StatusBadge} from "@/components/ui/StatusBadge";
import {staffRoleLabel, staffRoleTone} from "@/lib/staffRoleTone";
import type {StaffRole} from "@/lib/models/Staff";
import {MobileNav} from "@/components/shell/MobileNav";
import type {AppMode} from "@/components/shell/nav";

export interface TopbarProps {
  email: string;
  role: StaffRole;
  mode?: AppMode;
}

export function Topbar({email, role, mode}: TopbarProps) {
  return (
    <header className="glass flex h-14 shrink-0 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6">
      <MobileNav role={role} mode={mode} />
      <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden truncate text-body text-ink sm:inline" title={email}>
            {email}
          </span>
          <StatusBadge tone={staffRoleTone[role]} label={staffRoleLabel[role]} />
        </div>
        <Button variant="secondary" onClick={() => signOut({redirectTo: "/"})}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
