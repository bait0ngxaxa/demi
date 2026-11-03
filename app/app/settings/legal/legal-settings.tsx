"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CONSENT_SUMMARIES,
  LEGAL_DOCUMENT_TITLES,
  LEGAL_TERMS_ACCEPTANCE_LABEL,
  legalDocumentHref,

} from "@/modules/legal/domain/legal-documents";
import { formatLegalDate, formatLegalDateTime, type LegalVersionView } from "@/modules/legal/domain/legal-views";
import { CONSENT_DECISION_LABELS, LEGAL_CHANNEL_LABELS } from "@/modules/legal/transport/legal-action-state";
import type { ConsentStatusView, LegalSettingsView } from "@/modules/legal/transport/legal-settings-context";
import { acceptCurrentLegalTermsAction, recordConsentDecisionAction } from "@/modules/legal/transport/server-actions";

const linkClass =
  "inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

const consentStateLabel: Record<ConsentStatusView["state"], string> = {
  GIVEN: "ให้ความยินยอมแล้ว",
  WITHDRAWN: "ถอนความยินยอมแล้ว",
  NONE: "ยังไม่ได้ให้ความยินยอม",
};

function DocumentRow({ version, title }: { version: LegalVersionView | null; title: string }): React.JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <p className="font-medium text-text">{title}</p>
        <p className="text-sm leading-6 text-text-muted">
          {version ? <>ฉบับ {version.versionLabel} · มีผล {formatLegalDate(version.publishedAt)}{version.isPlaceholder ? " · ข้อความชั่วคราว" : ""}</> : "ยังไม่ประกาศใช้"}
        </p>
      </div>
      {version ? <Link className={linkClass} href={legalDocumentHref(version.kind)}>อ่าน</Link> : null}
    </li>
  );
}

function TermsAcceptance({ legal }: { legal: LegalSettingsView }): React.JSX.Element | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { terms, privacy } = legal;
  if (!terms || !privacy) return null;
  const currentTerms = terms;
  const currentPrivacy = privacy;

  if (!legal.needsAcceptance) {
    return legal.acceptance ? (
      <p className="text-sm leading-6 text-text-muted">
        คุณยอมรับฉบับ {legal.acceptance.termsVersionLabel} และรับทราบนโยบายฉบับ {legal.acceptance.privacyVersionLabel} เมื่อ{" "}
        <time dateTime={legal.acceptance.acceptedAt}>{formatLegalDateTime(legal.acceptance.acceptedAt)}</time>
      </p>
    ) : null;
  }

  function accept(): void {
    setError(null);
    startTransition(async () => {
      const result = await acceptCurrentLegalTermsAction({ termsVersionId: currentTerms.id, privacyVersionId: currentPrivacy.id });
      if (result.status === "SUCCESS") {
        notify.success("บันทึกการยอมรับแล้ว");
        router.refresh();
        return;
      }
      if (result.status === "ERROR") {
        setError(result.message);
        if (result.code === "LEGAL_VERSION_CHANGED") router.refresh();
      }
    });
  }

  return (
    <Alert variant="warning">
      <p className="font-semibold">มีข้อกำหนดหรือนโยบายฉบับใหม่</p>
      <p className="mt-1">
        {legal.acceptance
          ? `ฉบับที่คุณยอมรับไว้คือ ${legal.acceptance.termsVersionLabel} / ${legal.acceptance.privacyVersionLabel} อ่านฉบับปัจจุบันแล้วกดยอมรับเมื่อพร้อม การใช้งานไม่ถูกจำกัดระหว่างนี้`
          : "อ่านฉบับปัจจุบันแล้วกดยอมรับเมื่อพร้อม การใช้งานไม่ถูกจำกัดระหว่างนี้"}
      </p>
      <p className="mt-3 text-text">{LEGAL_TERMS_ACCEPTANCE_LABEL} (ฉบับ {currentTerms.versionLabel} / {currentPrivacy.versionLabel})</p>
      {error ? <p className="mt-2 font-medium text-danger" role="alert">{error}</p> : null}
      <Button className="mt-3" disabled={pending} loading={pending} onClick={accept} size="compact">
        {pending ? "กำลังบันทึก..." : "ยอมรับเวอร์ชันใหม่"}
      </Button>
    </Alert>
  );
}

