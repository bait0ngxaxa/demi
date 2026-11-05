"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useServerSearch } from "@/components/search/use-server-search";
import type { MediatedPasswordResetHospitalOption } from "@/modules/account-security/services/mediated-password-reset-service";
import { searchMediatedPasswordResetHospitalsAction } from "@/modules/account-security/transport/server-actions";
import { HOSPITAL_SEARCH_MAX_LENGTH } from "@/shared/search/hospital-search";

import { MediatedPasswordResetControl } from "../../users/mediated-password-reset-control";

const SEARCH_ERROR = "ไม่สามารถค้นหาโรงพยาบาลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

/**
 * A caregiver has no Hospital of their own, so the platform ADMIN chooses the ACTIVE Hospital the reset is recorded
 * against, from a server search that answers at most ten, before the reset control appears.
 */
export function CaregiverResetHospitalPicker({
  targetUserId,
  targetName,
}: {
  targetUserId: string;
  targetName: string;
}): React.JSX.Element {
  const [hospital, setHospital] = useState<MediatedPasswordResetHospitalOption | null>(null);
  const search = useServerSearch<MediatedPasswordResetHospitalOption>({
    scope: "caregiver-reset-hospital",
    search: (query) => searchMediatedPasswordResetHospitalsAction(query),
    errorMessage: SEARCH_ERROR,
    minLength: 1,
  });
  const results = search.shown?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block space-y-2 text-sm font-semibold text-text">
          <span>โรงพยาบาลที่บันทึกการรีเซ็ต</span>
          <Input
            maxLength={HOSPITAL_SEARCH_MAX_LENGTH}
            onChange={(event) => search.setQuery(event.target.value)}
            placeholder="ค้นหาชื่อหรือรหัสโรงพยาบาล"
            type="search"
            value={search.query}
          />
        </label>
        {search.belowMinimum ? (
          <p className="text-sm text-text-muted">พิมพ์ชื่อหรือรหัสโรงพยาบาลเพื่อค้นหา ระบบแสดงไม่เกิน 10 แห่ง</p>
        ) : !search.answered && results.length === 0 ? (
          <p className="text-sm text-text-muted" role="status">กำลังค้นหาโรงพยาบาล...</p>
        ) : search.shown?.error ? (
          <Alert variant="danger">{search.shown.error}</Alert>
        ) : results.length === 0 ? (
          <p className="text-sm text-text-muted" role="status">ไม่พบโรงพยาบาลที่ใช้งานอยู่ที่ตรงกับคำค้นหา</p>
        ) : (
          <ul aria-label="ผลการค้นหาโรงพยาบาล" className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface" role="radiogroup">
            {results.map((option) => (
              <li key={option.id}>
                <label className="flex items-center gap-3 px-4 py-3 text-sm">
                  <input
                    checked={hospital?.id === option.id}
                    className="size-4 accent-brand-strong"
                    name="caregiver-reset-hospital"
                    onChange={() => setHospital(option)}
                    type="radio"
                    value={option.id}
                  />
                  <span className="min-w-0 flex-1 break-words font-semibold text-text">
                    {option.name} <span className="font-normal text-text-muted">({option.hospitalCode})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hospital ? (
        <MediatedPasswordResetControl
          eligibility="ADMIN_ALLOWED"
          hospitalId={hospital.id}
          hospitalName={hospital.name}
          key={hospital.id}
          relationshipId={null}
          targetKind="caregiver"
          targetName={targetName}
          targetUserId={targetUserId}
        />
      ) : (
        <p className="text-sm text-text-muted">เลือกโรงพยาบาลก่อนออกลิงก์รีเซ็ต</p>
      )}
    </div>
  );
}
