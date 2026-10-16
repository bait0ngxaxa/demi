"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { connectionFailureMessage, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  caregiverInvitationStatusLabel,
  caregiverInvitationStatusVariant,
  formatFamilyManagementDate,
} from "@/modules/family/presentation/caregiver-relationship-presentation";
import { caregiverInvitationTokenSchema } from "@/modules/family/schemas/caregiver-relationship-schemas";
import {
  acceptCaregiverInvitationAction,
  previewCaregiverInvitationAction,
  rejectCaregiverInvitationAction,
} from "@/modules/family/transport/server-actions";
import {
  initialCaregiverInvitationPreviewActionState,
  initialFamilyMutationActionState,
} from "@/modules/family/transport/action-state";

type InvitationTokenSnapshot =
  | { status: "LOADING" }
  | { status: "INVALID" }
  | { status: "READY"; token: string };

const initialInvitationTokenSnapshot: InvitationTokenSnapshot = { status: "LOADING" };

function createInvitationTokenStore(): {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => InvitationTokenSnapshot;
  getServerSnapshot: () => InvitationTokenSnapshot;
  hydrate: () => void;
} {
  let snapshot = initialInvitationTokenSnapshot;
  let hydrated = false;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    getServerSnapshot() {
      return initialInvitationTokenSnapshot;
    },
    hydrate() {
      if (hydrated) {
        return;
      }
      hydrated = true;

      let decodedToken = "";
      try {
        decodedToken = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        decodedToken = "";
      }

      const parsedToken = caregiverInvitationTokenSchema.safeParse(decodedToken);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      snapshot = parsedToken.success
        ? { status: "READY", token: parsedToken.data }
        : { status: "INVALID" };
      listeners.forEach((listener) => listener());
    },
  };
}

function LoginLink({ token }: { token: string }): React.JSX.Element {
  return (
    <Link
      className="mt-4 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:border-action-primary hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      href={`/login#${encodeURIComponent(token)}`}
    >
      เข้าสู่ระบบด้วยบัญชีผู้รับคำเชิญ
    </Link>
  );
}

