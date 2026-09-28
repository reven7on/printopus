export type TextGlyphPlacement = {
  character: string;
  x: number;
  y: number;
  angle: number;
};

export function layoutTextGlyphs(args: {
  content: string;
  pathWidth: number;
  curve: number;
  advances: readonly number[];
}): TextGlyphPlacement[] {
  const characters = Array.from(args.content);
  if (characters.length === 0 || args.pathWidth <= 0 || args.advances.length !== characters.length) return [];

  const rawTotal = args.advances.reduce((sum, advance) => sum + Math.max(0, advance), 0);
  const maximumTextWidth = args.pathWidth * 0.94;
  const fitScale = rawTotal > maximumTextWidth && rawTotal > 0 ? maximumTextWidth / rawTotal : 1;
  const advances = args.advances.map((advance) => Math.max(0, advance) * fitScale);
  const totalWidth = advances.reduce((sum, advance) => sum + advance, 0);
  const curveHeight = -(args.curve / 100) * args.pathWidth * 0.6;
  let cursor = -totalWidth / 2;

  return characters.map((character, index) => {
    const advance = advances[index];
    const x = cursor + advance / 2;
    cursor += advance;
    const t = Math.max(0, Math.min(1, x / args.pathWidth + 0.5));
    const y = 2 * (1 - t) * t * curveHeight;
    const tangentY = 2 * (1 - 2 * t) * curveHeight;
    const angle = Math.atan2(tangentY, args.pathWidth) * 180 / Math.PI;
    return { character, x, y, angle };
  });
}
