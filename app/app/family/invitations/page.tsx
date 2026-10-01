import type { Metadata } from "next";

import { FamilyInvitationPreview } from "./family-invitation-preview";

export const metadata: Metadata = {
  title: "คำเชิญผู้ดูแล",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function FamilyInvitationPage(): React.JSX.Element {
  return <FamilyInvitationPreview />;
}
