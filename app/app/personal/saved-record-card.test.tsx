// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedRecordActions, SavedRecordCard } from "./saved-record-card";

describe("saved record semantics", () => {
  it("names a requested section from its visible heading without a second landmark", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<SavedRecordCard as="section" aria-labelledby="goal-heading">
      <h3 id="goal-heading">เป้าหมายส่วนตัวที่คุณตั้งไว้</h3>
      <SavedRecordActions><button>แก้ไข</button><button>ลบเป้าหมาย</button></SavedRecordActions>
    </SavedRecordCard>);
    const section = host.querySelector("section");
    expect(section?.getAttribute("aria-labelledby")).toBe(host.querySelector("h3")?.id);
    expect(host.querySelectorAll("section, [role=region]")).toHaveLength(1);
    expect(host.querySelector("[aria-label]")).toBeNull();
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["แก้ไข", "ลบเป้าหมาย"]);
  });
  it("preserves native list items and action names without adding per-record landmarks", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<section aria-label="ประวัติ"><h3>รายการที่บันทึกแล้ว</h3>
      <ul aria-label="รายการยา"><SavedRecordCard as="li"><h4>ยาที่จดไว้</h4>
        <SavedRecordActions><a href="?item=1" aria-label="ดูรายละเอียด ยาที่จดไว้">ดูรายละเอียด</a></SavedRecordActions>
      </SavedRecordCard></ul></section>);
    expect(host.querySelectorAll("ul > li")).toHaveLength(1);
    expect(host.querySelector("li")?.getAttribute("role")).toBeNull();
    expect(host.querySelector("li section, li [role=region], li [role=listitem]")).toBeNull();
    expect(host.querySelector("a")?.getAttribute("aria-label")).toBe("ดูรายละเอียด ยาที่จดไว้");
    expect([...host.querySelectorAll("h3, h4")].map((heading) => heading.tagName)).toEqual(["H3", "H4"]);
  });
  it("keeps an unnamed surface generic inside an already named readback", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<section aria-label="ข้อมูลที่บันทึกแล้ว"><SavedRecordCard>บันทึกแล้ว</SavedRecordCard></section>);
    expect(host.querySelectorAll("section")).toHaveLength(1);
    expect(host.querySelector("section > div")?.getAttribute("aria-label")).toBeNull();
    expect(host.querySelector("[role]")).toBeNull();
  });
});
