import sharp from "sharp";

export interface TextPrintSpec {
  content: string;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  color?: string;
  outlined?: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getContrastingOutlineColor(color?: string) {
  const hex = color?.replace("#", "");
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}

/**
 * Generates a clean vector SVG file string for text elements.
 */
export function generateTextSvg(textSpecs: readonly TextPrintSpec[], width = 2400, height = 800): string {
  const textNodes = textSpecs.map((spec, i) => {
    const family = spec.fontFamily || "Inter";
    const weight = spec.fontWeight || 700;
    const style = spec.fontStyle || "normal";
    const fill = spec.color || "#111111";
    const strokeColor = spec.outlined ? getContrastingOutlineColor(spec.color) : "none";
    const strokeWidth = spec.outlined ? 12 : 0;
    const fontSize = textSpecs.length === 1 ? 160 : Math.round(300 / textSpecs.length);
    const yPos = Math.round(height / 2 + (i - (textSpecs.length - 1) / 2) * (fontSize * 1.3));

    return `<text x="50%" y="${yPos}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(family)}, sans-serif" font-weight="${weight}" font-style="${style}" font-size="${fontSize}px" fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round">${escapeXml(spec.content)}</text>`;
  }).join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&amp;family=Montserrat:wght@500;700;800&amp;family=Roboto:wght@400;700&amp;display=swap');
  </style>
  <g>
    ${textNodes}
  </g>
</svg>`;
}

/**
 * Generates a high-resolution (300 DPI) transparent PNG buffer for printing text on DTF/Flex film.
 */
export async function generateTransparentTextPngBuffer(textSpecs: readonly TextPrintSpec[]): Promise<Buffer | null> {
  if (!textSpecs || textSpecs.length === 0) return null;
  try {
    const svgString = generateTextSvg(textSpecs, 3000, 1000);
    return await sharp(Buffer.from(svgString))
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (err) {
    console.error("[TextAssetGenerator] Failed to render transparent PNG:", err);
    return null;
  }
}
