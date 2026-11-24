import { createBrandedQrSymbol, readBrandedQrMargin } from "@/lib/qr/branded-qr";
import { DEMI_QR_LOGO_PNG_BASE64 } from "@/lib/qr/demi-qr-logo";

/**
 * Browser only: draws the branded QR straight onto a canvas and returns a PNG data URL. Use it only where a
 * file is handed to the user (download/share), because chat apps such as LINE preview PNG but not SVG.
 *
 * The modules and the logo are drawn separately instead of rasterizing the SVG: some WebKit versions draw an
 * SVG before its nested <image> has loaded (the PNG loses the logo) or refuse to export a canvas an SVG was
 * drawn on. A plain PNG data URI has neither problem.
 */
export async function createBrandedQrPngDataUrl(
  text: string,
  options: { size: number; margin?: number },
): Promise<string> {
  const { size } = options;
  if (!Number.isInteger(size) || size <= 0) throw new Error("QR PNG size must be a positive integer");
  const margin = readBrandedQrMargin(options);
  const symbol = createBrandedQrSymbol(text);
  const { moduleCount, logo } = symbol.layout;

  const logoImage = new Image();
  logoImage.src = `data:image/png;base64,${DEMI_QR_LOGO_PNG_BASE64}`;
  await logoImage.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  const scale = size / (moduleCount + margin * 2);
  // Whole-pixel module edges keep the code sharp when the size is not a multiple of the module count.
  const edge = (modules: number): number => Math.round((modules + margin) * scale);

  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000";
  for (let row = 0; row < moduleCount; row += 1) {
    let column = 0;
    while (column < moduleCount) {
      if (!symbol.isDark(row, column)) {
        column += 1;
        continue;
      }
      const runStart = column;
      while (column < moduleCount && symbol.isDark(row, column)) column += 1;
      context.fillRect(edge(runStart), edge(row), edge(column) - edge(runStart), edge(row + 1) - edge(row));
    }
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(logoImage, edge(logo.start), edge(logo.start), edge(logo.start + logo.side) - edge(logo.start), edge(logo.start + logo.side) - edge(logo.start));
  return canvas.toDataURL("image/png");
}
