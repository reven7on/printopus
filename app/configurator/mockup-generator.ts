import { getGraphicShapeSvgString } from "../../lib/graphic-shapes";

export interface MockupElement {
  type: "image" | "text" | "shape";
  content: string;
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
  outlined?: boolean;
}

export interface MockupPrintZone {
  canvas: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Renders a composite mockup PNG image (garment + print elements) on an offscreen HTML5 Canvas.
 */
export async function generateMockupPreviewBlob(
  mockupImageUrl: string,
  printZone: MockupPrintZone,
  elements: readonly MockupElement[],
  canvasSize = 600,
): Promise<Blob | null> {
  if (typeof window === "undefined" || !elements || elements.length === 0) {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 1. Draw base garment image
    try {
      const baseImg = await loadImage(mockupImageUrl);
      ctx.drawImage(baseImg, 0, 0, canvasSize, canvasSize);
    } catch (err) {
      console.warn("[MockupGenerator] Could not load base garment image, fallback to plain background:", err);
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, canvasSize, canvasSize);
    }

    // 2. Calculate zone bounds on canvas
    const zoneX = (printZone.x / printZone.canvas) * canvasSize;
    const zoneY = (printZone.y / printZone.canvas) * canvasSize;
    const zoneW = (printZone.width / printZone.canvas) * canvasSize;
    const zoneH = (printZone.height / printZone.canvas) * canvasSize;

    // 3. Draw red dashed print zone boundary (matches Admin Panel preview)
    ctx.save();
    ctx.strokeStyle = "rgba(224, 36, 36, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(zoneX, zoneY, zoneW, zoneH);
    ctx.restore();

    // 4. Draw each element
    for (const element of elements) {
      ctx.save();

      const centerX = zoneX + zoneW * (element.x / 100);
      const centerY = zoneY + zoneH * (element.y / 100);

      ctx.translate(centerX, centerY);
      ctx.rotate((element.rotation * Math.PI) / 180);

      if (element.type === "image" && element.content) {
        try {
          const img = await loadImage(element.content);
          const renderW = zoneW * (element.width / 100) * element.scale;
          const renderH = renderW / (element.aspectRatio || 1);
          ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
        } catch (err) {
          console.warn("[MockupGenerator] Failed to load element image:", err);
        }
      } else if (element.type === "text" && element.content) {
        const baseFontSize = element.content.length > 17 ? 22 : element.content.length > 11 ? 28 : 34;
        const fontSize = Math.round(baseFontSize * element.scale);
        const fontWeight = element.fontWeight || 700;
        const fontStyle = element.fontStyle || "normal";
        const fontFamily = element.fontFamily || "Inter";

        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (element.outlined) {
          ctx.strokeStyle = getContrastingOutlineColor(element.color);
          ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.08));
          ctx.strokeText(element.content, 0, 0);
        }

        ctx.fillStyle = element.color || "#111111";
        ctx.fillText(element.content, 0, 0);
      } else if (element.type === "shape" && element.content) {
        try {
          const svgString = getGraphicShapeSvgString(element.content, element.color || "#111111", 100);
          const blob = new Blob([svgString], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const img = await loadImage(url);
          URL.revokeObjectURL(url);
          const renderW = zoneW * (element.width / 100) * element.scale;
          const renderH = renderW / (element.aspectRatio || 1);
          ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
        } catch (err) {
          console.warn("[MockupGenerator] Failed to load shape element:", err);
        }
      }

      ctx.restore();
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
    });
  } catch (error) {
    console.error("[MockupGenerator] Error generating mockup blob:", error);
    return null;
  }
}
