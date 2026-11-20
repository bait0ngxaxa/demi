import { useId } from "react";

import { roundAchieveScore, roundAchieveScoreText, type RoundReport } from "../projections/round-report-projection";

const GUIDELINE_COLUMNS = 6;
const ROUND_HEADERS = [
  "ครั้งบริการ",
  "สถานะ",
  "ทำแล้ว/รายการในแผน",
  "ข้าม",
  "ยังไม่ได้ทำเมื่อจบบริการ",
  "ผู้ป่วยบันทึกเอง",
  "Achieve score",
] as const;

type HeadingLevel = 2 | 3 | 4;

function GuidelineRoundCell({ round }: { round: RoundReport | undefined }): React.JSX.Element {
  if (!round) {
    return (
      <td className="px-3 py-3 align-top">
        <span aria-hidden="true">—</span>
        <span className="sr-only">ยังไม่เปิดครั้งบริการ</span>
      </td>
    );
  }

  return (
    <td className="px-3 py-3 align-top">
      <p className="tabular-nums">ทำแล้ว {round.doneItems}/{round.plannedItems}</p>
      {round.skippedItems > 0 ? <p className="tabular-nums">ข้าม {round.skippedItems}</p> : null}
      {round.notDoneAtCloseItems > 0 ? <p className="tabular-nums">ยังไม่ได้ทำเมื่อจบบริการ {round.notDoneAtCloseItems}</p> : null}
      {round.patientRecordedItems > 0 ? <p className="tabular-nums">ผู้ป่วยบันทึกเอง {round.patientRecordedItems}</p> : null}
      <p>Achieve score: {roundAchieveScoreText(roundAchieveScore(round))}</p>
    </td>
  );
}

function RoundRowsTable({ rounds }: { rounds: readonly RoundReport[] }): React.JSX.Element {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border">
        <tr>
          {ROUND_HEADERS.map((label) => (
            <th className="px-3 py-3 align-top font-semibold text-text" scope="col" key={label}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => (
          <tr className="border-b border-border" key={round.roundNumber}>
            <th scope="row" className="px-3 py-3 font-medium">
              {round.title}
            </th>
            <td className="px-3 py-3">{round.completed ? "จบบริการแล้ว" : "ยังไม่จบบริการ"}</td>
            <td className="px-3 py-3 tabular-nums">
              {round.doneItems}/{round.plannedItems}
            </td>
            <td className="px-3 py-3 tabular-nums">{round.skippedItems}</td>
            <td className="px-3 py-3 tabular-nums">{round.notDoneAtCloseItems}</td>
            <td className="px-3 py-3 tabular-nums">{round.patientRecordedItems}</td>
            <td className="px-3 py-3">{roundAchieveScoreText(roundAchieveScore(round))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RoundReportTable({
  rounds,
  extraRoundsCompleted,
  fixedColumns = false,
  headingLevel = 3,
}: {
  rounds: readonly RoundReport[];
  extraRoundsCompleted: number;
  fixedColumns?: boolean;
  headingLevel?: HeadingLevel;
}): React.JSX.Element {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  // Fixed columns show rounds 1-6 as columns; only rounds beyond them need the row table.
  const rowRounds = fixedColumns ? rounds.filter((round) => round.roundNumber > GUIDELINE_COLUMNS) : rounds;
  const showsScrollRegion = fixedColumns || rowRounds.length > 0;

  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <Heading className="font-semibold text-text" id={headingId}>ผลการจัดบริการรายครั้ง</Heading>
      {showsScrollRegion ? (
        <div
          className="space-y-4 overflow-x-auto rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          tabIndex={0}
          role="region"
          aria-label="ตารางผลการจัดบริการรายครั้ง"
        >
          {fixedColumns ? (
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  {Array.from({ length: GUIDELINE_COLUMNS }, (_, index) => (
                    <th className="px-3 py-3 font-semibold" scope="col" key={index}>
                      ครั้งที่ {index + 1}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 font-semibold">
                    ครั้งเพิ่มเติม (จำนวน)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Array.from({ length: GUIDELINE_COLUMNS }, (_, index) => (
                    <GuidelineRoundCell key={index} round={rounds.find((item) => item.roundNumber === index + 1)} />
                  ))}
                  <td className="px-3 py-3 align-top tabular-nums">{extraRoundsCompleted}</td>
                </tr>
              </tbody>
            </table>
          ) : null}
          {rowRounds.length > 0 ? <RoundRowsTable rounds={rowRounds} /> : null}
        </div>
      ) : (
        <p className="text-sm text-text-muted">ยังไม่มีครั้งบริการที่เปิดไว้</p>
      )}
    </section>
  );
}
