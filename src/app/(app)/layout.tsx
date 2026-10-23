import type {ReactNode} from "react";
import {redirect} from "next/navigation";
import {auth} from "@/auth";
import {getServerEnv} from "@/lib/env";
import {Sidebar} from "@/components/shell/Sidebar";
import {Topbar} from "@/components/shell/Topbar";

/** The authenticated staff app shell: sidebar nav + topbar, wraps every `/dashboard`, `/setup`,
 * `/settings`, `/calendar`, ... route. Middleware already gates these paths, but a server-side
 * session check here is cheap defense in depth and is what supplies the signed-in user's
 * email/role to the shell. */
export default async function AppLayout({children}: {children: ReactNode}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.staffId) {
    redirect("/sign-in");
  }
  const mode = getServerEnv().DOGTAG_APP_MODE;

  return (
    // No background here: <body> paints the porcelain ground and brand glow the glass shell refracts.
    <div className="flex h-dvh">
      <Sidebar role={session.user.role} mode={mode} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={session.user.email} role={session.user.role ?? "staff"} mode={mode} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
