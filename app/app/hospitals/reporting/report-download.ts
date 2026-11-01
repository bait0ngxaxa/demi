/** Outcome of one report download: the success message, or the server's safe message (else a local one). */
export type ReportDownloadResult = { ok: true; message: string } | { ok: false; message: string };

/** Fetch an export endpoint and save its file; the server re-authorizes and audits every request. */
export async function downloadReportFile(url: string, fallbackFilename: string): Promise<ReportDownloadResult> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      let message = "ส่งออกรายงานไม่สำเร็จ กรุณาลองอีกครั้ง";
      try {
        const payload: unknown = await response.json();
        if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
          message = payload.error;
        }
      } catch {
        // Use the safe local message when the response body is not JSON.
      }
      return { ok: false, message };
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition");
    link.href = objectUrl;
    link.download = disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    return { ok: true, message: "สร้างไฟล์ Excel สำเร็จแล้ว" };
  } catch {
    return { ok: false, message: "เชื่อมต่อเพื่อส่งออกรายงานไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองอีกครั้ง" };
  }
}
