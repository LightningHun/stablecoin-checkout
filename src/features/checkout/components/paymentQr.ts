import QRCodeEncoder from "qrcode";
import type { CurrencyCode } from "../domain/paymentModel";

/** Render only the encoded address; decoration never adds payment URI fields. */
export function toDataURL(
  value: string,
  options: { currency: CurrencyCode; width?: number },
): string {
  const { modules } = QRCodeEncoder.create(value, {
    errorCorrectionLevel: "H",
  });
  // Keep a generous white margin between the encoded modules and the frame.
  const margin = 5;
  const size = modules.size;
  const extent = size + margin * 2;
  const parts: string[] = [];
  const finderOrigins = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const inFinder = finderOrigins.some(
        ([x, y]) => col >= x && col < x + 7 && row >= y && row < y + 7,
      );
      if (!modules.get(row, col) || inFinder) continue;
      parts.push(
        `<rect x="${col + margin + 0.02}" y="${row + margin + 0.02}" width=".96" height=".96" rx=".18"/>`,
      );
    }
  }

  for (const [col, row] of finderOrigins) {
    const x = col + margin;
    const y = row + margin;
    parts.push(
      `<rect x="${x}" y="${y}" width="7" height="7" rx="1"/>`,
      `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx=".35" fill="#fff"/>`,
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".65"/>`,
    );
  }

  const inset = 2;
  const edge = extent - inset;
  const arm = 3;
  parts.push(
    `<path d="M${inset + arm} ${inset}H${inset}v${arm} M${edge - arm} ${inset}h${arm}v${arm} M${inset} ${edge - arm}v${arm}h${arm} M${edge - arm} ${edge}h${arm}v-${arm}" fill="none" stroke="#c8c8c8" stroke-width=".6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  const width = options.width ?? 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${extent} ${extent}"><rect width="${extent}" height="${extent}" fill="#fff"/><g fill="#0a0a0a">${parts.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
