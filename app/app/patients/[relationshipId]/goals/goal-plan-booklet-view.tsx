import { Panel } from "@/components/ui/panel";
import { BOOKLET_PLAN_TEXT } from "@/modules/goals/domain/goal-templates";
import { getGoalTargetUnitLabel } from "@/modules/goals/presentation/goal-labels";
import type { GoalPlanDetail } from "@/modules/goals/services/goal-query-service";

type Booklet = NonNullable<GoalPlanDetail["booklet"]>;

function formatServiceDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function goalLines(booklet: Booklet): string[] {
  const { goals } = booklet;
  const numeric: [number | null, readonly [string, string]][] = [
    [goals.weightLossKg, BOOKLET_PLAN_TEXT.weightLoss],
    [goals.waistCm, BOOKLET_PLAN_TEXT.waist],
    [goals.bloodSugarMgDl, BOOKLET_PLAN_TEXT.bloodSugar],
    [goals.hba1cPercent, BOOKLET_PLAN_TEXT.hba1c],
  ];

  return [
    ...numeric.flatMap(([value, [before, after]]) => (value === null ? [] : [`${before} ${value} ${after}`])),
    ...(goals.customText ? [`${BOOKLET_PLAN_TEXT.custom} ${goals.customText}`] : []),
  ];
}

/** R2-E: แผน "สุขภาพดี" ของฉัน, read only, in booklet order. */
export function GoalPlanBookletView({
  booklet,
  items,
}: {
  booklet: Booklet;
  items: GoalPlanDetail["items"];
}): React.JSX.Element {
  const sections = [
    { key: "food", label: BOOKLET_PLAN_TEXT.food, category: "FOOD", value: booklet.food },
    { key: "exercise", label: BOOKLET_PLAN_TEXT.exercise, category: "EXERCISE", value: booklet.exercise },
  ] as const;

  return (
    <>
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{BOOKLET_PLAN_TEXT.goalsHeading}</h2>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-text">
          {goalLines(booklet).map((line) => (
            <li className="flex gap-2" key={line}>
              <span aria-hidden="true">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{BOOKLET_PLAN_TEXT.planHeading}</h2>
        <div className="mt-5 divide-y divide-border border-y border-border">
          {sections.map(({ key, label, category, value }) => {
            const sectionItems = items.filter((item) => item.activityCategory === category);

            return (
              <section className="py-5" key={key}>
                <h3 className="font-semibold text-text">{label}</h3>
                {value.notSet ? (
                  <p className="mt-2 text-sm text-text-muted">{BOOKLET_PLAN_TEXT.sectionNotSet}</p>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
                      {BOOKLET_PLAN_TEXT.sectionText} {value.planText}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      {BOOKLET_PLAN_TEXT.sectionStart} {value.startDate ? formatServiceDate(value.startDate) : "ไม่ได้ระบุ"}
                    </p>
                    <ul className="mt-3 space-y-2" aria-label={`กิจกรรม: ${label}`}>
                      {sectionItems.map((item) => (
                        <li className="flex flex-wrap justify-between gap-2 text-sm" key={item.goalPlanItemId}>
                          <span className="font-semibold text-text">{item.activityLabel}</span>
                          <span className="text-text-muted">
                            {item.targetDays} วัน/สัปดาห์
                            {item.targetValue !== null && item.targetUnit
                              ? ` · ${item.targetValue} ${getGoalTargetUnitLabel(item.targetUnit)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-sm text-text-muted">{BOOKLET_PLAN_TEXT.problemsAfterOneMonth}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
              {booklet.problemsAfterOneMonth ?? "ไม่ได้ระบุ"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">
              {BOOKLET_PLAN_TEXT.patientSignature[0]} … {BOOKLET_PLAN_TEXT.patientSignature[1]}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text">{booklet.patientSignatureName ?? "ไม่ได้ระบุ"}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">
              {BOOKLET_PLAN_TEXT.witnessSignature[0]} … {BOOKLET_PLAN_TEXT.witnessSignature[1]}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text">{booklet.witnessSignatureName ?? "ไม่ได้ระบุ"}</dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
