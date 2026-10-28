import type { RoundReport } from "../projections/round-report-projection";

export function RoundReportTable({ rounds, extraRoundsCompleted, fixedColumns = false }: { rounds: readonly RoundReport[]; extraRoundsCompleted: number; fixedColumns?: boolean }): React.JSX.Element {
  return <section className="mt-4 space-y-3" aria-label="รายการในแผนรายครั้ง">
    <h3 className="font-semibold text-text">ครั้งเพิ่มเติม (จำนวน): {extraRoundsCompleted}</h3>
    <div className="overflow-x-auto rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" tabIndex={0} role="region" aria-label="ตารางรายการในแผนรายครั้ง">
      {fixedColumns ? <table className="w-full text-left text-sm">
        <thead><tr>{Array.from({ length: 6 }, (_, index) => <th className="px-3 py-3 font-semibold" scope="col" key={index}>ครั้งที่ {index + 1}</th>)}<th scope="col" className="px-3 py-3 font-semibold">ครั้งเพิ่มเติม (จำนวน)</th></tr></thead>
        <tbody><tr>{Array.from({ length: 6 }, (_, index) => {
          const round = rounds.find((item) => item.roundNumber === index + 1);
          return <td className="px-3 py-3 align-top" key={index}>{round ? <><p>ทำแล้ว {round.doneItems}/{round.plannedItems} รายการในแผน</p><p>ข้าม {round.skippedItems}</p><p>ยังไม่ได้ทำเมื่อจบบริการ {round.notDoneAtCloseItems}</p><p>ผู้ป่วยบันทึกเอง {round.patientRecordedItems}</p></> : "ยังไม่เปิดครั้งบริการ"}</td>;
        })}<td className="px-3 py-3 align-top tabular-nums">{extraRoundsCompleted}</td></tr></tbody>
      </table> : null}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border"><tr>{["ครั้งบริการ", "สถานะ", "ทำแล้ว/รายการในแผน", "ข้าม", "ยังไม่ได้ทำเมื่อจบบริการ", "ผู้ป่วยบันทึกเอง"].map((label) => <th className="px-3 py-3 align-top font-semibold text-text" scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rounds.filter((round) => !fixedColumns || round.roundNumber >= 7).map((round) => <tr className="border-b border-border" key={round.roundNumber}>
          <th scope="row" className="px-3 py-3 font-medium">{round.title}</th><td className="px-3 py-3">{round.completed ? "จบบริการแล้ว" : "ยังไม่จบบริการ"}</td>
          <td className="px-3 py-3 tabular-nums">{round.doneItems}/{round.plannedItems}</td><td className="px-3 py-3 tabular-nums">{round.skippedItems}</td><td className="px-3 py-3 tabular-nums">{round.notDoneAtCloseItems}</td><td className="px-3 py-3 tabular-nums">{round.patientRecordedItems}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {rounds.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีครั้งบริการที่เปิดไว้</p> : null}
  </section>;
}
