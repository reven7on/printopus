import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp, { type OverlayOptions } from "sharp";

type PrintView = "front" | "back" | "sleeve_left" | "sleeve_right";

import { type TextPrintSpec, type ShapePrintSpec } from "./text-asset-generator";
import { GRAPHIC_SHAPES_SVG } from "./graphic-shapes";

const colorKeysByLabel: Record<string, string> = {
  "Белый": "white", "Натуральный": "natural", "Чёрный": "black", "Хаки / Олива": "khaki", "Меланж": "grey",
  "Тёмно-серый": "darkgrey", "Тёмно-синий": "navy", "Синий": "blue", "Красный": "red", "Бордовый": "burgundy", "Зелёный": "green", "Песочный": "sand",
};

const printZones: Record<string, Partial<Record<PrintView, { canvas: number; x: number; y: number; width: number; height: number }>>> = {
  shirt: { front: { canvas: 799.101, x: 231.169, y: 122.719, width: 331, height: 399 }, back: { canvas: 759.829, x: 219.808, y: 81.41, width: 314, height: 379 }, sleeve_right: { canvas: 317.5, x: 94.116, y: 149.679, width: 97, height: 109 }, sleeve_left: { canvas: 317.5, x: 121.33, y: 149.679, width: 96, height: 109 } },
  hoodie: { front: { canvas: 833.763, x: 241.196, y: 196.53, width: 348, height: 297 }, back: { canvas: 897.98, x: 272.602, y: 214.874, width: 355, height: 445 }, sleeve_right: { canvas: 797.309, x: 338.857, y: 165.157, width: 93, height: 373 }, sleeve_left: { canvas: 797.309, x: 361.637, y: 165.157, width: 93, height: 373 } },
  polo: { front: { canvas: 856.902, x: 254.214, y: 147.102, width: 349, height: 457 }, back: { canvas: 855.939, x: 253.929, y: 109.846, width: 348, height: 457 }, sleeve_right: { canvas: 375.502, x: 120.697, y: 185.069, width: 95, height: 95 }, sleeve_left: { canvas: 375.508, x: 158.965, y: 184.938, width: 95, height: 95 } },
  cap: { front: { canvas: 309.621, x: 91.781, y: 139.33, width: 127, height: 50 }, sleeve_right: { canvas: 309.621, x: 144.859, y: 138.224, width: 65, height: 50 }, sleeve_left: { canvas: 309.621, x: 99.521, y: 138.224, width: 65, height: 50 } },
  bag: { front: { canvas: 747.844, x: 248.391, y: 355.226, width: 251, height: 299 }, back: { canvas: 747.844, x: 248.391, y: 355.226, width: 251, height: 299 } },
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveMockupFilePath(productSlug: string, color: string, view: PrintView): string | null {
  const folder = productSlug === "shirt" ? "tshirt" : productSlug;
  const viewSlug = view === "back" ? "back" : view === "sleeve_left" ? "sleeve-left" : view === "sleeve_right" ? "sleeve-right" : "front";
  const normalizedColor = colorKeysByLabel[color] ?? color.toLowerCase();
  const filename = `${folder}-${normalizedColor}-${viewSlug}.png`;
  return path.join(process.cwd(), "public", "mockups", "spreadshirt", folder, filename);
}



/**
 * Server-side composite mockup generator matching the Admin Panel preview design.
 * Draws the base garment image + red dashed print zone boundary + artwork image AND/OR text/shape elements.
 */
export async function generateServerMockupBuffer(args: {
  productSlug: string;
  colorLabelOrKey: string;
  view: PrintView;
  artworkBuffer?: Buffer | null;
  textElements?: readonly TextPrintSpec[] | null;
  shapeElements?: readonly ShapePrintSpec[] | null;
}): Promise<Buffer | null> {
  const { productSlug, colorLabelOrKey, view, artworkBuffer, textElements, shapeElements } = args;
  const mockupPath = resolveMockupFilePath(productSlug, colorLabelOrKey, view);
  if (!mockupPath) return null;

  try {
    const baseImageBuffer = await readFile(mockupPath);
    const baseSharp = sharp(baseImageBuffer);
    const meta = await baseSharp.metadata();
    const width = meta.width ?? 600;
    const height = meta.height ?? 600;

    const zone = printZones[productSlug]?.[view];
    const composites: OverlayOptions[] = [];

    if (zone) {
      const zx = Math.round((zone.x / zone.canvas) * width);
      const zy = Math.round((zone.y / zone.canvas) * height);
      const zw = Math.round((zone.width / zone.canvas) * width);
      const zh = Math.round((zone.height / zone.canvas) * height);

      // 1. If artwork buffer is provided, resize and center inside zone
      if (artworkBuffer && artworkBuffer.length > 0) {
        try {
          const resizedArtwork = await sharp(artworkBuffer)
            .resize(zw, zh, { fit: "inside" })
            .toBuffer({ resolveWithObject: true });

          const left = zx + Math.round((zw - resizedArtwork.info.width) / 2);
          const top = zy + Math.round((zh - resizedArtwork.info.height) / 2);

          composites.push({
            input: resizedArtwork.data,
            left: Math.max(0, left),
            top: Math.max(0, top),
          });
        } catch (err) {
          console.warn("[ServerMockup] Failed to process artwork buffer:", err);
        }
      }

      // 2. Render text elements inside print zone box if present
      let svgTextNodes = "";
      if (textElements && textElements.length > 0) {
        svgTextNodes = textElements.map((spec, i) => {
          const family = spec.fontFamily || "Inter";
          const weight = spec.fontWeight || 700;
          const style = spec.fontStyle || "normal";
          const fill = spec.color || "#d71920";
          const fontSize = Math.min(34, Math.max(16, Math.round(zw / (spec.content.length * 0.75))));
          const textY = Math.round(zy + zh / 2 + (i - (textElements.length - 1) / 2) * (fontSize * 1.25));
          const textX = Math.round(zx + zw / 2);

          return `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(family)}, sans-serif" font-weight="${weight}" font-style="${style}" font-size="${fontSize}px" fill="${fill}">${escapeXml(spec.content)}</text>`;
        }).join("\n");
      }

      // 2. Render shape elements inside print zone box if present
      let svgShapeNodes = "";
      if (shapeElements && shapeElements.length > 0) {
        svgShapeNodes = shapeElements.map((shape) => {
          const shapeSvg = GRAPHIC_SHAPES_SVG[shape.content] ?? GRAPHIC_SHAPES_SVG.star;
          const color = shape.color || "#eab308";
          const shapeW = Math.round(zw * ((shape.width ?? 45) / 100));
          const shapeH = shapeW;
          const shapeX = Math.round(zx + zw * ((shape.x ?? 50) / 100) - shapeW / 2);
          const shapeY = Math.round(zy + zh * ((shape.y ?? 50) / 100) - shapeH / 2);

          return `<g transform="translate(${shapeX}, ${shapeY}) scale(${shapeW / 100})" fill="${color}">${shapeSvg}</g>`;
        }).join("\n");
      }

      // 3. Draw red dashed print zone border SVG + text and shape nodes
      const svgOverlay = Buffer.from(
        `<svg width="${width}" height="${height}">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800&amp;family=Montserrat:wght@700;800&amp;family=Roboto:wght@700&amp;display=swap');
          </style>
          <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="none" stroke="#e02424" stroke-width="2" stroke-dasharray="6,4" />
          ${svgShapeNodes}
          ${svgTextNodes}
        </svg>`,
      );

      composites.push({
        input: svgOverlay,
        left: 0,
        top: 0,
      });
    }

    if (composites.length > 0) {
      return await baseSharp.composite(composites).png().toBuffer();
    }

    return baseImageBuffer;
  } catch (error) {
    console.error("[ServerMockup] Error generating server mockup:", error);
    return null;
  }
}
