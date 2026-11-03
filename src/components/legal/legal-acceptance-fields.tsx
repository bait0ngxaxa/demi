import {
  CONSENT_SUMMARIES,
  LEGAL_TERMS_ACCEPTANCE_LABEL,
  legalDocumentHref,
} from "@/modules/legal/domain/legal-documents";
import { LEGAL_FORM_FIELDS, legalConsentFieldName } from "@/modules/legal/domain/legal-form-fields";
import type { AccountCreationLegalView } from "@/modules/legal/domain/legal-views";

const linkClass =
  "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
const checkboxClass = "mt-0.5 size-5 shrink-0 accent-action-primary";

export type LegalAcceptanceFieldsProps = {
  legal: AccountCreationLegalView;
  /** Field error from the server action (e.g. the box was left unchecked). */
  error?: string;
  disabled?: boolean;
  idPrefix: string;
};

/**
 * LG-D4: one required checkbox for Terms acceptance + Privacy acknowledgement, with the exact versions shown as
 * hidden fields; PATIENT screens add the two optional consents, unchecked by default. Links open in a new tab so the
 * form keeps what was typed. Re-mount (key by version ids) to clear the choices after a newer version is published.
 */
export function LegalAcceptanceFields({ legal, error, disabled = false, idPrefix }: LegalAcceptanceFieldsProps): React.JSX.Element {
  const errorId = `${idPrefix}-legal-error`;
  return (
    <fieldset className="space-y-3 border-t border-border pt-5">
      <legend className="sr-only">ข้อกำหนดและความยินยอม</legend>
      <input name={LEGAL_FORM_FIELDS.termsVersionId} type="hidden" value={legal.terms.id} />
      <input name={LEGAL_FORM_FIELDS.privacyVersionId} type="hidden" value={legal.privacy.id} />

      <div className="flex items-start gap-3">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={checkboxClass}
          disabled={disabled}
          id={`${idPrefix}-accept-legal`}
          name={LEGAL_FORM_FIELDS.accept}
          required
          type="checkbox"
        />
        <div className="min-w-0 text-sm leading-6 text-text">
          <label className="cursor-pointer" htmlFor={`${idPrefix}-accept-legal`}>{LEGAL_TERMS_ACCEPTANCE_LABEL}</label>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <a className={linkClass} href={legalDocumentHref("TERMS")} rel="noopener" target="_blank">
              อ่าน{legal.terms.title}
            </a>
            <a className={linkClass} href={legalDocumentHref("PRIVACY_POLICY")} rel="noopener" target="_blank">
              อ่าน{legal.privacy.title}
            </a>
          </p>
        </div>
      </div>
      {error ? <p className="text-sm leading-6 text-danger" id={errorId}>{error}</p> : null}

      {legal.consents.length > 0 ? (
        <div className="space-y-3 rounded-panel border border-border bg-surface-muted px-4 py-4">
          <p className="text-sm leading-6 text-text-muted">ความยินยอมต่อไปนี้ไม่บังคับ เลือกหรือไม่เลือกก็เปิดใช้งานบัญชีได้ และเปลี่ยนได้ทุกเมื่อที่ การตั้งค่า → เงื่อนไขและการใช้งาน</p>
          {legal.consents.map((consent) => {
            const id = `${idPrefix}-consent-${consent.kind}`;
            return (
              <div className="flex items-start gap-3" key={consent.kind}>
                <input
                  aria-describedby={`${id}-summary`}
                  className={checkboxClass}
                  disabled={disabled}
                  id={id}
                  name={legalConsentFieldName(consent.kind)}
                  type="checkbox"
                  value={consent.id}
                />
                <div className="min-w-0 text-sm leading-6">
                  <label className="cursor-pointer font-medium text-text" htmlFor={id}>{consent.title} (ไม่บังคับ)</label>
                  <p className="text-text-muted" id={`${id}-summary`}>{CONSENT_SUMMARIES[consent.kind]}</p>
                  <a className={linkClass} href={legalDocumentHref(consent.kind)} rel="noopener" target="_blank">อ่านฉบับเต็ม</a>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
}

/** Shown instead of the form when TERMS or PRIVACY_POLICY has no published version (fail closed). */
export function LegalDocumentsUnavailable(): React.JSX.Element {
  return (
    <div className="mt-8 rounded-panel border border-warning/20 bg-warning-soft px-4 py-4 text-sm leading-6 text-warning" role="status">
      <p className="font-semibold">ยังไม่สามารถสร้างบัญชีได้ในขณะนี้</p>
      <p className="mt-1">ระบบยังไม่มีข้อกำหนดและนโยบายฉบับที่ประกาศใช้ กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ</p>
    </div>
  );
}

/** Footer links to the public legal pages for login and other public entry screens. */
export function LegalFooterLinks({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <nav aria-label="ข้อกำหนดและนโยบาย" className={`flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 ${className}`}>
      <a className={linkClass} href={legalDocumentHref("TERMS")}>ข้อกำหนดและเงื่อนไขการใช้บริการ</a>
      <a className={linkClass} href={legalDocumentHref("PRIVACY_POLICY")}>นโยบายการคุ้มครองข้อมูลส่วนบุคคล</a>
    </nav>
  );
}
