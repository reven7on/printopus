import sharp from "sharp";
import { GRAPHIC_SHAPES_SVG } from "./graphic-shapes.ts";
import { layoutTextGlyphs } from "./text-curve-layout.ts";

export interface TextPrintSpec {
  content: string;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  color?: string;
  outlined?: boolean;
}

export interface ShapePrintSpec {
  content: string; // shape ID e.g. "star", "heart", "crown"
  color?: string;
  x?: number;
  y?: number;
  width?: number;
}

export interface CombinedPrintElement {
  id: string;
  uploadId?: string;
  type: "image" | "text" | "shape";
  content?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  aspectRatio?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  outlined?: boolean;
  curve?: number;
}

export interface CombinedPrintAsset {
  uploadId: string;
  mimeType: string;
  buffer: Buffer | Uint8Array;
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

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function renderCombinedElement(
  element: CombinedPrintElement,
  canvasWidth: number,
  canvasHeight: number,
  assets: ReadonlyMap<string, CombinedPrintAsset>,
): string {
  const centerX = canvasWidth * (finiteNumber(element.x, 50) / 100);
  const centerY = canvasHeight * (finiteNumber(element.y, 50) / 100);
  const scale = finiteNumber(element.scale, 1);
  const rotation = finiteNumber(element.rotation, 0);
  const elementWidth = canvasWidth * (finiteNumber(element.width, 40) / 100) * scale;
  const transform = `translate(${centerX} ${centerY}) rotate(${rotation})`;

  if (element.type === "image" && element.uploadId) {
    const asset = assets.get(element.uploadId);
    if (!asset) return "";
    const aspectRatio = Math.max(0.01, finiteNumber(element.aspectRatio, 1));
    const elementHeight = elementWidth / aspectRatio;
    const dataUrl = `data:${asset.mimeType};base64,${Buffer.from(asset.buffer).toString("base64")}`;
    return `<g transform="${transform}"><image href="${dataUrl}" x="${-elementWidth / 2}" y="${-elementHeight / 2}" width="${elementWidth}" height="${elementHeight}" preserveAspectRatio="xMidYMid meet" /></g>`;
  }

  if (element.type === "shape" && element.content) {
    const shapeSvg = GRAPHIC_SHAPES_SVG[element.content] ?? GRAPHIC_SHAPES_SVG.star;
    const color = element.color || "#111111";
    return `<g transform="${transform} translate(${-elementWidth / 2} ${-elementWidth / 2}) scale(${elementWidth / 100})" fill="${color}">${shapeSvg}</g>`;
  }

  if (element.type === "text" && element.content) {
    const content = escapeXml(element.content);
    const family = escapeXml(element.fontFamily || "Inter");
    const weight = element.fontWeight || 700;
    const style = element.fontStyle || "normal";
    const fill = element.color || "#111111";
    const baseFontAt600 = element.content.length > 17 ? 22 : element.content.length > 11 ? 28 : 34;
    const fontSize = Math.max(24, baseFontAt600 * (canvasWidth / 600) * scale);
    const letterSpacing = finiteNumber(element.letterSpacing, 0) * (canvasWidth / 600);
    const stroke = element.outlined ? getContrastingOutlineColor(element.color) : "none";
    const strokeWidth = element.outlined ? Math.max(2, fontSize * 0.08) : 0;
    const common = `font-family="${family}, sans-serif" font-weight="${weight}" font-style="${style}" font-size="${fontSize}" letter-spacing="${letterSpacing}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"`;
    const curve = finiteNumber(element.curve, 0);
    if (curve !== 0) {
      const characters = Array.from(element.content);
      const advances = characters.map((character) => (
        (character.trim() ? fontSize * 0.6 : fontSize * 0.34) + letterSpacing
      ));
      const glyphs = layoutTextGlyphs({ content: element.content, pathWidth: elementWidth, curve, advances });
      const glyphNodes = glyphs.map((glyph) => (
        `<text transform="translate(${glyph.x} ${glyph.y}) rotate(${glyph.angle})" text-anchor="middle" dominant-baseline="middle" ${common}>${escapeXml(glyph.character)}</text>`
      )).join("");
      return `<g transform="${transform}">${glyphNodes}</g>`;
    }
    return `<g transform="${transform}"><text x="0" y="0" text-anchor="middle" dominant-baseline="middle" ${common}>${content}</text></g>`;
  }

  return "";
}

/**
 * Flattens every image, text and vector shape for one print view into a single
 * transparent PNG at the selected physical print size and 300 DPI.
 */
export async function generateCombinedPrintPngBuffer(args: {
  elements: readonly CombinedPrintElement[];
  assets: readonly CombinedPrintAsset[];
  widthCm: number;
  heightCm: number;
}): Promise<Buffer | null> {
  if (args.elements.length === 0) return null;
  const widthCm = Math.max(1, Math.min(60, finiteNumber(args.widthCm, 21)));
  const heightCm = Math.max(1, Math.min(60, finiteNumber(args.heightCm, 29.7)));
  const canvasWidth = Math.round((widthCm / 2.54) * 300);
  const canvasHeight = Math.round((heightCm / 2.54) * 300);
  const assets = new Map(args.assets.map((asset) => [asset.uploadId, asset]));
  const nodes = args.elements
    .map((element) => renderCombinedElement(element, canvasWidth, canvasHeight, assets))
    .join("\n");
  if (!nodes.trim()) return null;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">${nodes}</svg>`;
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toBuffer();
}

/**
 * Generates a clean vector SVG file string for text and graphic shape elements.
 */
export function generateVectorGraphicsSvg(
  textSpecs: readonly TextPrintSpec[] = [],
  shapeSpecs: readonly ShapePrintSpec[] = [],
  width = 2400,
  height = 1200,
): string {
  const shapeNodes = shapeSpecs.map((spec, i) => {
    const shapeSvg = GRAPHIC_SHAPES_SVG[spec.content] ?? GRAPHIC_SHAPES_SVG.star;
    const color = spec.color || "#111111";
    const size = shapeSpecs.length === 1 ? 400 : Math.round(600 / shapeSpecs.length);
    const xPos = Math.round(width / 2 - size / 2);
    const yPos = Math.round(height / 2 - size / 2 + (i - (shapeSpecs.length - 1) / 2) * (size * 0.8));

    return `<g transform="translate(${xPos}, ${yPos}) scale(${size / 100})" fill="${color}">${shapeSvg}</g>`;
  }).join("\n    ");

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
    ${shapeNodes}
    ${textNodes}
  </g>
</svg>`;
}

export function generateTextSvg(textSpecs: readonly TextPrintSpec[], width = 2400, height = 800): string {
  return generateVectorGraphicsSvg(textSpecs, [], width, height);
}

/**
 * Generates a high-resolution (300 DPI) transparent PNG buffer for printing text and shapes on DTF/Flex film.
 */
export async function generateTransparentGraphicsPngBuffer(
  textSpecs: readonly TextPrintSpec[] = [],
  shapeSpecs: readonly ShapePrintSpec[] = [],
): Promise<Buffer | null> {
  if ((!textSpecs || textSpecs.length === 0) && (!shapeSpecs || shapeSpecs.length === 0)) return null;
  try {
    const svgString = generateVectorGraphicsSvg(textSpecs, shapeSpecs, 3000, 1200);
    return await sharp(Buffer.from(svgString))
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (err) {
    console.error("[TextAssetGenerator] Failed to render transparent PNG:", err);
    return null;
  }
}

export async function generateTransparentTextPngBuffer(textSpecs: readonly TextPrintSpec[]): Promise<Buffer | null> {
  return generateTransparentGraphicsPngBuffer(textSpecs, []);
}
