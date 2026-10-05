"use client";

import {signOut} from "next-auth/react";
import {Button} from "@/components/ui/controls";
import {StatusBadge} from "@/components/ui/StatusBadge";
import {staffRoleLabel, staffRoleTone} from "@/lib/staffRoleTone";
import type {StaffRole} from "@/lib/models/Staff";

export interface TopbarProps {
  email: string;
  role: StaffRole;
}

export function Topbar({email, role}: TopbarProps) {
  return (
    <header className="glass flex h-14 shrink-0 items-center justify-between border-x-0 border-t-0 px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-body text-ink">{email}</span>
          <StatusBadge tone={staffRoleTone[role]} label={staffRoleLabel[role]} />
        </div>
        <Button variant="secondary" onClick={() => signOut({redirectTo: "/"})}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
