import type { Metadata } from "next";

import { getAccountCreationLegalView } from "@/modules/legal/transport/legal-page-context";

import { FamilyInvitationPreview } from "./family-invitation-preview";

export const metadata: Metadata = {
  title: "คำเชิญผู้ดูแล",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FamilyInvitationPage(): Promise<React.JSX.Element> {
  // LG-D6: a caregiver account accepts Terms + Privacy only.
  const legal = await getAccountCreationLegalView({ includeConsents: false });
  return <FamilyInvitationPreview legal={legal} />;
}
