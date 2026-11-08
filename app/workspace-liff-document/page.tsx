import { getLineWorkspaceLiffId } from "@/lib/env/server";

import { WorkspaceLiffBootstrap } from "../workspace-liff-bootstrap";

/** Public transport shell only. No protected route or actor data is rendered here. */
export default function WorkspaceLiffDocumentPage(): React.JSX.Element {
  return <WorkspaceLiffBootstrap liffId={getLineWorkspaceLiffId()} />;
}
