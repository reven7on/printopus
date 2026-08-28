export type PrintEstimateElement = {
  type: "image" | "text" | "shape";
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  aspectRatio?: number;
};

export type PrintZoneDimensions = Record<
  string,
  Partial<Record<string, { width: number; height: number }>>
>;

export type PrintFormat = {
  id: string;
  width: number;
  height: number;
  add: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getElementPrintDimensions(
  element: PrintEstimateElement,
  zone: { width: number; height: number },
) {
  const width = zone.width * clamp((element.width * element.scale) / 100, 0.01, 1);
  const aspectRatio = element.type === "image"
    ? clamp(element.aspectRatio ?? 1, 0.2, 5)
    : element.type === "shape"
      ? 1
      : clamp(element.content.replace(/\s+/g, "").length / 2.8, 1.4, 7);
  const height = Math.min(zone.height, width / aspectRatio);
  const radians = (element.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));

  return {
    width: Math.min(zone.width, width * cosine + height * sine),
    height: Math.min(zone.height, width * sine + height * cosine),
  };
}

export function getAutomaticPrintEstimate<TFormat extends PrintFormat>(
  designs: Record<string, readonly PrintEstimateElement[]>,
  itemKey: string,
  zoneDimensions: PrintZoneDimensions,
  formats: readonly TFormat[],
) {
  let estimatedWidth = 0;
  let estimatedHeight = 0;
  let elementCount = 0;

  Object.entries(designs).forEach(([view, elements]) => {
    const zone = zoneDimensions[itemKey]?.[view];
    if (!zone || elements.length === 0) return;
    let left = zone.width;
    let right = 0;
    let top = zone.height;
    let bottom = 0;

    elements.forEach((element) => {
      const dimensions = getElementPrintDimensions(element, zone);
      const centerX = zone.width * (element.x / 100);
      const centerY = zone.height * (element.y / 100);
      left = Math.min(left, centerX - dimensions.width / 2);
      right = Math.max(right, centerX + dimensions.width / 2);
      top = Math.min(top, centerY - dimensions.height / 2);
      bottom = Math.max(bottom, centerY + dimensions.height / 2);
      elementCount += 1;
    });

    estimatedWidth = Math.max(estimatedWidth, Math.min(zone.width, right - left));
    estimatedHeight = Math.max(estimatedHeight, Math.min(zone.height, bottom - top));
  });

  if (elementCount === 0) {
    return { size: formats[Math.min(3, formats.length - 1)], width: 0, height: 0, isFallback: true };
  }

  const shortSide = Math.min(estimatedWidth, estimatedHeight);
  const longSide = Math.max(estimatedWidth, estimatedHeight);
  const size = formats.find((format) => shortSide <= format.width && longSide <= format.height)
    ?? formats[formats.length - 1];

  return {
    size,
    width: +estimatedWidth.toFixed(1),
    height: +estimatedHeight.toFixed(1),
    isFallback: false,
  };
}
