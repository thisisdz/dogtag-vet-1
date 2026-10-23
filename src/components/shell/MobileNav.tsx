"use client";

import {useEffect, useRef} from "react";
import {usePathname} from "next/navigation";
import {SidebarNav} from "@/components/shell/Sidebar";
import {CloseIcon, MenuIcon} from "@/components/ui/icons";
import type {AppMode} from "@/components/shell/nav";
import type {StaffRole} from "@/lib/models/Staff";

/**
 * Below lg the sidebar would leave a ~135px content column on a phone, so the same nav opens as a
 * drawer instead. A native modal <dialog> gives focus trapping, Esc to close and an inert page
 * behind it for free; it also closes itself whenever the route changes.
 */
export function MobileNav({role, mode}: {role?: StaffRole; mode?: AppMode}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink hover:bg-brand-soft lg:hidden"
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>
      <dialog
        ref={dialog}
        aria-label="Main menu"
        // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] bg-transparent p-0 backdrop:bg-[var(--scrim)]"
      >
        <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto bg-surface px-3 py-5 shadow-raised">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="absolute right-2 top-3 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-brand-soft"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
          <SidebarNav role={role} mode={mode} />
        </nav>
      </dialog>
    </>
  );
}
