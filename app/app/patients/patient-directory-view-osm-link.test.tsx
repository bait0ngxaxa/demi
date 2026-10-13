import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientDirectoryView } from "./patient-directory-view";

const scope = { hospitalId: "11111111-1111-4111-8111-111111111111", hospitalName: "โรงพยาบาล ก" };

function render(canAssignOsm?: boolean): string {
  return renderToStaticMarkup(
    <PatientDirectoryView
      canAssignOsm={canAssignOsm}
      classificationCounts={{ total: 0, risk: 0, diabetes: 0, unclassified: 0 }}
      classificationFilter="ALL"
      errorMessage={null}
      lookupType="NAME"
      result={null}
      scopes={[scope]}
      selectedScope={scope}
      value=""
    />,
  );
}

describe("patient list link to bulk OSM assignment", () => {
  it("links to the bulk page of the selected hospital for an owner", () => {
    const html = render(true);

    expect(html).toContain(`href="/app/patients/assign-osm?hospitalId=${scope.hospitalId}"`);
    expect(html).toContain("กำหนด อสม. ให้ผู้ป่วยหลายคน");
  });

  it("does not show the link by default or when the capability is missing", () => {
    expect(render()).not.toContain("/app/patients/assign-osm");
    expect(render(false)).not.toContain("/app/patients/assign-osm");
  });
});
