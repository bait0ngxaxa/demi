import { handleLineWorkflowVerifyRequest } from "@/modules/line/transport/workflow-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Workflow context issuance is guarded by independent server-owned gates. Other methods receive 405. */
export async function POST(request: Request): Promise<Response> {
  return handleLineWorkflowVerifyRequest(request);
}
