import { createBrandedQrSvgDataUrl } from "@/lib/qr/branded-qr";

/**
 * Browser only: rasterizes the branded QR to a PNG data URL. Use it only where a file is handed to the
 * user (download/share), because chat apps such as LINE preview PNG images but not SVG.
 */
export async function createBrandedQrPngDataUrl(text: string, options: { size: number }): Promise<string> {
  const { size } = options;
  if (!Number.isInteger(size) || size <= 0) throw new Error("QR PNG size must be a positive integer");

  const image = new Image(size, size);
  image.src = createBrandedQrSvgDataUrl(text, { size });
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}