export function FamilyInvitationPreview(): React.JSX.Element {
  const store = useMemo(() => createInvitationTokenStore(), []);
  const tokenSnapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const token = tokenSnapshot.status === "READY" ? tokenSnapshot.token : null;
  const [preview, setPreview] = useState(initialCaregiverInvitationPreviewActionState);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [statusCheckPending, setStatusCheckPending] = useState(false);
  const [statusVerifiedAfterUnknown, setStatusVerifiedAfterUnknown] = useState(false);
  const [acceptance, acceptAction, accepting, acceptingUnknown] = useMutationActionState(
    acceptCaregiverInvitationAction,
    initialFamilyMutationActionState,
  );
  const [rejection, rejectAction, rejecting, rejectingUnknown] = useMutationActionState(
    rejectCaregiverInvitationAction,
    initialFamilyMutationActionState,
  );

  useEffect(() => {
    store.hydrate();
  }, [store]);

  useEffect(() => {
    if (tokenSnapshot.status !== "READY") {
      return;
    }

    let active = true;
    previewCaregiverInvitationAction(tokenSnapshot.token).then(
      (result) => {
        if (active) {
          setPreview(result);
        }
      },
      () => {
        if (active) {
          setPreviewFailed(true);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [tokenSnapshot]);

  const hasCompletedResponse = acceptance.status === "SUCCESS" || rejection.status === "SUCCESS";
  const canRetryAfterStatusCheck =
    statusVerifiedAfterUnknown &&
    preview.status === "READY" &&
    preview.invitation.invitationStatus === "PENDING";

  async function verifyInvitationStatus(): Promise<void> {
    if (!token || statusCheckPending) {
      return;
    }

    setStatusCheckPending(true);
    setPreviewFailed(false);
    try {
      const nextPreview = await previewCaregiverInvitationAction(token);
      setPreview(nextPreview);
      setStatusVerifiedAfterUnknown(
        (acceptingUnknown || rejectingUnknown) && nextPreview.status === "READY",
      );
      if (nextPreview.status === "ERROR") {
        setPreviewFailed(true);
      }
    } catch {
      setPreviewFailed(true);
    } finally {
      setStatusCheckPending(false);
    }
  }

  function submitAcceptance(formData: FormData): void {
    setStatusVerifiedAfterUnknown(false);
    acceptAction(formData);
  }

  function submitRejection(formData: FormData): void {
    setStatusVerifiedAfterUnknown(false);
    rejectAction(formData);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[{ label: "ความสัมพันธ์ผู้ดูแล", href: "/app/family" }, { label: "คำเชิญ" }]}
        description="ตรวจสอบคำเชิญสำหรับบัญชีที่เข้าสู่ระบบ และเลือกตอบรับหรือปฏิเสธด้วยตนเอง"
        title="คำเชิญผู้ดูแล"
      />

      {previewFailed ? (
        <Alert className="mt-6" role="alert" variant="danger">
          <p className="font-semibold">ตรวจสอบคำเชิญไม่สำเร็จ</p>
          <p className="mt-1">{connectionFailureMessage}</p>
          <Button
            className="mt-3"
            loading={statusCheckPending}
            onClick={() => void verifyInvitationStatus()}
            size="compact"
            variant="secondary"
          >
            {statusCheckPending ? "กำลังตรวจสอบสถานะ..." : "ลองอีกครั้ง"}
          </Button>
        </Alert>
      ) : tokenSnapshot.status === "LOADING" || (tokenSnapshot.status === "READY" && preview.status === "LOADING") ? (
        <Panel className="mt-6" aria-busy="true">
          <p className="text-sm text-text-muted" role="status">กำลังตรวจสอบคำเชิญ...</p>
        </Panel>
      ) : null}

      {tokenSnapshot.status === "INVALID" || preview.status === "INVALID" || preview.status === "ERROR" ? (
        <Alert className="mt-6" variant={preview.status === "ERROR" ? "danger" : "warning"}>
          <p className="font-semibold">
            {tokenSnapshot.status === "INVALID" && preview.status === "LOADING"
              ? "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน"
              : preview.status === "INVALID" || preview.status === "ERROR"
                ? preview.message
                : "คำเชิญไม่พร้อมใช้งาน"}
          </p>
          <Link
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href="/app/family"
          >
            กลับไปหน้าความสัมพันธ์ผู้ดูแล
          </Link>
        </Alert>
      ) : null}

      {preview.status === "NEEDS_LOGIN" ? (
        <Alert className="mt-6" variant="info">
          <p className="font-semibold">{preview.message}</p>
          <p className="mt-1">หลังเข้าสู่ระบบ ระบบจะกลับมาตรวจสอบคำเชิญนี้อีกครั้ง</p>
          {token ? <LoginLink token={token} /> : null}
        </Alert>
      ) : null}

      {preview.status === "READY" ? (
        <Panel className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text">{preview.invitation.patientDisplayName}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                คำเชิญให้เชื่อมความสัมพันธ์เป็นผู้ดูแล
              </p>
            </div>
            <StatusBadge variant={caregiverInvitationStatusVariant(preview.invitation.invitationStatus)}>
              {caregiverInvitationStatusLabel(preview.invitation.invitationStatus)}
            </StatusBadge>
          </div>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            คำเชิญหมดอายุ {formatFamilyManagementDate(preview.invitation.expiresAt)}
          </p>
          <Alert className="mt-5" variant="info">
            <p>
              การยอมรับนี้ยังไม่ทำให้คุณมีสิทธิ์เข้าถึงข้อมูลสุขภาพใด ๆ
              นอกเหนือจากสิทธิ์ที่ระบบอนุญาตอย่างชัดเจน
            </p>
            <p className="mt-2 text-xs">ข้อตกลงการตอบรับ: {preview.invitation.acceptanceContractVersion}</p>
          </Alert>

          {acceptance.status === "SUCCESS" ? (
            <Alert className="mt-5" variant="success">{acceptance.message}</Alert>
          ) : null}
          {rejection.status === "SUCCESS" ? (
            <Alert className="mt-5" variant="success">{rejection.message}</Alert>
          ) : null}
          {acceptance.status === "ERROR" ? <Alert className="mt-5" variant="danger">{acceptance.message}</Alert> : null}
          {rejection.status === "ERROR" ? <Alert className="mt-5" variant="danger">{rejection.message}</Alert> : null}
          {canRetryAfterStatusCheck ? (
            <Alert className="mt-5" role="status" variant="info">
              ตรวจสอบแล้วว่าคำเชิญยังรอตอบรับ หากยังต้องการ ให้เลือกตอบรับหรือปฏิเสธด้วยตนเอง
            </Alert>
          ) : null}
          <UnknownOutcomeAlert
            active={acceptingUnknown && !statusVerifiedAfterUnknown}
            className="mt-5"
            recovery={{
              kind: "verify",
              label: "ตรวจสอบสถานะคำเชิญ",
              message: "ระบบอาจบันทึกคำตอบแล้ว ตรวจสอบสถานะปัจจุบันก่อน คำเชิญที่ตอบแล้วจะใช้ซ้ำไม่ได้",
              onVerify: () => void verifyInvitationStatus(),
              verifying: statusCheckPending,
            }}
          />
          <UnknownOutcomeAlert
            active={rejectingUnknown && !statusVerifiedAfterUnknown}
            className="mt-5"
            recovery={{
              kind: "verify",
              label: "ตรวจสอบสถานะคำเชิญ",
              message: "ระบบอาจบันทึกคำตอบแล้ว ตรวจสอบสถานะปัจจุบันก่อน คำเชิญที่ตอบแล้วจะใช้ซ้ำไม่ได้",
              onVerify: () => void verifyInvitationStatus(),
              verifying: statusCheckPending,
            }}
          />

          {preview.invitation.invitationStatus === "PENDING" && !hasCompletedResponse ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <form action={submitAcceptance}>
                <input name="token" type="hidden" value={token ?? ""} />
                <Button disabled={accepting || rejecting || ((acceptingUnknown || rejectingUnknown) && !canRetryAfterStatusCheck)} loading={accepting} type="submit">
                  {accepting ? "กำลังยอมรับ..." : "ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล"}
                </Button>
              </form>
              <form action={submitRejection}>
                <input name="token" type="hidden" value={token ?? ""} />
                <Button disabled={accepting || rejecting || ((acceptingUnknown || rejectingUnknown) && !canRetryAfterStatusCheck)} loading={rejecting} type="submit" variant="secondary">
                  {rejecting ? "กำลังปฏิเสธ..." : "ปฏิเสธคำเชิญ"}
                </Button>
              </form>
            </div>
          ) : null}

          {preview.invitation.invitationStatus !== "PENDING" ? (
            <p className="mt-5 text-sm leading-6 text-text-muted">
              คำเชิญนี้เป็นสถานะสิ้นสุดแล้วและไม่สามารถตอบรับซ้ำได้
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
