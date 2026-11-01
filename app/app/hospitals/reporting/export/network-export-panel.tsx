"use client";

import { useId, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalReportCohort } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { NetworkReportExportPreview } from "@/modules/reporting/services/hospital-report-query-service";

import { downloadReportFile } from "../report-download";

export const NETWORK_EXPORT_ENDPOINT = "/api/v1/hospital/reporting/network/export";
export const NETWORK_EXPORT_CONFIRMATION = "ไฟล์มีข้อมูลส่วนบุคคลของผู้ป่วยทุกหน่วยบริการที่เลือก";

type Scope = "ALL" | "SELECTED";

const numberFormat = (value: number): string => value.toLocaleString("th-TH");

/** The download URL for a selection; the server re-resolves the network and refuses any Hospital no longer in it. */
export function networkExportUrl(parentHospitalId: string, scope: Scope, hospitalIds: readonly string[], cohort: HospitalReportCohort): string {
  const query = new URLSearchParams({ parentHospitalId });
  if (scope === "ALL") query.set("scope", "ALL");
  else for (const hospitalId of hospitalIds) query.append("hospitalId", hospitalId);
  if (cohort === "INCLUDE_ENDED") query.set("cohort", "INCLUDE_ENDED");
  return `${NETWORK_EXPORT_ENDPOINT}?${query.toString()}`;
}

/**
 * ADR-0025: a Parent OWNER or MEMBER chooses the whole network or selected Hospitals, sees what the file holds
 * from the preview counts, and confirms the patient-data disclosure before the download starts.
 */
