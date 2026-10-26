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
import {
  caregiverAccountClaimResponseSchema,
  caregiverInvitationTokenSchema,
} from "@/modules/family/schemas/caregiver-relationship-schemas";
import {
  acceptCaregiverInvitationAction,
  previewCaregiverInvitationAction,
  rejectCaregiverInvitationAction,
} from "@/modules/family/transport/server-actions";
import {
  CAREGIVER_INVITATION_UNAVAILABLE_MESSAGE,
  initialCaregiverInvitationPreviewActionState,
  initialFamilyMutationActionState,
  type CaregiverInvitationRequestedSharingView,
} from "@/modules/family/transport/action-state";
import { FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2 } from "@/modules/family/domain/appointment-grant-contract";
import { CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS, CAREGIVER_RESOURCE_LABELS } from "@/modules/family/domain/caregiver-sharing-contract";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * AF-5: the exact acceptance text of every scope the Patient chose; accepting the invitation accepts all of them
 * together with the relationship. Hospital names appear only when the server returned them.
 */
function RequestedSharing({ sharing }: { sharing: CaregiverInvitationRequestedSharingView }): React.JSX.Element {
  const hasScopes = sharing.appointmentHospitalCount > 0 || sharing.resources.length > 0;
  return (
    <div className="mt-5 space-y-3">
      {sharing.relationshipLabel ? <p className="text-sm text-text">ผู้ป่วยระบุความสัมพันธ์กับคุณว่า: <span className="font-semibold">{sharing.relationshipLabel}</span></p> : null}
      {hasScopes ? (
        <Alert variant="info">
          <p className="font-semibold">เมื่อตอบรับ คุณยอมรับสิทธิ์ต่อไปนี้พร้อมกัน</p>
          <ul className="mt-3 space-y-3">
            {sharing.appointmentHospitalCount > 0 ? (
              <li>
                <p className="font-semibold">
                  นัดหมาย: {sharing.appointmentHospitalNames ? sharing.appointmentHospitalNames.join(", ") : `${sharing.appointmentHospitalCount} หน่วยบริการที่ผู้ป่วยเลือก`}
                </p>
                <p className="type-readable mt-1 text-sm leading-6">{FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2}</p>
              </li>
            ) : null}
            {sharing.resources.map((resource) => (
              <li key={resource}>
                <p className="font-semibold">{CAREGIVER_RESOURCE_LABELS[resource]}</p>
                <p className="type-readable mt-1 text-sm leading-6">{CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS[resource]}</p>
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert variant="info">
          <p>การยอมรับนี้ยังไม่ทำให้คุณมีสิทธิ์เข้าถึงข้อมูลสุขภาพใด ๆ นอกเหนือจากสิทธิ์ที่ระบบอนุญาตอย่างชัดเจน</p>
        </Alert>
      )}
    </div>
  );
}

type InvitationTokenSnapshot =
  | { status: "LOADING" }
  | { status: "INVALID" }
  | { status: "READY"; token: string };

const initialInvitationTokenSnapshot: InvitationTokenSnapshot = { status: "LOADING" };

type AccountClaimState =
  | { status: "IDLE" }
  | { status: "PENDING" }
  | { status: "ACCEPTED" }
  | { status: "ERROR"; message: string };

function CaregiverAccountClaimForm({
  token,
  patientDisplayName,
  expiresAt,
  requestedSharing,
}: {
  token: string;
  patientDisplayName: string;
  expiresAt: string;
  requestedSharing: CaregiverInvitationRequestedSharingView;
}): React.JSX.Element {
  const [state, setState] = useState<AccountClaimState>({ status: "IDLE" });

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status === "PENDING") return;
    setState({ status: "PENDING" });
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/family/caregiver-invitations/accept-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          nationalId: formData.get("nationalId"),
          givenName: formData.get("givenName"),
          familyName: formData.get("familyName"),
          password: formData.get("password"),
          passwordConfirmation: formData.get("passwordConfirmation"),
        }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const parsed = caregiverAccountClaimResponseSchema.safeParse(payload);
      if (response.ok && parsed.success && parsed.data.status === "ACCEPTED") {
        setState({ status: "ACCEPTED" });
      } else if (parsed.success && parsed.data.status === "ERROR") {
        setState({ status: "ERROR", message: parsed.data.message });
      } else {
        setState({ status: "ERROR", message: "ไม่สามารถสร้างบัญชีได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" });
      }
    } catch {
      setState({ status: "ERROR", message: connectionFailureMessage });
    }
  }

  if (state.status === "ACCEPTED") {
    return (
      <Alert className="mt-5" variant="success">
        <p className="font-semibold">สร้างบัญชีและตอบรับคำเชิญแล้ว</p>
        <p className="mt-1">เข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้เพื่อดูครอบครัวของคุณ</p>
        <Link
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href="/login"
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </Alert>
    );
  }

  return (
    <Panel className="mt-5">
      <h3 className="text-lg font-semibold text-text">สร้างบัญชีผู้ดูแล</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        คำเชิญจาก {patientDisplayName} หมดอายุ {formatFamilyManagementDate(new Date(expiresAt))}
      </p>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ชื่อและนามสกุลที่กรอกเป็นข้อมูลที่คุณแจ้งเอง ผู้ป่วยจะเห็นชื่อนี้ในรายการครอบครัว
      </p>
      <RequestedSharing sharing={requestedSharing} />
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="caregiver-claim-national-id">เลขบัตรประชาชนของคุณ</label>
          <input autoComplete="off" className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring" disabled={state.status === "PENDING"} id="caregiver-claim-national-id" inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-text" htmlFor="caregiver-claim-given-name">ชื่อ</label>
            <input autoComplete="given-name" className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring" disabled={state.status === "PENDING"} id="caregiver-claim-given-name" maxLength={120} name="givenName" required type="text" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-text" htmlFor="caregiver-claim-family-name">นามสกุล</label>
            <input autoComplete="family-name" className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring" disabled={state.status === "PENDING"} id="caregiver-claim-family-name" maxLength={120} name="familyName" required type="text" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="caregiver-claim-password">รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)</label>
          <PasswordInput autoComplete="new-password" className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring" disabled={state.status === "PENDING"} id="caregiver-claim-password" maxLength={128} minLength={12} name="password" required />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="caregiver-claim-password-confirmation">ยืนยันรหัสผ่าน</label>
          <PasswordInput autoComplete="new-password" className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring" disabled={state.status === "PENDING"} id="caregiver-claim-password-confirmation" maxLength={128} minLength={12} name="passwordConfirmation" required />
        </div>
        {state.status === "ERROR" ? <Alert role="alert" variant="danger">{state.message}</Alert> : null}
        <Button disabled={state.status === "PENDING"} loading={state.status === "PENDING"} type="submit">
          {state.status === "PENDING" ? "กำลังสร้างบัญชี..." : "สร้างบัญชีและตอบรับคำเชิญ"}
        </Button>
      </form>
    </Panel>
  );
}

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
        breadcrumbs={[{ label: "ครอบครัวและผู้ดูแล", href: "/app/family" }, { label: "คำเชิญ" }]}
        description="ตรวจสอบคำเชิญจากผู้ป่วยและตอบรับด้วยบัญชีของคุณ"
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
              ? CAREGIVER_INVITATION_UNAVAILABLE_MESSAGE
              : preview.status === "INVALID" || preview.status === "ERROR"
                ? preview.message
                : "คำเชิญไม่พร้อมใช้งาน"}
          </p>
          <Link
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href="/app/family"
          >
            กลับไปหน้าครอบครัวและผู้ดูแล
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

      {preview.status === "NEEDS_ACCOUNT" && token ? (
        <>
          <CaregiverAccountClaimForm
            expiresAt={preview.invitation.expiresAt}
            patientDisplayName={preview.invitation.patientDisplayName}
            requestedSharing={preview.invitation.requestedSharing}
            token={token}
          />
          <p className="mt-4 text-sm text-text-muted">หากมีบัญชีแล้ว เข้าสู่ระบบเพื่อรับคำเชิญนี้</p>
          <LoginLink token={token} />
        </>
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
          <RequestedSharing sharing={preview.invitation.requestedSharing} />
          <p className="mt-2 text-xs text-text-muted">ข้อตกลงการตอบรับ: {preview.invitation.acceptanceContractVersion}</p>

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
