export type GraphicShapeId =
  | "star" | "heart" | "line" | "triangle" | "circle" | "square" | "burst" | "sparkle"
  | "semicircle" | "arch" | "badge" | "diamond" | "lightning" | "flame" | "crown" | "sun"
  | "moon" | "flower" | "leaf" | "mountain" | "rocket" | "coffee" | "headphones" | "camera"
  | "music" | "gift" | "snowflake" | "planet" | "trophy" | "smile";

export const GRAPHIC_SHAPES_SVG: Record<string, string> = {
  star: '<polygon points="50,4 61,36 96,36 68,56 79,90 50,70 21,90 32,56 4,36 39,36" />',
  heart: '<path d="M50 88 12 52C-8 31 5 7 28 10c10 1 17 7 22 15 5-8 12-14 22-15 23-3 36 21 16 42Z" />',
  line: '<rect x="5" y="45" width="90" height="10" rx="2" />',
  triangle: '<polygon points="50,7 96,91 4,91" />',
  circle: '<circle cx="50" cy="50" r="44" />',
  square: '<rect x="7" y="7" width="86" height="86" />',
  burst: '<polygon points="50,2 58,31 78,11 69,39 98,32 73,49 98,61 68,59 78,89 57,68 50,98 42,68 21,89 31,59 2,61 27,49 2,32 31,39 21,11 42,31" />',
  sparkle: '<path d="M50 2c4 29 12 39 42 48-30 9-38 19-42 48-4-29-12-39-42-48C38 41 46 31 50 2Z" />',
  semicircle: '<path d="M6 84a44 44 0 0 1 88 0Z" />',
  arch: '<path fill-rule="evenodd" d="M6 88a44 44 0 0 1 88 0H76a26 26 0 0 0-52 0Z" />',
  badge: '<polygon points="50,2 63,16 82,15 84,34 98,50 84,66 82,85 63,84 50,98 37,84 18,85 16,66 2,50 16,34 18,15 37,16" />',
  diamond: '<polygon points="50,4 94,50 50,96 6,50" />',
  lightning: '<polygon points="57,2 17,57 44,57 35,98 84,40 57,40" />',
  flame: '<path d="M52 3c8 20-8 25 1 42 8-10 12-17 10-27 18 16 29 35 23 55-5 17-19 25-36 25S18 88 14 71c-4-18 6-35 22-49-1 15 3 23 11 29 2-16-6-27 5-48Z" />',
  crown: '<path d="m8 25 22 19 20-31 20 31 22-19-10 55H18Z"/><rect x="19" y="84" width="62" height="10" rx="3"/>',
  sun: '<circle cx="50" cy="50" r="23"/><path d="M50 3v16m0 62v16M3 50h16m62 0h16M17 17l12 12m42 42 12 12m0-66L71 29M29 71 17 83" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  moon: '<path d="M72 9a42 42 0 1 0 17 70A36 36 0 0 1 72 9Z" />',
  flower: '<circle cx="50" cy="50" r="14"/><circle cx="50" cy="20" r="18" opacity=".78"/><circle cx="79" cy="41" r="18" opacity=".78"/><circle cx="68" cy="76" r="18" opacity=".78"/><circle cx="32" cy="76" r="18" opacity=".78"/><circle cx="21" cy="41" r="18" opacity=".78"/>',
  leaf: '<path d="M91 10C50 11 17 27 10 66c-4 22 18 30 36 19 26-16 36-44 45-75Z"/><path d="M18 84c17-24 37-42 62-59" fill="none" stroke="white" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>',
  mountain: '<polygon points="3,88 36,29 54,59 66,42 97,88"/><polygon points="27,45 36,29 46,46 39,43 35,49" fill="white" opacity=".65"/><circle cx="76" cy="21" r="10" opacity=".35"/>',
  rocket: '<path d="M54 5c25 18 31 45 17 66L51 91 29 69C17 48 28 20 54 5Z"/><circle cx="52" cy="42" r="10" fill="white" opacity=".7"/><path d="m33 65-19 6 14-23m40 17 18 7-13-24M42 83l9 15 10-16" opacity=".6"/>',
  coffee: '<path d="M15 28h58v42c0 15-12 25-29 25S15 85 15 70Z"/><path d="M72 38h9c18 0 18 28 0 28h-9" fill="none" stroke="currentColor" stroke-width="9"/><path d="M31 7c-7 9 7 11 0 20M50 7c-7 9 7 11 0 20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".65"/>',
  headphones: '<path d="M12 53a38 38 0 0 1 76 0v29H73V54a23 23 0 0 0-46 0v28H12Z"/><rect x="5" y="54" width="22" height="34" rx="8"/><rect x="73" y="54" width="22" height="34" rx="8"/>',
  camera: '<rect x="6" y="25" width="88" height="65" rx="9"/><path d="m28 25 8-14h28l8 14"/><circle cx="50" cy="57" r="22" fill="white" opacity=".72"/><circle cx="50" cy="57" r="13"/><circle cx="81" cy="38" r="5" fill="white" opacity=".72"/>',
  music: '<path d="M39 18v56c0 11-9 20-22 20-10 0-16-6-16-14 0-10 9-18 21-18 4 0 8 1 11 3V8l61-7v55c0 11-9 20-22 20-10 0-16-6-16-14 0-10 9-18 21-18 4 0 8 1 11 3V15Z"/>',
  gift: '<rect x="9" y="37" width="82" height="56" rx="4"/><rect x="4" y="25" width="92" height="22" rx="4" opacity=".8"/><rect x="44" y="25" width="12" height="68" fill="white" opacity=".65"/><path d="M50 25C29 25 18 18 22 8c5-13 25 4 28 17Zm0 0c21 0 32-7 28-17-5-13-25 4-28 17Z"/>',
  snowflake: '<path d="M50 3v94M9 27l82 46M9 73l82-46M50 3 39 15m11-12 11 12M50 97 39 85m11 12 11-12M9 27l16 3M9 27l6 15m76 31-16-3m16 3-6-15M9 73l16-3M9 73l6-15m76-31-16 3m16-3-6 15" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  planet: '<circle cx="51" cy="50" r="29"/><path d="M7 66c11 10 40 4 61-8 21-12 32-27 25-35-5-6-17-4-28 1" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="43" cy="41" r="7" fill="white" opacity=".35"/>',
  trophy: '<path d="M28 7h44v25c0 23-12 34-22 34S28 55 28 32Z"/><path d="M28 17H8v12c0 16 10 25 25 25M72 17h20v12c0 16-10 25-25 25" fill="none" stroke="currentColor" stroke-width="8"/><rect x="44" y="63" width="12" height="20"/><rect x="25" y="82" width="50" height="13" rx="3"/>',
  smile: '<circle cx="50" cy="50" r="45"/><circle cx="35" cy="41" r="6" fill="#111827"/><circle cx="65" cy="41" r="6" fill="#111827"/><path d="M27 60c7 19 39 19 46 0" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round"/>',
};

/**
 * Returns clean SVG markup string for a shape element.
 */
export function getGraphicShapeSvgString(shapeId: string, color = "#111111", size = 100): string {
  const innerMarkup = GRAPHIC_SHAPES_SVG[shapeId] ?? GRAPHIC_SHAPES_SVG.star;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" fill="${color}">
  <g>
    ${innerMarkup}
  </g>
</svg>`;
}