function ConsentCard({ consent }: { consent: ConsentStatusView }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // One nonce per intended decision: a retry of the same click is idempotent; a later click gets a new one.
  const nonceRef = useRef<{ key: string; nonce: string } | null>(null);
  const current = consent.current;
  const giving = consent.state !== "GIVEN" || consent.newVersionAvailable;
  const decision = consent.state === "GIVEN" && !consent.newVersionAvailable ? "WITHDRAWN" : "GIVEN";
  const headingId = `consent-${consent.kind}-heading`;

  function decide(next: "GIVEN" | "WITHDRAWN"): void {
    if (!current) return;
    const key = `${next}:${current.id}`;
    if (nonceRef.current?.key !== key) nonceRef.current = { key, nonce: crypto.randomUUID() };
    const submissionNonce = nonceRef.current.nonce;
    setError(null);
    startTransition(async () => {
      const result = await recordConsentDecisionAction({ kind: consent.kind, documentVersionId: current.id, decision: next, submissionNonce });
      if (result.status === "SUCCESS") {
        nonceRef.current = null;
        notify.success(next === "GIVEN" ? "บันทึกการให้ความยินยอมแล้ว" : "บันทึกการถอนความยินยอมแล้ว");
        router.refresh();
        return;
      }
      if (result.status === "ERROR") {
        setError(result.message);
        if (result.code === "LEGAL_VERSION_CHANGED" || result.code === "CONFLICT") {
          nonceRef.current = null;
          router.refresh();
        }
      }
    });
  }

  return (
    <Panel aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-text" id={headingId}>{LEGAL_DOCUMENT_TITLES[consent.kind]}</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={consent.state === "GIVEN" ? "success" : "neutral"}>{consentStateLabel[consent.state]}</StatusBadge>
          {consent.newVersionAvailable ? <StatusBadge variant="info">มีเวอร์ชันใหม่</StatusBadge> : null}
        </div>
      </div>
      <p className="text-sm leading-6 text-text-muted">{CONSENT_SUMMARIES[consent.kind]}</p>
      {consent.decidedVersion && consent.state === "GIVEN" ? (
        <p className="text-sm leading-6 text-text-muted">ให้ไว้ตามฉบับ {consent.decidedVersion.versionLabel}{consent.newVersionAvailable && current ? ` · ฉบับปัจจุบันคือ ${current.versionLabel}` : ""}</p>
      ) : null}
      {error ? <Alert role="alert" variant="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {current ? (
          <Button disabled={pending} loading={pending} onClick={() => decide(decision)} size="compact" variant={giving ? "primary" : "secondary"}>
            {pending ? "กำลังบันทึก..." : giving ? `ให้ความยินยอมตามฉบับ ${current.versionLabel}` : "ถอนความยินยอม"}
          </Button>
        ) : <p className="text-sm text-text-muted">ยังไม่มีฉบับที่ประกาศใช้</p>}
        {consent.state === "GIVEN" && consent.newVersionAvailable ? (
          <Button disabled={pending} onClick={() => decide("WITHDRAWN")} size="compact" variant="secondary">ถอนความยินยอม</Button>
        ) : null}
        {current ? <Link className={linkClass} href={legalDocumentHref(consent.kind)}>อ่านฉบับเต็ม</Link> : null}
      </div>
      {consent.history.length > 0 ? (
        <details className="group border-t border-border pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
            ประวัติ ({consent.history.length})
          </summary>
          <ol className="mt-1 divide-y divide-border text-sm">
            {consent.history.map((event) => (
              <li className="flex flex-wrap justify-between gap-x-4 py-2" key={event.id}>
                <span className="text-text">{CONSENT_DECISION_LABELS[event.decision]} · ฉบับ {event.versionLabel}</span>
                <span className="text-text-muted">
                  <time dateTime={event.decidedAt}>{formatLegalDateTime(event.decidedAt)}</time> · {LEGAL_CHANNEL_LABELS[event.channel]}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Panel>
  );
}

export function LegalSettings({ legal }: { legal: LegalSettingsView }): React.JSX.Element {
  const showConsents = legal.consentsOffered;
  return (
    <div className="space-y-8">
      <section aria-labelledby="legal-documents-heading" className="space-y-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="legal-documents-heading">ข้อกำหนดและนโยบาย</h2>
        <ul className="divide-y divide-border border-y border-border">
          <DocumentRow title={LEGAL_DOCUMENT_TITLES.TERMS} version={legal.terms} />
          <DocumentRow title={LEGAL_DOCUMENT_TITLES.PRIVACY_POLICY} version={legal.privacy} />
        </ul>
        <TermsAcceptance legal={legal} />
        {legal.canManageDocuments ? (
          <Link className={linkClass} href="/app/admin/legal">จัดการฉบับเอกสาร (ผู้ดูแลระบบ)</Link>
        ) : null}
      </section>

      {showConsents ? (
        <section aria-labelledby="legal-consents-heading" className="space-y-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="legal-consents-heading">ความยินยอม</h2>
          <p className="type-readable text-sm leading-6 text-text-muted">
            ความยินยอมแต่ละรายการแยกจากกัน ไม่บังคับ และไม่มีผลต่อการใช้งานบริการ คุณให้หรือถอนได้ทุกเมื่อ ระบบเก็บประวัติทุกครั้ง
          </p>
          <div className="space-y-4">
            {legal.consents.map((consent) => <ConsentCard consent={consent} key={consent.kind} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
