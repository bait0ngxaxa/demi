"use client";

import { useId, useState } from "react";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { useServerSearch } from "@/components/search/use-server-search";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import type { HospitalNetworkFacilitySummary } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { HOSPITAL_SEARCH_MAX_LENGTH, HOSPITAL_SEARCH_RESULT_LIMIT } from "@/shared/search/hospital-search";
import {
  searchTransferTargetsAction,
  transferServiceAreaAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

const SEARCH_ERROR = "ไม่สามารถค้นหาแม่ข่ายได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

/**
 * Transfer a Child to another Parent. The candidates are searched on the server (at most 10 by name or code), so the
 * page never ships the whole Parent registry; the transfer itself re-checks the target's eligibility.
 */
export function TransferServiceAreaForm({
  areaId,
  hospitalId,
}: {
  areaId: string;
  /** The Child Hospital being transferred. */
  hospitalId: string;
}): React.JSX.Element {
  const [selected, setSelected] = useState<HospitalNetworkFacilitySummary | null>(null);
  const searchFormId = `${useId()}-transfer-search`;
  const search = useServerSearch<HospitalNetworkFacilitySummary>({
    scope: hospitalId,
    search: (query) => searchTransferTargetsAction(hospitalId, query),
    errorMessage: SEARCH_ERROR,
  });
  const { shown, answered } = search;
  const results = shown?.items ?? [];

  return (
    <NetworkMutationForm
      action={transferServiceAreaAction}
      className="mt-3"
      confirmation={{
        title: "โอนลูกข่ายไปแม่ข่ายใหม่หรือไม่",
        description: selected
          ? `ลูกข่ายจะย้ายไปอยู่กับ ${selected.name} แม่ข่ายเดิมจะหมดสิทธิ์ดูผู้ป่วยและรายงานของลูกข่ายนี้ทันที และแม่ข่ายใหม่จะเริ่มมีสิทธิ์ ประวัติเดิมยังคงอยู่`
          : "แม่ข่ายเดิมจะหมดสิทธิ์ดูผู้ป่วยและรายงานของลูกข่ายนี้ทันที และแม่ข่ายใหม่จะเริ่มมีสิทธิ์ ประวัติเดิมยังคงอยู่",
        confirmLabel: "โอนย้าย",
      }}
      hidden={{ areaId, confirm: "true", toParentHospitalId: selected?.id ?? "" }}
      submitDisabled={selected === null}
      submitLabel="โอนย้าย"
    >
      <label className="block text-sm font-semibold text-text">
        ค้นหาแม่ข่ายปลายทาง (ชื่อหรือรหัส)
        <Input
          className="mt-2"
          // Its own form, so Enter searches instead of submitting the transfer.
          form={searchFormId}
          maxLength={HOSPITAL_SEARCH_MAX_LENGTH}
          onChange={(event) => search.setQuery(event.target.value)}
          type="search"
          value={search.query}
        />
      </label>
      <p aria-live="polite" className="mt-2 text-sm" role="status">
        {selected ? (
          <>แม่ข่ายปลายทาง: <span className="font-semibold">{selected.name} ({selected.hospitalCode})</span></>
        ) : (
          <span className="text-text-muted">ยังไม่ได้เลือกแม่ข่ายปลายทาง</span>
        )}
      </p>
      <div aria-busy={!answered} className="mb-3 mt-2">
        {!shown ? (
          <p className="text-sm text-text-muted" role="status">กำลังค้นหาแม่ข่าย...</p>
        ) : shown.error && results.length === 0 ? (
          <Alert variant="danger">
            <p>{shown.error}</p>
            <Button className="mt-3" disabled={!answered} onClick={search.retry} size="compact" type="button" variant="secondary">
              ลองอีกครั้ง
            </Button>
          </Alert>
        ) : results.length === 0 ? (
          <p className="text-sm text-text-muted">
            {search.trimmedQuery ? "ไม่พบแม่ข่ายที่ใช้งานอยู่ที่ตรงกับคำค้นหา" : "ยังไม่มีแม่ข่ายอื่นที่ใช้งานอยู่"}
          </p>
        ) : (
          <>
            <ul
              aria-label="แม่ข่ายที่ค้นพบ"
              className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface"
              role="radiogroup"
            >
              {results.map((target) => (
                <li key={target.id}>
                  <label className="flex items-center gap-3 px-4 py-3 text-sm">
                    <input
                      checked={selected?.id === target.id}
                      className="size-4 accent-brand-strong"
                      form={searchFormId}
                      name="transfer-target"
                      onChange={() => setSelected(target)}
                      type="radio"
                      value={target.id}
                    />
                    <span className="min-w-0 flex-1 break-words font-semibold text-text">
                      {target.name} <span className="font-normal text-text-muted">({target.hospitalCode})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {results.length >= HOSPITAL_SEARCH_RESULT_LIMIT ? (
              <p className="mt-2 text-xs leading-5 text-text-muted">แสดง 10 แห่งแรกที่ตรงกัน พิมพ์ชื่อหรือรหัสให้ละเอียดขึ้นเพื่อหาแห่งอื่น</p>
            ) : null}
          </>
        )}
      </div>
      <label className="text-sm font-semibold text-text" htmlFor="transfer-reason">เหตุผล</label>
      <textarea className={`${inputClassName} mt-2 min-h-20 py-3`} id="transfer-reason" maxLength={500} name="reason" required />
    </NetworkMutationForm>
  );
}
