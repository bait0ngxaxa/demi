import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORM_ADMIN_CAREGIVER_INVITATION_MESSAGE } from "@/modules/family/domain/family-access";
import { isSignedInPlatformAdminViewer } from "@/modules/family/transport/appointment-grant-page-context";
import { getAccountCreationLegalView } from "@/modules/legal/transport/legal-page-context";

import { FamilyInvitationPreview } from "./family-invitation-preview";

export const metadata: Metadata = {
  title: "คำเชิญผู้ดูแล",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** A signed-in platform ADMIN gets the terminal state before the invitation token is read or previewed. */
function PlatformAdminInvitationNotice(): React.JSX.Element {
  return (
    <div className="max-w-3xl">
      <PageHeader breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "คำเชิญ" }]} title="คำเชิญผู้ดูแล" />
      <Alert className="mt-6" variant="warning">
        <p className="font-semibold">{PLATFORM_ADMIN_CAREGIVER_INVITATION_MESSAGE}</p>
        <Link
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href="/app"
        >
          กลับหน้าหลัก
        </Link>
      </Alert>
    </div>
  );
}

export default async function FamilyInvitationPage(): Promise<React.JSX.Element> {
  if (await isSignedInPlatformAdminViewer()) return <PlatformAdminInvitationNotice />;
  // LG-D6: a caregiver account accepts Terms + Privacy only.
  const legal = await getAccountCreationLegalView({ includeConsents: false });
  return <FamilyInvitationPreview legal={legal} />;
}