export function NetworkExportPanel({
  previews,
}: {
  /** The same eligible Hospitals counted for each cohort. */
  previews: Record<HospitalReportCohort, NetworkReportExportPreview>;
}): React.JSX.Element {
  const ids = useId();
  const [cohort, setCohort] = useState<HospitalReportCohort>("ACTIVE");
  const [scope, setScope] = useState<Scope>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(previews.ACTIVE.hospitals.map(({ id }) => id)));
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const preview = previews[cohort];
  const childCount = preview.hospitals.filter(({ kind }) => kind === "CHILD").length;
  const included = scope === "ALL" ? preview.hospitals : preview.hospitals.filter(({ id }) => selected.has(id));
  const totals = {
    hospitals: included.length,
    relationships: included.reduce((sum, hospital) => sum + hospital.relationships, 0),
    programs: included.reduce((sum, hospital) => sum + hospital.programs, 0),
  };
  const overLimit = totals.programs > preview.maxPrograms;
  const nothingSelected = totals.hospitals === 0;

  const query = search.trim().toLocaleLowerCase("th");
  const visible = useMemo(
    () => preview.hospitals.filter(({ name, hospitalCode }) =>
      query === "" || name.toLocaleLowerCase("th").includes(query) || hospitalCode.toLocaleLowerCase("th").includes(query)),
    [preview.hospitals, query],
  );

  function toggle(hospitalId: string, checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(hospitalId);
      else next.delete(hospitalId);
      return next;
    });
  }

  function setVisible(checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      for (const { id } of visible) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function download(): Promise<void> {
    setConfirming(false);
    setLoading(true);
    setResult(null);
    const outcome = await downloadReportFile(
      networkExportUrl(preview.parent.id, scope, included.map(({ id }) => id), cohort),
      "demi-network-report.xlsx",
    );
    setResult(outcome);
    setLoading(false);
  }

  return (
    <Panel aria-labelledby={`${ids}-title`} className="min-w-0 space-y-5">
      <div className="min-w-0 space-y-1">
        <h2 className="break-words text-lg font-semibold text-text" id={`${ids}-title`}>รายงานเครือข่าย: {preview.parent.name}</h2>
        <p className="text-sm leading-6 text-text-muted">
          ไฟล์ Excel เดียวตามแบบฟอร์มรายงาน แยกแถวตามหน่วยบริการ พร้อมชีตสรุปรายหน่วยบริการ
        </p>
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="type-label mb-2 text-text">ขอบเขตไฟล์</legend>
        {([
          ["ALL", `ทั้งเครือข่าย (แม่ข่าย + ลูกข่าย ${numberFormat(childCount)} แห่ง)`],
          ["SELECTED", "เลือกหน่วยบริการ"],
        ] as const).map(([value, label]) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border px-4 py-2 text-text has-[:checked]:border-action-primary has-[:checked]:bg-brand-soft" key={value}>
            <input checked={scope === value} className="size-5 shrink-0 accent-brand" name={`${ids}-scope`} onChange={() => setScope(value)} type="radio" value={value} />
            <span className="min-w-0 break-words">{label}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-text">
        <input
          checked={cohort === "INCLUDE_ENDED"}
          className="mt-0.5 size-5 shrink-0 accent-brand"
          onChange={(event) => setCohort(event.target.checked ? "INCLUDE_ENDED" : "ACTIVE")}
          type="checkbox"
        />
        <span className="min-w-0">
          รวมผู้ที่สิ้นสุดการดูแล
          <span className="block text-sm text-text-muted">ค่าเริ่มต้นนับเฉพาะผู้ป่วยที่ยังอยู่ในการดูแลของแต่ละหน่วยบริการ</span>
        </span>
      </label>

      {scope === "SELECTED" ? (
        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            <label className="type-label mb-2 block text-text" htmlFor={`${ids}-search`}>ค้นหาหน่วยบริการ</label>
            <Input id={`${ids}-search`} onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อหรือรหัสหน่วยบริการ" type="search" value={search} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={visible.length === 0} onClick={() => setVisible(true)} size="compact" type="button" variant="secondary">
              {query === "" ? "เลือกทั้งหมด" : "เลือกทั้งหมดที่แสดง"}
            </Button>
            <Button disabled={visible.length === 0} onClick={() => setVisible(false)} size="compact" type="button" variant="secondary">
              {query === "" ? "ไม่เลือกเลย" : "ยกเลิกที่แสดง"}
            </Button>
          </div>
          {visible.length === 0 ? (
            <p className="rounded-panel border border-border p-4 text-sm text-text-muted" role="status">ไม่พบหน่วยบริการที่ตรงกับคำค้น</p>
          ) : (
            <ul aria-label="หน่วยบริการที่เลือกได้" className="min-w-0 divide-y divide-border rounded-panel border border-border">
              {visible.map((hospital) => (
                <li key={hospital.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                    <input
                      checked={selected.has(hospital.id)}
                      className="mt-0.5 size-5 shrink-0 accent-brand"
                      onChange={(event) => toggle(hospital.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-semibold text-text">{hospital.name}</span>
                        <StatusBadge variant={hospital.kind === "PARENT" ? "info" : "neutral"}>{hospital.kind === "PARENT" ? "แม่ข่าย" : "ลูกข่าย"}</StatusBadge>
                      </span>
                      <span className="mt-1 block text-sm tabular-nums text-text-muted">
                        รหัส {hospital.hospitalCode} · {numberFormat(hospital.relationships)} เคส · {numberFormat(hospital.programs)} Program
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <dl aria-live="polite" className="grid min-w-0 grid-cols-3 gap-3 rounded-panel bg-surface-muted p-4">
        {([
          ["หน่วยบริการ", `${numberFormat(totals.hospitals)} แห่ง`],
          ["เคส", numberFormat(totals.relationships)],
          ["Program", numberFormat(totals.programs)],
        ] as const).map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>

      {overLimit ? (
        <Alert variant="warning">
          ไฟล์เดียวส่งออกได้ไม่เกิน {numberFormat(preview.maxPrograms)} Program แต่ที่เลือกไว้มี {numberFormat(totals.programs)} Program
          กรุณาเลือกหน่วยบริการให้น้อยลงแล้วส่งออกเป็นหลายไฟล์
        </Alert>
      ) : null}
      {nothingSelected ? <p className="text-sm text-text-muted" role="status">เลือกอย่างน้อยหนึ่งหน่วยบริการเพื่อส่งออก</p> : null}

      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-start">
        <Button disabled={overLimit || nothingSelected} loading={loading} onClick={() => setConfirming(true)} type="button">
          {loading ? "กำลังสร้างไฟล์ Excel" : "ส่งออก Excel เครือข่าย"}
        </Button>
        {result ? (
          <p className={`text-sm ${result.ok ? "text-text-muted" : "text-danger"}`} role={result.ok ? "status" : "alert"}>{result.message}</p>
        ) : null}
      </div>

      <ConfirmDialog
        confirmLabel="ยืนยันและดาวน์โหลด"
        description={NETWORK_EXPORT_CONFIRMATION}
        details={
          <p>
            {numberFormat(totals.hospitals)} หน่วยบริการ · {numberFormat(totals.programs)} Program ·{" "}
            {cohort === "INCLUDE_ENDED" ? "รวมผู้ที่สิ้นสุดการดูแล" : "เฉพาะผู้ที่ยังอยู่ในการดูแล"} ทุกการส่งออกถูกบันทึกไว้
            กรุณาใช้และเก็บไฟล์ตามนโยบายข้อมูลของโรงพยาบาล
          </p>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => void download()}
        open={confirming}
        title="ยืนยันการส่งออกรายงานเครือข่าย"
      />
    </Panel>
  );
}
