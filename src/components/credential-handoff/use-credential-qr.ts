"use client";

import { useEffect, useState } from "react";

import { createBrandedQrSvgDataUrl } from "@/lib/qr/branded-qr";
import { createBrandedQrPngDataUrl } from "@/lib/qr/branded-qr-png.client";

const pngDataUrlPrefix = "data:image/png;base64,";
// The saved/shared file is larger than the on-screen code so it stays sharp when forwarded in chat apps.
const qrFileSize = 720;

/** The PNG file that is saved or shared. `shareFile` is null when the browser cannot share files. */
export type CredentialQrFile = { dataUrl: string; shareFile: File | null };

/**
 * `displayUrl` is the on-screen SVG and does not depend on the PNG: if the browser cannot produce the file
 * (`file: "ERROR"`), the code can still be scanned from the screen and only save/share are unavailable.
 */
export type CredentialQr =
  | { status: "LOADING" }
  | { status: "ERROR" }
  | { status: "READY"; displayUrl: string; file: CredentialQrFile | "ERROR" | null };

export type CredentialQrOptions = { fileName: string; displaySize: number };

const loading: CredentialQr = { status: "LOADING" };

/** Checks the generated PNG and wraps it as a shareable file when the browser can share files. */
export function prepareCredentialQrFile(dataUrl: string, fileName: string): CredentialQrFile {
  if (!dataUrl.startsWith(pngDataUrlPrefix)) throw new Error("Expected a QR PNG data URL");
  const bytes = atob(dataUrl.slice(pngDataUrlPrefix.length));
  if (!bytes.startsWith("\x89PNG\r\n\x1a\n")) throw new Error("Expected a QR PNG signature");
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return { dataUrl, shareFile: null };
  }

  try {
    const file = new File([Uint8Array.from(bytes, (byte) => byte.charCodeAt(0))], fileName, { type: "image/png" });
    return { dataUrl, shareFile: navigator.canShare({ files: [file] }) ? file : null };
  } catch {
    return { dataUrl, shareFile: null };
  }
}

/**
 * The branded QR for a one-time credential URL. The on-screen SVG comes first; the PNG file is best effort.
 * Results are keyed by URL, so a QR for a previous link is never returned for a new one.
 */
export function useCredentialQr(url: string, { fileName, displaySize }: CredentialQrOptions): CredentialQr {
  const [entry, setEntry] = useState<{ key: string; qr: CredentialQr } | null>(null);
  const key = `${displaySize}\n${fileName}\n${url}`;

  useEffect(() => {
    let active = true;
    // Generated after the effect returns, so state is only set asynchronously and a stale run can be ignored.
    void Promise.resolve()
      .then(() => createBrandedQrSvgDataUrl(url, { margin: 2, size: displaySize }))
      .then(async (displayUrl) => {
        if (!active) return;
        setEntry({ key, qr: { status: "READY", displayUrl, file: null } });
        const file = await createBrandedQrPngDataUrl(url, { size: qrFileSize })
          .then((dataUrl) => prepareCredentialQrFile(dataUrl, fileName))
          .catch((): "ERROR" => "ERROR");
        if (active) setEntry({ key, qr: { status: "READY", displayUrl, file } });
      })
      .catch(() => {
        if (active) setEntry({ key, qr: { status: "ERROR" } });
      });
    return () => {
      active = false;
    };
  }, [displaySize, fileName, key, url]);

  return entry?.key === key ? entry.qr : loading;
}
