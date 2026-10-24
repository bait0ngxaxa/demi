/**
 * Client orchestration of "create DRAFT -> upload images in order -> publish".
 *
 * Every step is an existing idempotent server operation (create nonce, per-image upload nonce,
 * `expectedUpdatedAt`). The flow state lives in memory and is mutated as steps are confirmed, so
 * calling `runHospitalContentPublishFlow` again with the same state resumes at the failed step
 * without creating a second draft or re-storing an image that was already confirmed.
 * Content is published only after every selected image has a confirmed id.
 */

export type HospitalContentPublishFlowStep = "CREATE" | "UPLOAD" | "PUBLISH";

export type HospitalContentPublishFlowImage = {
  /** Stable per file: a replay of the same nonce is accepted by the server only for identical bytes. */
  nonce: string;
  file: File;
  imageId?: string;
};

export type HospitalContentPublishFlowState = {
  contentId?: string;
  /** Version returned by create; image uploads do not change it. */
  expectedUpdatedAt?: string;
  images: HospitalContentPublishFlowImage[];
  /** A publish whose outcome was never confirmed must be reconciled by reading the content. */
  publishUnconfirmed?: boolean;
};

export type HospitalContentPublishFlowDependencies = {
  create(): Promise<
    | { kind: "OK"; contentId: string; expectedUpdatedAt: string }
    | { kind: "UNKNOWN" }
    | { kind: "CONFLICT" }
    | { kind: "REJECTED"; message: string }
  >;
  upload(contentId: string, image: HospitalContentPublishFlowImage): Promise<
    | { kind: "OK"; imageId: string }
    | { kind: "UNKNOWN" }
    | { kind: "REJECTED"; message: string }
  >;
  publish(contentId: string, expectedUpdatedAt: string): Promise<
    | { kind: "OK" }
    | { kind: "UNKNOWN" }
    | { kind: "CONFLICT" }
    | { kind: "REJECTED"; message: string }
  >;
  readCurrent(contentId: string): Promise<
    | { kind: "OK"; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; expectedUpdatedAt: string }
    | { kind: "UNKNOWN" }
  >;
};

export type HospitalContentPublishFlowProgress = {
  step: HospitalContentPublishFlowStep;
  /** 1-based number of the image being uploaded, with the total. */
  imageNumber?: number;
  imageTotal: number;
};

export type HospitalContentPublishFlowResult =
  | { status: "DONE"; contentId: string; published: boolean }
  | {
      status: "STOPPED";
      step: HospitalContentPublishFlowStep;
      imageNumber?: number;
      /** UNKNOWN: outcome not confirmed (retry is safe). CONFLICT/REJECTED: the saved draft must be reviewed. */
      reason: "UNKNOWN" | "CONFLICT" | "REJECTED";
      message?: string;
      /** "ลองต่อ" is offered only when repeating the step cannot duplicate or overwrite anything. */
      resumable: boolean;
    };

export async function runHospitalContentPublishFlow(
  state: HospitalContentPublishFlowState,
  options: { publish: boolean; onProgress?: (progress: HospitalContentPublishFlowProgress) => void },
  dependencies: HospitalContentPublishFlowDependencies,
): Promise<HospitalContentPublishFlowResult> {
  const imageTotal = state.images.length;
  const report = (progress: Omit<HospitalContentPublishFlowProgress, "imageTotal">): void => options.onProgress?.({ ...progress, imageTotal });

  if (state.contentId === undefined || state.expectedUpdatedAt === undefined) {
    report({ step: "CREATE" });
    const created = await dependencies.create();
    if (created.kind !== "OK") {
      return {
        status: "STOPPED",
        step: "CREATE",
        reason: created.kind,
        ...(created.kind === "REJECTED" ? { message: created.message } : {}),
        resumable: created.kind === "UNKNOWN",
      };
    }
    state.contentId = created.contentId;
    state.expectedUpdatedAt = created.expectedUpdatedAt;
  }
  const contentId = state.contentId;

  for (const [index, image] of state.images.entries()) {
    if (image.imageId !== undefined) continue;
    report({ step: "UPLOAD", imageNumber: index + 1 });
    const uploaded = await dependencies.upload(contentId, image);
    if (uploaded.kind !== "OK") {
      return {
        status: "STOPPED",
        step: "UPLOAD",
        imageNumber: index + 1,
        reason: uploaded.kind,
        ...(uploaded.kind === "REJECTED" ? { message: uploaded.message } : {}),
        resumable: uploaded.kind === "UNKNOWN",
      };
    }
    image.imageId = uploaded.imageId;
  }

  if (!options.publish) return { status: "DONE", contentId, published: false };

  report({ step: "PUBLISH" });
  if (state.publishUnconfirmed) {
    const current = await dependencies.readCurrent(contentId);
    if (current.kind === "UNKNOWN") return { status: "STOPPED", step: "PUBLISH", reason: "UNKNOWN", resumable: true };
    if (current.status === "PUBLISHED") return { status: "DONE", contentId, published: true };
    if (current.status !== "DRAFT" || current.expectedUpdatedAt !== state.expectedUpdatedAt) {
      return { status: "STOPPED", step: "PUBLISH", reason: "CONFLICT", resumable: false };
    }
  }
  const published = await dependencies.publish(contentId, state.expectedUpdatedAt);
  if (published.kind === "OK") {
    state.publishUnconfirmed = false;
    return { status: "DONE", contentId, published: true };
  }
  state.publishUnconfirmed = published.kind === "UNKNOWN";
  return {
    status: "STOPPED",
    step: "PUBLISH",
    reason: published.kind,
    ...(published.kind === "REJECTED" ? { message: published.message } : {}),
    resumable: published.kind === "UNKNOWN",
  };
}
