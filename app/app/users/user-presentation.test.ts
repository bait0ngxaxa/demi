import { MembershipStatus, Role, UserStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { roleLabels } from "@/components/app-shell/actor-presentation";

import {
  hospitalRelationshipStatusPresentation,
  USER_ACCOUNT_STATUS_PRESENTATION,
  USER_KIND_LABELS,
} from "./user-presentation";

describe("Thai role and status labels", () => {
  it("distinguishes platform administration from hospital administration and staff", () => {
    expect(roleLabels[Role.ADMIN]).toBe("ผู้ดูแลระบบ DEMI");
    expect(USER_KIND_LABELS.staff).toBe("เจ้าหน้าที่โรงพยาบาล");
    expect(roleLabels[Role.ADMIN]).not.toBe("แอดมินโรงพยาบาล");
    expect(USER_KIND_LABELS.osm).toBe("อสม.");
    expect(USER_KIND_LABELS.patient).toBe("ผู้ป่วย");
  });

  it("labels account suspension separately from hospital permission suspension", () => {
    expect(USER_ACCOUNT_STATUS_PRESENTATION[UserStatus.SUSPENDED].label).toBe("บัญชีถูกระงับ");
    expect(hospitalRelationshipStatusPresentation("staff", MembershipStatus.SUSPENDED).label)
      .toBe("พักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้ชั่วคราว");
    expect(hospitalRelationshipStatusPresentation("osm", MembershipStatus.SUSPENDED).label)
      .toBe("พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราว");
  });

  it("describes patient care termination without implying account deletion", () => {
    expect(hospitalRelationshipStatusPresentation("patient", MembershipStatus.ENDED).label)
      .toBe("สิ้นสุดการดูแลที่โรงพยาบาลนี้");
  });
});
