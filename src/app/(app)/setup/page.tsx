import {auth} from "@/auth";
import {PageHeader} from "@/components/shell/PageHeader";
import {Banner} from "@/components/ui/Banner";
import {SetupWizard} from "@/app/(app)/setup/SetupWizard";
import {serverBrand} from "@/lib/brand.server";

export default async function SetupPage() {
  const {org} = serverBrand();
  const session = await auth();
  // The wizard ends in PATCH /api/settings, which is owner-only - show everyone else why instead of
  // letting them walk through the wallet steps to a failed save. The API is the actual boundary.
  const isOwner = session?.user?.role === "owner";

  return (
    <>
      <PageHeader
        title="Setup wizard"
        description={`Connect a wallet and discover this ${org}'s VetIssuer clone on ROAX.`}
      />
      {isOwner ? (
        <SetupWizard />
      ) : (
        <div className="max-w-2xl">
          <Banner tone="info" title="Only an owner can run setup">
            Setup saves this {org}&apos;s chain identity. Ask an owner to run it.
          </Banner>
        </div>
      )}
    </>
  );
}
