"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import {
  DEFAULT_PRINT_METHOD_PRICE,
  GARMENT_COLOR_PRICES,
  getQuantityDiscount,
  PRINT_FORMATS,
  PRODUCT_BASE_PRICES,
} from "../pricing";
import { isValidBelarusianPhone } from "../order-validation";
import { usePublicCatalog } from "../use-public-catalog";
import { getAutomaticPrintEstimate } from "./editor-math";

type ItemId = "shirt" | "hoodie" | "polo" | "cap" | "bag";
type ViewAngle = "front" | "back" | "sleeve_left" | "sleeve_right";
type PlacementId = "center" | "chest_left" | "back" | "sleeve_left" | "sleeve_right";
type DesignerTool = "image" | "text" | "graphics";
type DesignElementType = "image" | "text" | "shape";
type TextAlignment = "left" | "center" | "right";
type ContactMethod = "phone" | "telegram";
type FulfillmentMethod = "pickup" | "delivery";
type GraphicShapeId =
  | "star" | "heart" | "line" | "triangle" | "circle" | "square" | "burst" | "sparkle" | "semicircle" | "arch" | "badge" | "diamond"
  | "lightning" | "flame" | "crown" | "sun" | "moon" | "flower" | "leaf" | "mountain" | "rocket" | "coffee" | "headphones" | "camera"
  | "music" | "gift" | "snowflake" | "planet" | "trophy" | "smile";

type GraphicItem = {
  id: GraphicShapeId;
  label: string;
  color: string;
};

type DesignElement = {
  id: string;
  uploadId?: string;
  type: DesignElementType;
  content: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  aspectRatio?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: 500 | 800;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  textAlign?: TextAlignment;
  outlined?: boolean;
  curve?: number;
  quality?: "good" | "medium" | "low" | "vector";
};

type DesignsByView = Record<ViewAngle, DesignElement[]>;

type TransformGesture = {
  mode: "move" | "resize" | "rotate";
  elementId: string;
  view: ViewAngle;
  before: DesignsByView;
  moved: boolean;
  zoneRect: DOMRect;
  elementRect: DOMRect;
  grabOffsetX: number;
  grabOffsetY: number;
  centerX: number;
  centerY: number;
  startDistance: number;
  startScale: number;
  startAngle: number;
  startRotation: number;
};

type SnapGuides = {
  vertical: boolean;
  horizontal: boolean;
};

type PrintZone = {
  canvas: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const items = [
  { id: "shirt", label: "Футболка", note: "100% хлопковый трикотаж", base: PRODUCT_BASE_PRICES.shirt, icon: "shirt" },
  { id: "hoodie", label: "Толстовка", note: "Утеплённый футер 320 г/м²", base: PRODUCT_BASE_PRICES.hoodie, icon: "hoodie" },
  { id: "polo", label: "Поло", note: "Классическое пике 220 г/м²", base: PRODUCT_BASE_PRICES.polo, icon: "polo" },
  { id: "cap", label: "Кепка", note: "6-панельная классическая", base: PRODUCT_BASE_PRICES.cap, icon: "cap" },
  { id: "bag", label: "Шопер", note: "Плотный натуральный канвас", base: PRODUCT_BASE_PRICES.bag, icon: "bag" },
] as const;

const textFontOptions = [
  { label: "Гротеск", value: "'Noto Sans', Arial, sans-serif" },
  { label: "Антиква", value: "'Noto Serif Display', Georgia, serif" },
  { label: "Моно", value: "'Iosevka Nerd Font Mono', 'Courier New', monospace" },
  { label: "Узкий", value: "'Nimbus Sans Narrow', 'Arial Narrow', sans-serif" },
  { label: "Рукописный", value: "Z003, 'Segoe Script', cursive" },
] as const;

const textColorOptions = [
  { label: "Чёрный", value: "#111111" },
  { label: "Белый", value: "#ffffff" },
  { label: "Красный", value: "#ef101a" },
  { label: "Бордовый", value: "#8b0038" },
  { label: "Синий", value: "#1769e0" },
  { label: "Тёмно-синий", value: "#17233a" },
  { label: "Зелёный", value: "#138a4b" },
  { label: "Жёлтый", value: "#ffc629" },
  { label: "Оранжевый", value: "#f97316" },
  { label: "Фиолетовый", value: "#7c3aed" },
] as const;

const graphicShapes: GraphicItem[] = [
  { id: "star", label: "Звезда", color: "#111827" },
  { id: "heart", label: "Сердце", color: "#ef101a" },
  { id: "line", label: "Линия", color: "#111827" },
  { id: "triangle", label: "Треугольник", color: "#1769e0" },
  { id: "circle", label: "Круг", color: "#111827" },
  { id: "square", label: "Квадрат", color: "#8b0038" },
  { id: "burst", label: "Вспышка", color: "#f97316" },
  { id: "sparkle", label: "Искра", color: "#ffc629" },
  { id: "semicircle", label: "Полукруг", color: "#1769e0" },
  { id: "arch", label: "Арка", color: "#111827" },
  { id: "badge", label: "Значок", color: "#7c3aed" },
  { id: "diamond", label: "Ромб", color: "#138a4b" },
];

const graphicClipart: GraphicItem[] = [
  { id: "lightning", label: "Молния", color: "#ffc629" },
  { id: "flame", label: "Пламя", color: "#ef101a" },
  { id: "crown", label: "Корона", color: "#f59e0b" },
  { id: "sun", label: "Солнце", color: "#f97316" },
  { id: "moon", label: "Луна", color: "#7c3aed" },
  { id: "flower", label: "Цветок", color: "#db2777" },
  { id: "leaf", label: "Лист", color: "#138a4b" },
  { id: "mountain", label: "Горы", color: "#17233a" },
  { id: "rocket", label: "Ракета", color: "#1769e0" },
  { id: "coffee", label: "Кофе", color: "#8b4513" },
  { id: "headphones", label: "Наушники", color: "#111827" },
  { id: "camera", label: "Камера", color: "#17233a" },
  { id: "music", label: "Музыка", color: "#7c3aed" },
  { id: "gift", label: "Подарок", color: "#ef101a" },
  { id: "snowflake", label: "Снежинка", color: "#1769e0" },
  { id: "planet", label: "Планета", color: "#7c3aed" },
  { id: "trophy", label: "Кубок", color: "#f59e0b" },
  { id: "smile", label: "Смайл", color: "#ffc629" },
];

const graphicCollections = [
  { id: "shapes", label: "Формы", items: graphicShapes },
  { id: "clipart", label: "Клипарт", items: graphicClipart },
] as const;

type TextPreset = {
  id: string;
  content: string;
  label: string;
  fontWeight: 500 | 800;
  letterSpacing: number;
  curve: number;
  outlined: boolean;
  fontStyle: "normal" | "italic";
  fontFamily?: string;
  color?: string;
};

const plainTextPreset: TextPreset = {
  id: "plain",
  content: "ВАШ ТЕКСТ",
  label: "Свой текст",
  fontWeight: 800,
  letterSpacing: 0,
  curve: 0,
  outlined: false,
  fontStyle: "normal",
};

const textPresets: TextPreset[] = [
  { id: "team", content: "КОМАНДА", label: "Команда", fontWeight: 800, letterSpacing: 2, curve: 0, outlined: false, fontStyle: "normal", fontFamily: "'Nimbus Sans Narrow', 'Arial Narrow', sans-serif", color: "#ef101a" },
  { id: "minsk", content: "MINSK", label: "Город", fontWeight: 500, letterSpacing: 5, curve: 0, outlined: false, fontStyle: "normal", fontFamily: "'Iosevka Nerd Font Mono', 'Courier New', monospace", color: "#17233a" },
  { id: "love", content: "СДЕЛАНО С ЛЮБОВЬЮ", label: "С любовью", fontWeight: 800, letterSpacing: 1, curve: 55, outlined: false, fontStyle: "normal", fontFamily: "'Noto Serif Display', Georgia, serif", color: "#8b0038" },
  { id: "outline", content: "YOUR IDEA", label: "Идея", fontWeight: 800, letterSpacing: 1, curve: 0, outlined: true, fontStyle: "normal", fontFamily: "'Noto Sans', Arial, sans-serif", color: "#111111" },
  { id: "club", content: "КЛУБ 2026", label: "Клуб", fontWeight: 800, letterSpacing: 1, curve: -35, outlined: false, fontStyle: "italic", fontFamily: "'Noto Sans', Arial, sans-serif", color: "#1769e0" },
  { id: "home", content: "ДОМА ЛУЧШЕ", label: "Дом", fontWeight: 800, letterSpacing: 1, curve: 0, outlined: false, fontStyle: "normal", fontFamily: "Z003, 'Segoe Script', cursive", color: "#138a4b" },
];

const garmentColors = [
  { id: "white", label: "Белый", hex: "#ffffff", border: "#e5e7eb", add: GARMENT_COLOR_PRICES.white },
  { id: "natural", label: "Натуральный", hex: "#f7ebcd", border: "#e5e7eb", add: GARMENT_COLOR_PRICES.natural },
  { id: "black", label: "Чёрный", hex: "#1a1a1a", border: "#1a1a1a", add: GARMENT_COLOR_PRICES.black },
  { id: "khaki", label: "Хаки / Олива", hex: "#786c62", border: "#786c62", add: GARMENT_COLOR_PRICES.khaki },
  { id: "grey", label: "Меланж", hex: "#5b5d61", border: "#5b5d61", add: GARMENT_COLOR_PRICES.grey },
  { id: "darkgrey", label: "Тёмно-серый", hex: "#4a4b4d", border: "#4a4b4d", add: GARMENT_COLOR_PRICES.darkgrey },
  { id: "navy", label: "Тёмно-синий", hex: "#1a2437", border: "#1a2437", add: GARMENT_COLOR_PRICES.navy },
  { id: "blue", label: "Синий", hex: "#2b49b3", border: "#2b49b3", add: GARMENT_COLOR_PRICES.blue },
  { id: "red", label: "Красный", hex: "#d71920", border: "#d71920", add: GARMENT_COLOR_PRICES.red },
  { id: "burgundy", label: "Бордовый", hex: "#750033", border: "#750033", add: GARMENT_COLOR_PRICES.burgundy },
  { id: "green", label: "Зелёный", hex: "#07462c", border: "#07462c", add: GARMENT_COLOR_PRICES.green },
  { id: "sand", label: "Песочный", hex: "#ebe4dc", border: "#ebe4dc", add: GARMENT_COLOR_PRICES.sand },
];

const garmentSizesByItem: Record<ItemId, readonly { id: string; label: string }[]> = {
  shirt: ["XS", "S", "M", "L", "XL", "2XL", "3XL"].map((size) => ({ id: size.toLowerCase(), label: size })),
  hoodie: ["XS", "S", "M", "L", "XL", "2XL", "3XL"].map((size) => ({ id: size.toLowerCase(), label: size })),
  polo: ["S", "M", "L", "XL", "2XL", "3XL"].map((size) => ({ id: size.toLowerCase(), label: size })),
  cap: [{ id: "universal", label: "Универсальный" }],
  bag: [{ id: "one-size", label: "Один размер" }],
};

const garmentSizeGuide = [
  { size: "XS", chest: "82–88", height: "158–168" },
  { size: "S", chest: "88–94", height: "164–174" },
  { size: "M", chest: "94–100", height: "170–180" },
  { size: "L", chest: "100–106", height: "176–186" },
  { size: "XL", chest: "106–114", height: "180–190" },
  { size: "2XL", chest: "114–122", height: "184–194" },
  { size: "3XL", chest: "122–130", height: "184–198" },
];

const methods = {
  dtf: {
    label: "DTF-печать",
    desc: "Для фотографий, градиентов и полноцветных макетов",
    add: DEFAULT_PRINT_METHOD_PRICE,
    icon: "image",
    tags: ["От 1 шт.", "Любые цвета"],
  },
  silk: {
    label: "Шелкография",
    desc: "Стойкая печать простых макетов большими тиражами",
    add: 3,
    icon: "layers",
    tags: ["От 30 шт.", "До 6 цветов"],
  },
  embroidery: {
    label: "Вышивка",
    desc: "Фактурное премиальное нанесение для логотипов и надписей",
    add: 6,
    icon: "target",
    tags: ["Логотипы", "Максимальная стойкость"],
  },
};

const quantityPresets = [1, 10, 20, 50, 100, 200] as const;

const placements = [
  { id: "center", label: "Спереди по центру", sub: "Классическая зона на груди", view: "front" },
  { id: "chest_left", label: "Спереди слева", sub: "Компактный карманный логотип", view: "front" },
  { id: "back", label: "На спине", sub: "Крупный спинной принт", view: "back" },
  { id: "sleeve_left", label: "На левом рукаве", sub: "Фокусный ракурс левого рукава", view: "sleeve_left" },
  { id: "sleeve_right", label: "На правом рукаве", sub: "Фокусный ракурс правого рукава", view: "sleeve_right" },
] as const;

// Coordinates read from Spreadshirt's product viewer. Keeping the original
// canvas units makes the source geometry auditable while CSS receives percentages.
const printZones: Record<ItemId, Partial<Record<ViewAngle, PrintZone>>> = {
  shirt: {
    front: { canvas: 799.1011235955056, x: 231.169, y: 122.719, width: 331, height: 399 },
    back: { canvas: 759.8290598290598, x: 219.808, y: 81.4103, width: 314, height: 379 },
    sleeve_right: { canvas: 317.5, x: 94.1161, y: 149.679, width: 97, height: 109 },
    sleeve_left: { canvas: 317.5, x: 121.33, y: 149.679, width: 96, height: 109 },
  },
  hoodie: {
    front: { canvas: 833.7631887456038, x: 241.196, y: 196.53, width: 348, height: 297 },
    back: { canvas: 897.979797979798, x: 272.601, y: 214.874, width: 355, height: 445 },
    sleeve_right: { canvas: 797.3094170403587, x: 338.857, y: 165.157, width: 93, height: 373 },
    sleeve_left: { canvas: 797.3094170403587, x: 361.637, y: 165.157, width: 93, height: 373 },
  },
  polo: {
    front: { canvas: 856.9018836097835, x: 254.214, y: 147.101, width: 349, height: 457 },
    back: { canvas: 855.9393428812131, x: 253.929, y: 109.846, width: 348, height: 457 },
    sleeve_right: { canvas: 375.50158394931356, x: 120.697, y: 185.069, width: 95, height: 95 },
    sleeve_left: { canvas: 375.50819268202537, x: 158.965, y: 184.938, width: 95, height: 95 },
  },
  cap: {
    front: { canvas: 309.62124510230734, x: 91.7806, y: 139.33, width: 127, height: 50 },
    sleeve_right: { canvas: 309.62124510230734, x: 144.859, y: 138.224, width: 65, height: 50 },
    sleeve_left: { canvas: 309.62124510230734, x: 99.5211, y: 138.224, width: 65, height: 50 },
  },
  bag: {
    front: { canvas: 747.8443743427971, x: 248.391, y: 355.226, width: 251, height: 299 },
    back: { canvas: 747.8443743427971, x: 248.391, y: 355.226, width: 251, height: 299 },
  },
};

// Approximate production dimensions of each editable zone in centimeters.
// They let the quote infer an ISO print format from the customer's actual layout.
const printZoneDimensionsCm: Record<ItemId, Partial<Record<ViewAngle, { width: number; height: number }>>> = {
  shirt: {
    front: { width: 33, height: 40 },
    back: { width: 33, height: 40 },
    sleeve_left: { width: 10, height: 11 },
    sleeve_right: { width: 10, height: 11 },
  },
  hoodie: {
    front: { width: 35, height: 30 },
    back: { width: 35, height: 44 },
    sleeve_left: { width: 9, height: 37 },
    sleeve_right: { width: 9, height: 37 },
  },
  polo: {
    front: { width: 35, height: 45 },
    back: { width: 35, height: 45 },
    sleeve_left: { width: 9.5, height: 9.5 },
    sleeve_right: { width: 9.5, height: 9.5 },
  },
  cap: {
    front: { width: 12.7, height: 5 },
    sleeve_left: { width: 6.5, height: 5 },
    sleeve_right: { width: 6.5, height: 5 },
  },
  bag: {
    front: { width: 25, height: 30 },
    back: { width: 25, height: 30 },
  },
};

const placementIdsByItem: Record<ItemId, readonly PlacementId[]> = {
  shirt: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  hoodie: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  polo: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  cap: ["center", "sleeve_left", "sleeve_right"],
  bag: ["center", "back"],
};

function createEmptyDesigns(): DesignsByView {
  return {
    front: [],
    back: [],
    sleeve_left: [],
    sleeve_right: [],
  };
}

function getOrderDesignSnapshot(designs: DesignsByView) {
  return Object.fromEntries(
    Object.entries(designs).map(([view, elements]) => [
      view,
      elements.map((element) => {
        if (element.type !== "image") return element;
        return {
          id: element.id,
          uploadId: element.uploadId,
          type: element.type,
          name: element.name,
          x: element.x,
          y: element.y,
          scale: element.scale,
          rotation: element.rotation,
          width: element.width,
          aspectRatio: element.aspectRatio,
          quality: element.quality,
        };
      }),
    ]),
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function getInitialElementPosition(placementId: PlacementId) {
  if (placementId === "chest_left") return { x: 76, y: 20, scale: 0.58 };
  return { x: 50, y: 46, scale: 1 };
}

function getPrintZone(itemKey: ItemId, viewAngleKey: ViewAngle) {
  return printZones[itemKey][viewAngleKey];
}

function getPrintZoneStyle(zone: PrintZone): CSSProperties {
  return {
    left: `${(zone.x / zone.canvas) * 100}%`,
    top: `${(zone.y / zone.canvas) * 100}%`,
    width: `${(zone.width / zone.canvas) * 100}%`,
    height: `${(zone.height / zone.canvas) * 100}%`,
  };
}

function getInitialImageWidth(zone: PrintZone, naturalWidth: number, naturalHeight: number) {
  const safeWidth = naturalWidth > 0 ? naturalWidth : 1;
  const safeHeight = naturalHeight > 0 ? naturalHeight : 1;
  const imageAspectRatio = safeWidth / safeHeight;
  const maxWidthPercent = 76;
  const maxHeightPercent = 72;
  const widthLimitedByHeight = maxHeightPercent * (zone.height / zone.width) * imageAspectRatio;

  return +clamp(Math.min(maxWidthPercent, widthLimitedByHeight), 3, maxWidthPercent).toFixed(2);
}

function getPrintZoneControlScale(zone: PrintZone) {
  const shortestZoneSide = Math.min(zone.width, zone.height) / zone.canvas;
  return +clamp(shortestZoneSide / 0.28, 0.7, 1).toFixed(2);
}

function getElementControlScale(zone: PrintZone, element: DesignElement, zoomed: boolean) {
  const workspaceScale = zoomed ? getWorkspaceScale(zone) : 1;
  return getPrintZoneControlScale(zone) / (element.scale * workspaceScale);
}

function getResizeHandleStyle(zone: PrintZone, element: DesignElement, zoomed: boolean): CSSProperties {
  const scale = getElementControlScale(zone, element, zoomed);
  return {
    right: `${-8 * scale}px`,
    bottom: `${-8 * scale}px`,
    transform: `scale(${scale})`,
  };
}

function getRotateHandleStyle(zone: PrintZone, element: DesignElement, zoomed: boolean): CSSProperties {
  const scale = getElementControlScale(zone, element, zoomed);
  return {
    bottom: `${-46 * scale}px`,
    transform: `translateX(-50%) scale(${scale})`,
  };
}

function getElementToolbarStyle(zone: PrintZone, element: DesignElement, zoomed: boolean): CSSProperties {
  const zoneLeft = (zone.x / zone.canvas) * 100;
  const zoneTop = (zone.y / zone.canvas) * 100;
  const zoneWidth = (zone.width / zone.canvas) * 100;
  const zoneHeight = (zone.height / zone.canvas) * 100;
  const focusOriginX = zoneLeft + zoneWidth / 2;
  const focusOriginY = zoneTop + zoneHeight / 2;
  const workspaceScale = zoomed ? getWorkspaceScale(zone) : 1;
  const elementCenterX = zoneLeft + zoneWidth * (element.x / 100);
  const elementCenterY = zoneTop + zoneHeight * (element.y / 100);
  const imageHalfSize = element.type !== "text"
    ? zoneWidth * (element.width / 100) * element.scale * 0.5
    : 4;
  const focusedCenterX = focusOriginX + (elementCenterX - focusOriginX) * workspaceScale;
  const focusedCenterY = focusOriginY + (elementCenterY - focusOriginY) * workspaceScale;

  return {
    left: `${clamp(focusedCenterX, 25, 75)}%`,
    top: `${clamp(focusedCenterY - imageHalfSize * workspaceScale - 2, 12, 88)}%`,
    transform: `translate(-50%, calc(-100% - 8px)) scale(${getPrintZoneControlScale(zone)})`,
    transformOrigin: "center bottom",
  };
}

function getWorkspaceScale(zone: PrintZone) {
  const largestZoneDimension = Math.max(zone.width, zone.height) / zone.canvas;
  return +clamp(0.72 / largestZoneDimension, 1.4, 1.7).toFixed(2);
}

function getWorkspaceCanvasStyle(zone: PrintZone, zoomed: boolean): CSSProperties {
  if (!zoomed) return {};
  const originX = ((zone.x + zone.width / 2) / zone.canvas) * 100;
  const originY = ((zone.y + zone.height / 2) / zone.canvas) * 100;

  return {
    transform: `scale(${getWorkspaceScale(zone)})`,
    transformOrigin: `${originX}% ${originY}%`,
  };
}

function getAvailablePlacementsForItem(itemKey: ItemId) {
  const availableIds = placementIdsByItem[itemKey];
  return placements.filter((placementOption) => availableIds.includes(placementOption.id));
}

function getPlacementCopy(itemKey: ItemId, placementOption: (typeof placements)[number]) {
  if (itemKey === "cap" && placementOption.id === "sleeve_left") {
    return { label: "Слева", sub: "Боковая зона кепки" };
  }
  if (itemKey === "cap" && placementOption.id === "sleeve_right") {
    return { label: "Справа", sub: "Боковая зона кепки" };
  }
  if (itemKey === "bag" && placementOption.id === "center") {
    return { label: "На лицевой стороне", sub: "Основная зона шопера" };
  }
  if (itemKey === "bag" && placementOption.id === "back") {
    return { label: "На обратной стороне", sub: "Основная зона шопера" };
  }
  return { label: placementOption.label, sub: placementOption.sub };
}

const steps = [
  { n: 1, title: "Изделие", note: "Тип одежды", icon: "shirt" },
  { n: 2, title: "Параметры", note: "Цвет и размер", icon: "target" },
  { n: 3, title: "Макет", note: "Логотип и позиция", icon: "upload" },
  { n: 4, title: "Печать", note: "Метод и тираж", icon: "layers" },
  { n: 5, title: "Оформление", note: "Контакты и получение", icon: "clipboard" },
];

function ConfigIcon({ name, size = 24 }: { name: string; size?: number }) {
  const shapes: Record<string, ReactNode> = {
    shirt: <path d="m8 4 4 2 4-2 5 4-3 4-2-2v10H8V10l-2 2-3-4Z" />,
    hoodie: <><path d="M8 5c1-2 2-3 4-3s3 1 4 3l4 4-3 3-1-2v10H8V10l-1 2-3-3Z"/><path d="M9 6c1 2 5 2 6 0M9 15h6"/></>,
    polo: <><path d="m8 4 4 2 4-2 5 4-3 4-2-2v10H8V10l-2 2-3-4Z"/><path d="m10 5 2 4 2-4m-2 4v4"/></>,
    cap: <><path d="M4 13c0-5 3-8 8-8s8 4 8 9c-5 0-10 0-16-1Z"/><path d="M12 13c-4 4-8 4-10 2 2-2 5-3 10-2Z"/></>,
    bag: <><path d="M5 8h14l1 13H4Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5m-18 4 9 5 9-5"/></>,
    clipboard: <><path d="M7 5h10v16H7z"/><path d="M9 5V2h6v3m-5 7 2 2 4-5"/></>,
    zoom: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5m-10-8V8m-2 2h4"/></>,
    zoomOut: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6"/></>,
    rotate: <><path d="M20 7v5h-5"/><path d="M19 12a8 8 0 1 0-2 5"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    trash: <><path d="M5 7h14M9 7V4h6v3m2 0-1 14H8L7 7m4 4v6m3-6v6"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></>,
    type: <><path d="M5 5h14M12 5v14M8 19h8"/></>,
    shapes: <><circle cx="8" cy="8" r="4"/><path d="m15 4 6 10H9Z"/><rect x="4" y="15" width="7" height="7" rx="1"/></>,
    move: <><path d="M12 2v20m0-20-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12h20M2 12l3-3m-3 3 3 3m17-3-3-3m3 3-3 3"/></>,
    undo: <><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></>,
    minus: <path d="M5 12h14"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    bold: <><path d="M8 5h5a3 3 0 0 1 0 6H8Zm0 6h6a4 4 0 0 1 0 8H8Z"/></>,
    italic: <><path d="M10 5h8M6 19h8M14 5 10 19"/></>,
    alignLeft: <path d="M4 6h16M4 10h11M4 14h16M4 18h9"/>,
    alignCenter: <path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>,
    alignRight: <path d="M4 6h16M9 10h11M4 14h16M11 18h9"/>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></>,
    curve: <><path d="M4 16c4-8 12-8 16 0"/><path d="M7 15v4m10-4v4"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4m0 3h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrowRight: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    arrowLeft: <path d="M19 12H5m5-5-5 5 5 5"/>,
    chevronRight: <path d="m9 5 7 7-7 7"/>,
    chevronLeft: <path d="m15 5-7 7 7 7"/>,
    chevronDown: <path d="m5 9 7 7 7-7"/>,
    phone: <path d="M6 3h4l2 5-3 2c2 4 4 6 8 8l2-3 4 2v4c-1 2-4 2-6 1C9 19 4 14 2 7 1 5 3 3 6 3Z"/>,
    message: <><path d="M4 5h16v12H8l-4 4Z"/><path d="M8 9h8M8 13h5"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    truck: <><path d="M3 6h11v11H3Z"/><path d="M14 10h4l3 3v4h-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  };
  return <svg className="config-icon" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function GraphicShape({ id, className }: { id: GraphicShapeId; className?: string }) {
  const shapes: Record<GraphicShapeId, ReactNode> = {
    star: <polygon points="50,4 61,36 96,36 68,56 79,90 50,70 21,90 32,56 4,36 39,36" />,
    heart: <path d="M50 88 12 52C-8 31 5 7 28 10c10 1 17 7 22 15 5-8 12-14 22-15 23-3 36 21 16 42Z" />,
    line: <rect x="5" y="45" width="90" height="10" rx="2" />,
    triangle: <polygon points="50,7 96,91 4,91" />,
    circle: <circle cx="50" cy="50" r="44" />,
    square: <rect x="7" y="7" width="86" height="86" />,
    burst: <polygon points="50,2 58,31 78,11 69,39 98,32 73,49 98,61 68,59 78,89 57,68 50,98 42,68 21,89 31,59 2,61 27,49 2,32 31,39 21,11 42,31" />,
    sparkle: <path d="M50 2c4 29 12 39 42 48-30 9-38 19-42 48-4-29-12-39-42-48C38 41 46 31 50 2Z" />,
    semicircle: <path d="M6 84a44 44 0 0 1 88 0Z" />,
    arch: <path fillRule="evenodd" d="M6 88a44 44 0 0 1 88 0H76a26 26 0 0 0-52 0Z" />,
    badge: <polygon points="50,2 63,16 82,15 84,34 98,50 84,66 82,85 63,84 50,98 37,84 18,85 16,66 2,50 16,34 18,15 37,16" />,
    diamond: <polygon points="50,4 94,50 50,96 6,50" />,
    lightning: <polygon points="57,2 17,57 44,57 35,98 84,40 57,40" />,
    flame: <path d="M52 3c8 20-8 25 1 42 8-10 12-17 10-27 18 16 29 35 23 55-5 17-19 25-36 25S18 88 14 71c-4-18 6-35 22-49-1 15 3 23 11 29 2-16-6-27 5-48Z" />,
    crown: <><path d="m8 25 22 19 20-31 20 31 22-19-10 55H18Z"/><rect x="19" y="84" width="62" height="10" rx="3"/></>,
    sun: <><circle cx="50" cy="50" r="23"/><path d="M50 3v16m0 62v16M3 50h16m62 0h16M17 17l12 12m42 42 12 12m0-66L71 29M29 71 17 83" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/></>,
    moon: <path d="M72 9a42 42 0 1 0 17 70A36 36 0 0 1 72 9Z" />,
    flower: <><circle cx="50" cy="50" r="14"/><circle cx="50" cy="20" r="18" opacity=".78"/><circle cx="79" cy="41" r="18" opacity=".78"/><circle cx="68" cy="76" r="18" opacity=".78"/><circle cx="32" cy="76" r="18" opacity=".78"/><circle cx="21" cy="41" r="18" opacity=".78"/></>,
    leaf: <><path d="M91 10C50 11 17 27 10 66c-4 22 18 30 36 19 26-16 36-44 45-75Z"/><path d="M18 84c17-24 37-42 62-59" fill="none" stroke="white" strokeOpacity=".6" strokeWidth="5" strokeLinecap="round"/></>,
    mountain: <><polygon points="3,88 36,29 54,59 66,42 97,88"/><polygon points="27,45 36,29 46,46 39,43 35,49" fill="white" opacity=".65"/><circle cx="76" cy="21" r="10" opacity=".35"/></>,
    rocket: <><path d="M54 5c25 18 31 45 17 66L51 91 29 69C17 48 28 20 54 5Z"/><circle cx="52" cy="42" r="10" fill="white" opacity=".7"/><path d="m33 65-19 6 14-23m40 17 18 7-13-24M42 83l9 15 10-16" opacity=".6"/></>,
    coffee: <><path d="M15 28h58v42c0 15-12 25-29 25S15 85 15 70Z"/><path d="M72 38h9c18 0 18 28 0 28h-9" fill="none" stroke="currentColor" strokeWidth="9"/><path d="M31 7c-7 9 7 11 0 20M50 7c-7 9 7 11 0 20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".65"/></>,
    headphones: <><path d="M12 53a38 38 0 0 1 76 0v29H73V54a23 23 0 0 0-46 0v28H12Z"/><rect x="5" y="54" width="22" height="34" rx="8"/><rect x="73" y="54" width="22" height="34" rx="8"/></>,
    camera: <><rect x="6" y="25" width="88" height="65" rx="9"/><path d="m28 25 8-14h28l8 14"/><circle cx="50" cy="57" r="22" fill="white" opacity=".72"/><circle cx="50" cy="57" r="13"/><circle cx="81" cy="38" r="5" fill="white" opacity=".72"/></>,
    music: <><path d="M39 18v56c0 11-9 20-22 20-10 0-16-6-16-14 0-10 9-18 21-18 4 0 8 1 11 3V8l61-7v55c0 11-9 20-22 20-10 0-16-6-16-14 0-10 9-18 21-18 4 0 8 1 11 3V15Z"/></>,
    gift: <><rect x="9" y="37" width="82" height="56" rx="4"/><rect x="4" y="25" width="92" height="22" rx="4" opacity=".8"/><rect x="44" y="25" width="12" height="68" fill="white" opacity=".65"/><path d="M50 25C29 25 18 18 22 8c5-13 25 4 28 17Zm0 0c21 0 32-7 28-17-5-13-25 4-28 17Z"/></>,
    snowflake: <path d="M50 3v94M9 27l82 46M9 73l82-46M50 3 39 15m11-12 11 12M50 97 39 85m11 12 11-12M9 27l16 3M9 27l6 15m76 31-16-3m16 3-6-15M9 73l16-3M9 73l6-15m76-31-16 3m16-3-6 15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>,
    planet: <><circle cx="51" cy="50" r="29"/><path d="M7 66c11 10 40 4 61-8 21-12 32-27 25-35-5-6-17-4-28 1" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/><circle cx="43" cy="41" r="7" fill="white" opacity=".35"/></>,
    trophy: <><path d="M28 7h44v25c0 23-12 34-22 34S28 55 28 32Z"/><path d="M28 17H8v12c0 16 10 25 25 25M72 17h20v12c0 16-10 25-25 25" fill="none" stroke="currentColor" strokeWidth="8"/><rect x="44" y="63" width="12" height="20"/><rect x="25" y="82" width="50" height="13" rx="3"/></>,
    smile: <><circle cx="50" cy="50" r="45"/><circle cx="35" cy="41" r="6" fill="#111827"/><circle cx="65" cy="41" r="6" fill="#111827"/><path d="M27 60c7 19 39 19 46 0" fill="none" stroke="#111827" strokeWidth="7" strokeLinecap="round"/></>,
  };

  return (
    <svg className={className} style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      {shapes[id]}
    </svg>
  );
}

function getMockupPath(itemKey: ItemId, colorKey: string, viewAngleKey: ViewAngle) {
  const prodFolder = itemKey === "shirt" ? "tshirt" : itemKey;
  let viewSlug = "front";
  if (viewAngleKey === "back") viewSlug = "back";
  if (viewAngleKey === "sleeve_left") viewSlug = "sleeve-left";
  if (viewAngleKey === "sleeve_right") viewSlug = "sleeve-right";

  if (prodFolder === "bag" && (viewSlug === "sleeve-left" || viewSlug === "sleeve-right")) {
    viewSlug = "front";
  }

  const availColors: Record<string, string[]> = {
    tshirt: ["white", "black", "khaki", "grey", "navy", "red", "burgundy"],
    hoodie: ["white", "black", "grey", "navy", "red", "burgundy"],
    polo: ["white", "black", "grey", "navy", "blue", "sand"],
    cap: ["white", "black", "grey", "darkgrey", "navy", "red", "blue"],
    bag: ["white", "natural", "black", "navy", "red", "blue", "green", "khaki", "burgundy"],
  };

  const validColors = availColors[prodFolder] || ["white", "black"];
  const finalColor = validColors.includes(colorKey) ? colorKey : validColors[0];

  return `/mockups/spreadshirt/${prodFolder}/${prodFolder}-${finalColor}-${viewSlug}.png`;
}

type ConfiguratorDraft = {
  timestamp: number;
  item: ItemId;
  color: string;
  garmentSize: string;
  method: string;
  placement: PlacementId;
  qty: number;
  designs: DesignsByView;
};

const DRAFT_STORAGE_KEY = "printopus_configurator_draft_v1";

function getFallbackColorsForItem(itemKey: ItemId) {
  const prodFolder = itemKey === "shirt" ? "tshirt" : itemKey;
  const availMap: Record<string, string[]> = {
    tshirt: ["white", "black", "khaki", "grey", "navy", "red", "burgundy"],
    hoodie: ["white", "black", "grey", "navy", "red", "burgundy"],
    polo: ["white", "black", "grey", "navy", "blue", "sand"],
    cap: ["white", "black", "grey", "darkgrey", "navy", "red", "blue"],
    bag: ["white", "natural", "black", "navy", "red", "blue", "green", "khaki", "burgundy"],
  };
  const validIds = availMap[prodFolder] || ["white", "black"];
  return garmentColors.filter((c) => validIds.includes(c.id));
}

export default function Configurator() {
  const { catalog: publicCatalog, status: publicCatalogStatus } = usePublicCatalog();
  const catalogReady = publicCatalogStatus === "ready";
  const [currentStep, setCurrentStep] = useState(1);
  const [item, setItem] = useState<ItemId>("shirt");
  const [color, setColor] = useState("khaki");
  const [garmentSize, setGarmentSize] = useState("m");
  const [viewAngle, setViewAngle] = useState<ViewAngle>("front");
  const [method, setMethod] = useState("dtf");
  const [placement, setPlacement] = useState<PlacementId>("center");
  const [qty, setQty] = useState(30);
  
  const [fileError, setFileError] = useState("");
  const [designs, setDesigns] = useState<DesignsByView>(createEmptyDesigns);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeDesignerTool, setActiveDesignerTool] = useState<DesignerTool>("image");
  const [textFont, setTextFont] = useState<string>(textFontOptions[0].value);
  const [quickTextPanel, setQuickTextPanel] = useState<"font" | "color" | "curve" | "more" | null>(null);
  const [mobileDesignPanelOpen, setMobileDesignPanelOpen] = useState(false);
  const [workspaceZoomed, setWorkspaceZoomed] = useState(false);
  const [historyAvailability, setHistoryAvailability] = useState({ undo: 0, redo: 0 });
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ vertical: false, horizontal: false });

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("phone");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [draftToRestore, setDraftToRestore] = useState<ConfiguratorDraft | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<DesignsByView[]>([]);
  const redoRef = useRef<DesignsByView[]>([]);
  const transformGestureRef = useRef<TransformGesture | null>(null);
  const quickTextEditBeforeRef = useRef<DesignsByView | null>(null);
  const nextElementIdRef = useRef(0);
  const pendingUploadsRef = useRef(new Map<string, File>());

  useEffect(() => {
    try {
      const savedJson = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedJson) {
        const parsed: ConfiguratorDraft = JSON.parse(savedJson);
        if (parsed && typeof parsed === "object" && Date.now() - (parsed.timestamp || 0) < 48 * 3600 * 1000) {
          const hasElements = Object.values(parsed.designs || {}).some((list) => Array.isArray(list) && list.length > 0);
          if (hasElements || (parsed.item && parsed.item !== "shirt") || (parsed.qty && parsed.qty !== 30)) {
            setDraftToRestore(parsed);
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse saved draft", e);
    }
  }, []);

  useEffect(() => {
    if (submitted) {
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
      return;
    }
    const hasElements = Object.values(designs).some((list) => list.length > 0);
    if (!hasElements && item === "shirt" && color === "khaki" && qty === 30) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const draft: ConfiguratorDraft = {
          timestamp: Date.now(),
          item,
          color,
          garmentSize,
          method,
          placement,
          qty,
          designs,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (e) {
        console.error("Failed to save draft", e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [item, color, garmentSize, method, placement, qty, designs, submitted]);

  function restoreDraft() {
    if (!draftToRestore) return;
    if (draftToRestore.item) setItem(draftToRestore.item);
    if (draftToRestore.color) setColor(draftToRestore.color);
    if (draftToRestore.garmentSize) setGarmentSize(draftToRestore.garmentSize);
    if (draftToRestore.method) setMethod(draftToRestore.method);
    if (draftToRestore.placement) setPlacement(draftToRestore.placement);
    if (draftToRestore.qty) setQty(draftToRestore.qty);
    if (draftToRestore.designs) setDesigns(draftToRestore.designs);
    setDraftToRestore(null);
    setDraftDismissed(true);
  }

  function dismissDraft() {
    setDraftToRestore(null);
    setDraftDismissed(true);
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
  }

  function resolveColors(itemKey: ItemId) {
    if (!catalogReady) return getFallbackColorsForItem(itemKey);
    const product = publicCatalog?.products.find((entry) => entry.slug === itemKey);
    const options = product?.options.filter((option) => option.type === "COLOR") ?? [];
    return options.map((option) => {
      const fallback = garmentColors.find((entry) => entry.id === option.value);
      const hex = option.colorHex ?? fallback?.hex ?? "#d4d4d4";
      return { id: option.value, label: option.label, hex, border: fallback?.border ?? hex, add: option.priceDelta };
    });
  }

  function resolveSizes(itemKey: ItemId) {
    if (!catalogReady) return garmentSizesByItem[itemKey];
    const product = publicCatalog?.products.find((entry) => entry.slug === itemKey);
    const options = product?.options.filter((option) => option.type === "SIZE") ?? [];
    return options.map((option) => ({ id: option.value, label: option.label }));
  }

  const availableItems = useMemo(() => items.filter((itemTemplate) => {
    if (!catalogReady) return true;
    const product = publicCatalog?.products.find((entry) => entry.slug === itemTemplate.id);
    if (!product) return false;
    return product.options.some((option) => option.type === "COLOR")
      && product.options.some((option) => option.type === "SIZE")
      && product.printMethods.some((method) => method.formats.length > 0);
  }).map((itemTemplate) => {
    const product = publicCatalog?.products.find((entry) => entry.slug === itemTemplate.id);
    return product ? { ...itemTemplate, label: product.name, note: product.description ?? itemTemplate.note, base: product.basePrice } : itemTemplate;
  }), [catalogReady, publicCatalog]);
  useEffect(() => {
    if (availableItems.length && !availableItems.some((entry) => entry.id === item)) {
      // The catalog may deactivate the currently selected product between visits.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItem(availableItems[0].id);
    }
  }, [availableItems, item]);
  const selectedItem = availableItems.find((i) => i.id === item) ?? availableItems[0];
  const selectedItemId = selectedItem?.id ?? item;
  const selectedCatalogItem = catalogReady
    ? publicCatalog?.products.find((entry) => entry.slug === selectedItemId)
    : null;
  const availableColors = resolveColors(selectedItemId);
  const selectedColor = availableColors.find((c) => c.id === color) ?? availableColors[0];
  const availableGarmentSizes = resolveSizes(selectedItemId);
  const selectedGarmentSize = availableGarmentSizes.find((size) => size.id === garmentSize) ?? availableGarmentSizes[0];
  const availableMethods = catalogReady
    ? (selectedCatalogItem?.printMethods ?? []).map((entry) => {
      const fallback = methods[entry.slug as keyof typeof methods];
      return {
        id: entry.slug,
        label: entry.name,
        desc: entry.description ?? fallback?.desc ?? "Способ нанесения",
        add: entry.priceDelta,
        icon: fallback?.icon ?? "layers",
        tags: fallback?.tags ?? [],
        formats: entry.formats.map((format, index) => {
          const formatFallback = PRINT_FORMATS.find((candidate) => candidate.id === format.code) ?? PRINT_FORMATS[Math.min(index, PRINT_FORMATS.length - 1)];
          return {
            ...formatFallback,
            id: format.code,
            label: format.code,
            dimensions: `${format.widthCm.toString().replace(".", ",")} × ${format.heightCm.toString().replace(".", ",")} см`,
            width: format.widthCm,
            height: format.heightCm,
            add: format.priceDelta,
          };
        }),
      };
    })
    : Object.entries(methods).map(([id, entry]) => ({ id, ...entry, formats: [...PRINT_FORMATS] }));
  const selectedMethod = availableMethods.find((entry) => entry.id === method) ?? availableMethods[0];
  const availablePrintSizes = selectedMethod?.formats ?? [];

  if (catalogReady && (
    !selectedItem
    || !selectedColor
    || !selectedGarmentSize
    || !selectedMethod
    || availablePrintSizes.length === 0
  )) {
    return (
      <main className="config-catalog-state">
        <section className="config-catalog-state-card" role="status">
          <NextImage src="/logo.webp" alt="" width={96} height={96} />
          <span>Каталог временно недоступен</span>
          <h1>Оформление заказа приостановлено</h1>
          <p>Сейчас нет полного набора доступных товаров, вариантов или способов печати. Пожалуйста, свяжитесь с менеджером либо попробуйте позже.</p>
          <div>
            <a className="button button-primary" href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer">Написать менеджеру</a>
            <Link className="button outline" href="/">На главную</Link>
          </div>
        </section>
      </main>
    );
  }

  const printEstimate = getAutomaticPrintEstimate(designs, item, printZoneDimensionsCm, availablePrintSizes);
  const selectedSize = printEstimate.size;
  const selectedPlacement = placements.find((p) => p.id === placement)!;
  const activeStep = steps.find((s) => s.n === currentStep)!;
  const availablePlacements = getAvailablePlacementsForItem(item);
  const selectedPlacementCopy = getPlacementCopy(item, selectedPlacement);
  const currentPrintZone = getPrintZone(item, viewAngle);
  const availableViews = [
    { id: "front" as const, label: "Спереди" },
    { id: "back" as const, label: "Сзади" },
    ...(item === "bag" ? [] : [
      { id: "sleeve_right" as const, label: item === "cap" ? "Правый ракурс" : "Правый рукав" },
      { id: "sleeve_left" as const, label: item === "cap" ? "Левый ракурс" : "Левый рукав" },
    ]),
  ];
  const editorViews = availableViews.filter((view) => Boolean(getPrintZone(item, view.id)));
  const currentElements = designs[viewAngle];
  const selectedElement = currentElements.find((element) => element.id === selectedElementId) ?? null;
  const hasArtwork = currentElements.length > 0;
  const compactPrintZone = currentPrintZone
    ? currentPrintZone.width / currentPrintZone.canvas < 0.2 || currentPrintZone.height / currentPrintZone.canvas < 0.2
    : false;
  const designElementsCount = Object.values(designs).reduce((total, elements) => total + elements.length, 0);
  const discount = catalogReady
    ? (() => {
      const discounts = publicCatalog?.volumeDiscounts ?? [];
      const current = [...discounts].reverse().find((entry) => qty >= entry.minQuantity);
      const next = discounts.find((entry) => qty < entry.minQuantity);
      const percent = current?.percent ?? 0;
      return { percent, multiplier: 1 - percent / 100, nextAt: next?.minQuantity ?? null };
    })()
    : getQuantityDiscount(qty);
  const discountMilestones = catalogReady
    ? [1, ...(publicCatalog?.volumeDiscounts ?? []).map((entry) => entry.minQuantity)]
    : [1, 20, 50, 100, 200];
  const hasRasterArtwork = Object.values(designs).some((elements) => (
    elements.some((element) => element.type === "image" && element.quality !== "vector")
  ));
  const recommendedMethod = item === "cap" && designElementsCount > 0 && !hasRasterArtwork
    ? "embroidery"
    : hasRasterArtwork
      ? "dtf"
      : qty >= 30
        ? "silk"
        : "dtf";

  // Authentic Spreadshirt PNG mockups mapped per product, color & view
  const currentMockupImage = getMockupPath(item, selectedColor.id, viewAngle);

  const unitPrice = (() => {
    const baseUnit = selectedItem.base + selectedColor.add + selectedMethod.add + selectedSize.add;
    return +(baseUnit * discount.multiplier).toFixed(2);
  })();

  const totalPrice = +(unitPrice * qty).toFixed(2);

  function commitDesigns(nextDesigns: DesignsByView) {
    historyRef.current = [...historyRef.current.slice(-29), designs];
    redoRef.current = [];
    setDesigns(nextDesigns);
    setHistoryAvailability({ undo: historyRef.current.length, redo: 0 });
  }

  function addImageElement(
    source: string,
    sourceFile: File,
    quality: DesignElement["quality"],
    naturalWidth: number,
    naturalHeight: number,
  ) {
    const initial = getInitialElementPosition(placement);
    const zone = getPrintZone(item, viewAngle);
    nextElementIdRef.current += 1;
    const uploadId = `image-${nextElementIdRef.current}`;
    const newElement: DesignElement = {
      id: uploadId,
      uploadId,
      type: "image",
      content: source,
      name: sourceFile.name,
      x: initial.x,
      y: initial.y,
      scale: initial.scale,
      rotation: 0,
      width: zone ? getInitialImageWidth(zone, naturalWidth, naturalHeight) : 60,
      aspectRatio: naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1,
      quality,
    };
    pendingUploadsRef.current.set(uploadId, sourceFile);
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], newElement] });
    setSelectedElementId(newElement.id);
    setWorkspaceZoomed(true);
    setFileError("");
  }

  function handleFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["png", "jpg", "jpeg", "webp"];
    if (!extension || !allowedExtensions.includes(extension)) {
      setFileError("Поддерживаются только PNG, JPG и WebP. SVG и видео запрещены.");
      setActiveDesignerTool("image");
      setMobileDesignPanelOpen(true);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFileError("Содержимое файла не похоже на поддерживаемое изображение.");
      setActiveDesignerTool("image");
      setMobileDesignPanelOpen(true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("Файл больше 10 МБ. Уменьшите его и загрузите снова.");
      setActiveDesignerTool("image");
      setMobileDesignPanelOpen(true);
      return;
    }
    const activeUploadIds = new Set(
      Object.values(designs).flat().flatMap((element) => element.type === "image" && element.uploadId ? [element.uploadId] : []),
    );
    if (activeUploadIds.size >= 5) {
      setFileError("К одному заказу можно приложить не более 5 изображений.");
      setActiveDesignerTool("image");
      setMobileDesignPanelOpen(true);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setFileError("Не удалось прочитать файл. Попробуйте другой.");
      setActiveDesignerTool("image");
      setMobileDesignPanelOpen(true);
    };
    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();
      image.onload = () => {
        const shortestSide = Math.min(image.naturalWidth, image.naturalHeight);
        const quality: DesignElement["quality"] = shortestSide >= 1200
          ? "good"
          : shortestSide >= 700
            ? "medium"
            : "low";
        addImageElement(source, file, quality, image.naturalWidth, image.naturalHeight);
      };
      image.onerror = () => {
        setFileError("Изображение повреждено или не поддерживается.");
        setActiveDesignerTool("image");
        setMobileDesignPanelOpen(true);
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  }

  function updateElementLive(targetView: ViewAngle, elementId: string, patch: Partial<DesignElement>) {
    setDesigns((current) => ({
      ...current,
      [targetView]: current[targetView].map((element) => element.id === elementId ? { ...element, ...patch } : element),
    }));
  }

  function updateSelectedElement(patch: Partial<DesignElement>) {
    if (!selectedElement) return;
    commitDesigns({
      ...designs,
      [viewAngle]: designs[viewAngle].map((element) => element.id === selectedElement.id ? { ...element, ...patch } : element),
    });
  }

  function deleteSelectedElement() {
    if (!selectedElement) return;
    const nextViewElements = designs[viewAngle].filter((element) => element.id !== selectedElement.id);
    commitDesigns({ ...designs, [viewAngle]: nextViewElements });
    setSelectedElementId(null);
    if (nextViewElements.length === 0) setWorkspaceZoomed(false);
  }

  function addTextPreset(preset: TextPreset) {
    const initial = getInitialElementPosition(placement);
    nextElementIdRef.current += 1;
    const newElement: DesignElement = {
      id: `text-${nextElementIdRef.current}`,
      type: "text",
      content: preset.content,
      name: preset.content,
      x: initial.x,
      y: initial.y,
      scale: initial.scale,
      rotation: 0,
      width: 70,
      color: preset.color ?? "#111111",
      fontFamily: preset.fontFamily ?? textFont,
      fontWeight: preset.fontWeight,
      fontStyle: preset.fontStyle,
      letterSpacing: preset.letterSpacing,
      textAlign: "center",
      outlined: preset.outlined,
      curve: preset.curve,
    };
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], newElement] });
    setSelectedElementId(newElement.id);
    setQuickTextPanel(null);
    setWorkspaceZoomed(true);
    setMobileDesignPanelOpen(false);
  }

  function addPlainText() {
    addTextPreset(plainTextPreset);
  }

  function addGraphic(shape: GraphicItem) {
    const initial = getInitialElementPosition(placement);
    nextElementIdRef.current += 1;
    const newElement: DesignElement = {
      id: `shape-${nextElementIdRef.current}`,
      type: "shape",
      content: shape.id,
      name: shape.label,
      x: initial.x,
      y: initial.y,
      scale: initial.scale,
      rotation: 0,
      width: 54,
      color: shape.color,
      quality: "vector",
    };
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], newElement] });
    setSelectedElementId(newElement.id);
    setQuickTextPanel(null);
    setWorkspaceZoomed(true);
    setMobileDesignPanelOpen(false);
  }

  function selectDesignElement(element: DesignElement) {
    setSelectedElementId(element.id);
    setActiveDesignerTool(element.type === "shape" ? "graphics" : element.type);
    setQuickTextPanel(null);
  }

  function updateSelectedTextQuick(patch: Partial<DesignElement>) {
    if (selectedElement?.type !== "text") return;
    updateSelectedElement(patch);
  }

  function beginQuickTextEdit() {
    if (selectedElement?.type !== "text") return;
    quickTextEditBeforeRef.current = designs;
  }

  function updateQuickTextContent(content: string) {
    if (selectedElement?.type !== "text") return;
    updateElementLive(viewAngle, selectedElement.id, { content, name: content || "Текст" });
  }

  function finishQuickTextEdit() {
    if (selectedElement?.type !== "text") return;
    const before = quickTextEditBeforeRef.current;
    quickTextEditBeforeRef.current = null;
    const cleanText = selectedElement.content.trim() || "Текст";
    if (cleanText !== selectedElement.content) {
      updateElementLive(viewAngle, selectedElement.id, { content: cleanText, name: cleanText });
    }
    const previousElement = before?.[viewAngle].find((element) => element.id === selectedElement.id);
    if (!before || previousElement?.content === cleanText) return;
    historyRef.current = [...historyRef.current.slice(-29), before];
    redoRef.current = [];
    setHistoryAvailability({ undo: historyRef.current.length, redo: 0 });
  }

  function duplicateSelectedElement() {
    if (!selectedElement) return;
    nextElementIdRef.current += 1;
    const copy: DesignElement = {
      ...selectedElement,
      id: `${selectedElement.type}-${nextElementIdRef.current}`,
      name: `${selectedElement.name} копия`,
      x: clamp(selectedElement.x + 6, 8, 92),
      y: clamp(selectedElement.y + 6, 8, 92),
    };
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], copy] });
    setSelectedElementId(copy.id);
  }

  function cycleSelectedTextAlignment() {
    if (selectedElement?.type !== "text") return;
    const currentAlignment = selectedElement.textAlign ?? "center";
    const nextAlignment: Record<TextAlignment, TextAlignment> = { left: "center", center: "right", right: "left" };
    updateSelectedTextQuick({ textAlign: nextAlignment[currentAlignment] });
  }

  function undoDesignChange() {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    redoRef.current = [...redoRef.current, designs];
    historyRef.current = historyRef.current.slice(0, -1);
    setDesigns(previous);
    setSelectedElementId(null);
    setHistoryAvailability({ undo: historyRef.current.length, redo: redoRef.current.length });
  }

  function redoDesignChange() {
    const next = redoRef.current.at(-1);
    if (!next) return;
    historyRef.current = [...historyRef.current, designs];
    redoRef.current = redoRef.current.slice(0, -1);
    setDesigns(next);
    setSelectedElementId(null);
    setHistoryAvailability({ undo: historyRef.current.length, redo: redoRef.current.length });
  }

  function startMoveGesture(event: ReactPointerEvent<HTMLButtonElement>, element: DesignElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    selectDesignElement(element);
    setSnapGuides({ vertical: false, horizontal: false });
    const elementRect = event.currentTarget.getBoundingClientRect();
    const zoneRect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!zoneRect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    transformGestureRef.current = {
      mode: "move",
      elementId: element.id,
      view: viewAngle,
      before: designs,
      moved: false,
      zoneRect,
      elementRect,
      grabOffsetX: event.clientX - (elementRect.left + elementRect.width / 2),
      grabOffsetY: event.clientY - (elementRect.top + elementRect.height / 2),
      centerX: elementRect.left + elementRect.width / 2,
      centerY: elementRect.top + elementRect.height / 2,
      startDistance: 0,
      startScale: element.scale,
      startAngle: 0,
      startRotation: element.rotation,
    };
  }

  function startResizeGesture(event: ReactPointerEvent<HTMLSpanElement>, element: DesignElement) {
    event.preventDefault();
    event.stopPropagation();
    const elementNode = event.currentTarget.parentElement;
    const zoneNode = elementNode?.parentElement;
    if (!elementNode || !zoneNode) return;
    const elementRect = elementNode.getBoundingClientRect();
    const zoneRect = zoneNode.getBoundingClientRect();
    const centerX = elementRect.left + elementRect.width / 2;
    const centerY = elementRect.top + elementRect.height / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    transformGestureRef.current = {
      mode: "resize",
      elementId: element.id,
      view: viewAngle,
      before: designs,
      moved: false,
      zoneRect,
      elementRect,
      grabOffsetX: 0,
      grabOffsetY: 0,
      centerX,
      centerY,
      startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      startScale: element.scale,
      startAngle: 0,
      startRotation: element.rotation,
    };
  }

  function startRotateGesture(event: ReactPointerEvent<HTMLSpanElement>, element: DesignElement) {
    event.preventDefault();
    event.stopPropagation();
    const elementNode = event.currentTarget.parentElement;
    const zoneNode = elementNode?.parentElement;
    if (!elementNode || !zoneNode) return;
    const elementRect = elementNode.getBoundingClientRect();
    const zoneRect = zoneNode.getBoundingClientRect();
    const centerX = elementRect.left + elementRect.width / 2;
    const centerY = elementRect.top + elementRect.height / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    transformGestureRef.current = {
      mode: "rotate",
      elementId: element.id,
      view: viewAngle,
      before: designs,
      moved: false,
      zoneRect,
      elementRect,
      grabOffsetX: 0,
      grabOffsetY: 0,
      centerX,
      centerY,
      startDistance: 0,
      startScale: element.scale,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: element.rotation,
    };
  }

  function handleTransformMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = transformGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    gesture.moved = true;
    if (gesture.mode === "rotate") {
      const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX);
      const angleDelta = ((angle - gesture.startAngle) * 180) / Math.PI;
      const rotation = ((gesture.startRotation + angleDelta) % 360 + 360) % 360;
      updateElementLive(gesture.view, gesture.elementId, {
        rotation: +rotation.toFixed(1),
      });
      return;
    }
    if (gesture.mode === "resize") {
      const distance = Math.hypot(event.clientX - gesture.centerX, event.clientY - gesture.centerY);
      updateElementLive(gesture.view, gesture.elementId, {
        scale: +clamp(gesture.startScale * (distance / gesture.startDistance), 0.35, 2.2).toFixed(2),
      });
      return;
    }

    const halfWidth = Math.min(45, (gesture.elementRect.width / gesture.zoneRect.width) * 50);
    const halfHeight = Math.min(45, (gesture.elementRect.height / gesture.zoneRect.height) * 50);
    const x = ((event.clientX - gesture.grabOffsetX - gesture.zoneRect.left) / gesture.zoneRect.width) * 100;
    const y = ((event.clientY - gesture.grabOffsetY - gesture.zoneRect.top) / gesture.zoneRect.height) * 100;
    const clampedX = clamp(x, halfWidth, 100 - halfWidth);
    const clampedY = clamp(y, halfHeight, 100 - halfHeight);
    const snapX = Math.abs(clampedX - 50) <= (10 / gesture.zoneRect.width) * 100;
    const snapY = Math.abs(clampedY - 50) <= (10 / gesture.zoneRect.height) * 100;
    setSnapGuides({ vertical: snapX, horizontal: snapY });
    updateElementLive(gesture.view, gesture.elementId, {
      x: snapX ? 50 : +clampedX.toFixed(2),
      y: snapY ? 50 : +clampedY.toFixed(2),
    });
  }

  function finishTransformGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = transformGestureRef.current;
    if (!gesture) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (gesture.moved) {
      historyRef.current = [...historyRef.current.slice(-29), gesture.before];
      redoRef.current = [];
      setHistoryAvailability({ undo: historyRef.current.length, redo: 0 });
    }
    transformGestureRef.current = null;
    setSnapGuides({ vertical: false, horizontal: false });
  }

  const pinchRef = useRef<{ startDist: number; startScale: number; elementId: string } | null>(null);

  function handleElementTouchStart(event: React.TouchEvent<HTMLButtonElement>, element: DesignElement) {
    if (event.touches.length === 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchRef.current = {
        startDist: Math.max(1, dist),
        startScale: element.scale,
        elementId: element.id,
      };
    }
  }

  function handleElementTouchMove(event: React.TouchEvent<HTMLButtonElement>, element: DesignElement) {
    if (event.touches.length === 2 && pinchRef.current && pinchRef.current.elementId === element.id) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (pinchRef.current.startDist > 0) {
        const ratio = dist / pinchRef.current.startDist;
        const newScale = +clamp(pinchRef.current.startScale * ratio, 0.35, 2.2).toFixed(2);
        updateElementLive(viewAngle, element.id, { scale: newScale });
      }
    }
  }

  function handleElementTouchEnd() {
    if (pinchRef.current) {
      pinchRef.current = null;
    }
  }

  async function handleSubmitOrder(e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    if (!customerName.trim()) return;
    if (!isValidBelarusianPhone(customerPhone)) {
      setPhoneError("Введите белорусский номер в формате +375 (29) 000-00-00.");
      return;
    }
    if (fulfillmentMethod === "delivery" && !deliveryAddress.trim()) return;
    setPhoneError("");
    setSubmissionError("");
    setSubmitting(true);

    try {
      const orderPayload = {
          customerName,
          customerPhone,
          contactMethod,
          fulfillmentMethod,
          deliveryAddress: fulfillmentMethod === "delivery" ? deliveryAddress : null,
          comment: customerComment,
          productSlug: item,
          color: selectedColor.id,
          size: selectedGarmentSize.id,
          printMethodSlug: selectedMethod.id,
          printFormatCode: selectedSize.id,
          placement,
          quantity: qty,
          design: getOrderDesignSnapshot(designs),
      };
      const activeUploadIds = Array.from(new Set(
        Object.values(designs).flat().flatMap((element) => element.type === "image" && element.uploadId ? [element.uploadId] : []),
      ));
      const files = activeUploadIds.flatMap((uploadId) => {
        const file = pendingUploadsRef.current.get(uploadId);
        return file ? [file] : [];
      });
      const formData = new FormData();
      formData.append("order", JSON.stringify(orderPayload));
      files.forEach((file) => formData.append("files", file, file.name));

      const response = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });
      const result = await response.json() as {
        order?: { orderNumber?: string };
        error?: { message?: string; field?: string };
      };

      if (!response.ok || !result.order?.orderNumber) {
        const message = result.error?.message ?? "Не удалось отправить заявку. Попробуйте ещё раз.";
        if (result.error?.field === "customerPhone") setPhoneError(message);
        else setSubmissionError(message);
        return;
      }

      setOrderId(result.order.orderNumber);
      setSubmitted(true);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Не удалось отправить заявку. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  function startNewOrder() {
    setSubmitted(false);
    setCurrentStep(1);
    setItem("shirt");
    setColor("khaki");
    setGarmentSize("m");
    setViewAngle("front");
    setMethod("dtf");
    setPlacement("center");
    setQty(30);
    setDesigns(createEmptyDesigns());
    pendingUploadsRef.current.clear();
    setSelectedElementId(null);
    setWorkspaceZoomed(false);
    setCustomerName("");
    setCustomerPhone("");
    setPhoneError("");
    setCustomerComment("");
    setContactMethod("phone");
    setFulfillmentMethod("pickup");
    setDeliveryAddress("");
    setOrderId("");
    setSubmitting(false);
    setSubmissionError("");
    historyRef.current = [];
    redoRef.current = [];
    setHistoryAvailability({ undo: 0, redo: 0 });
  }

  function handleSelectViewAngle(angle: ViewAngle) {
    setViewAngle(angle);
    setSelectedElementId(null);
    setWorkspaceZoomed(designs[angle].length > 0);
    if (angle === "back" && availablePlacements.some((p) => p.id === "back")) setPlacement("back");
    else if (angle === "sleeve_left" && availablePlacements.some((p) => p.id === "sleeve_left")) setPlacement("sleeve_left");
    else if (angle === "sleeve_right" && availablePlacements.some((p) => p.id === "sleeve_right")) setPlacement("sleeve_right");
    else if (angle === "front" && (placement === "back" || placement === "sleeve_left" || placement === "sleeve_right")) {
      setPlacement("center");
    }
  }

  function cycleViewAngle(direction: -1 | 1) {
    const currentIndex = availableViews.findIndex((view) => view.id === viewAngle);
    const nextIndex = (currentIndex + direction + availableViews.length) % availableViews.length;
    handleSelectViewAngle(availableViews[nextIndex].id);
  }

  function advanceStep() {
    if (currentStep === 2 && !getPrintZone(item, viewAngle)) {
      handleSelectViewAngle("front");
    }
    setMobileDesignPanelOpen(false);
    setCurrentStep((step) => Math.min(5, step + 1));
  }

  function toggleMobileDesignPanel() {
    const nextOpen = !mobileDesignPanelOpen;
    if (nextOpen && selectedElement) selectDesignElement(selectedElement);
    setMobileDesignPanelOpen(nextOpen);
  }

  return (
    <main className={`config-wizard-page current-step-${currentStep} ${submitted ? "is-submitted" : ""}`}>
      {/* Header */}
      <header className="config-nav-header">
        <div className="config-header-container">
          <Link className="brand" href="/" style={{ gap: '10px' }} aria-label="Принтопус — вернуться на главную">
            <NextImage src="/logo.webp" alt="" className="brand-logo-img" width={256} height={256} priority />
            <span className="brand-title"><b>ПРИНТОПУС</b><small>центр печати</small></span>
          </Link>
          <div className="config-header-right">
            <a className="config-phone-link" href="tel:+375295552030">
              <ConfigIcon name="phone" size={16} />
              <span>+375 (29) 555-20-30</span>
            </a>
            <Link href="/" className="button button-small outline config-home-link">
              <ConfigIcon name="arrowLeft" size={16} />
              <span>На главную</span>
            </Link>
          </div>
        </div>
      </header>

      {draftToRestore && !draftDismissed && !submitted && (
        <div className="config-draft-banner" role="alert">
          <div className="config-draft-banner-content">
            <ConfigIcon name="edit" size={18} />
            <span>Нашли ваш сохранённый макет ({draftToRestore.qty} шт.). Восстановить?</span>
          </div>
          <div className="config-draft-banner-actions">
            <button type="button" className="button button-small" onClick={restoreDraft}>
              Восстановить макет
            </button>
            <button type="button" className="button button-small outline" onClick={dismissDraft}>
              Сбросить
            </button>
          </div>
        </div>
      )}

      <div className="config-stepper-wrapper">
        <div
          className="config-progress-track"
          role="progressbar"
          aria-label={`${activeStep.title}: ${activeStep.note}`}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={currentStep}
        >
          <span style={{ width: `${(currentStep / steps.length) * 100}%` }} />
        </div>
      </div>

      {/* Main Wizard Area */}
      <div
        className={`config-wizard-body step-${currentStep} ${currentStep === 1 ? "catalog-mode" : ""} ${currentStep === 5 ? "checkout-mode" : ""} ${currentStep === 3 && mobileDesignPanelOpen ? "mobile-tools-open" : ""}`}
        style={currentStep === 5 ? { gridTemplateColumns: "minmax(0, 780px)", justifyContent: "center" } : undefined}
      >
        {/* Left Column: Authentic Spreadshirt Visual Canvas */}
        {currentStep >= 2 && currentStep < 5 && (
        <div className="config-preview-panel">
          <div className="stage-card">
            <div className="stage-header">
              <span className="stage-badge">{selectedItem.label} · {selectedColor.label} · {selectedGarmentSize.label}</span>
              {currentStep === 3 && (
                <div className="design-history-actions" aria-label="История изменений макета">
                  <button type="button" onClick={undoDesignChange} disabled={!historyAvailability.undo} aria-label="Отменить" title="Отменить">
                    <ConfigIcon name="undo" size={17}/>
                  </button>
                  <button type="button" onClick={redoDesignChange} disabled={!historyAvailability.redo} aria-label="Повторить" title="Повторить">
                    <ConfigIcon name="redo" size={17}/>
                  </button>
                </div>
              )}
            </div>

            {currentStep >= 3 && (
              <div className="designer-view-tabs" role="tablist" aria-label="Область нанесения">
                {editorViews.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    role="tab"
                    aria-selected={viewAngle === view.id}
                    className={viewAngle === view.id ? "active" : ""}
                    onClick={() => handleSelectViewAngle(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )}

            {/* Authentic Spreadshirt Garment Canvas */}
            <div className={`garment-stage ${workspaceZoomed && hasArtwork ? "workspace-zoomed" : ""}`}>
              <div className="garment-canvas-frame">
                <div
                  className="garment-canvas"
                  data-product={item}
                  data-view={viewAngle}
                  style={currentStep === 3 && currentPrintZone ? getWorkspaceCanvasStyle(currentPrintZone, workspaceZoomed && hasArtwork) : undefined}
                >
                {/* Authentic Spreadshirt High-Res Render Image */}
                <NextImage src={currentMockupImage} alt={selectedItem.label} className="garment-base-img authentic" fill sizes="(max-width: 760px) calc(100vw - 32px), 600px" />

                {/* The zone and product share one square coordinate system at every viewport size. */}
                {(hasArtwork || currentStep === 3) && currentPrintZone && (
                  <div
                    className={`canvas-print-zone ${hasArtwork ? "has-image" : ""} ${currentStep === 3 ? "is-editable" : "is-preview"}`}
                    style={getPrintZoneStyle(currentPrintZone)}
                    aria-label={`Допустимая область печати: ${selectedItem.label}, ${viewAngle}`}
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) setSelectedElementId(null);
                    }}
                  >
                    {snapGuides.vertical && <span className="canvas-center-guide vertical" aria-hidden="true" />}
                    {snapGuides.horizontal && <span className="canvas-center-guide horizontal" aria-hidden="true" />}
                    {!hasArtwork && currentStep === 3 && (
                      <button
                        type="button"
                        className={`canvas-upload-trigger ${compactPrintZone ? "compact" : ""}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleFile(event.dataTransfer.files[0]);
                        }}
                        aria-label="Загрузить изображение"
                        title="Загрузить изображение"
                      >
                        <ConfigIcon name="upload" size={compactPrintZone ? 17 : 22}/>
                        <span>Загрузить макет</span>
                      </button>
                    )}
                    {!hasArtwork && currentStep !== 3 && currentPrintZone.width / currentPrintZone.canvas >= 0.18 && (
                      <span className="print-zone-label">
                        {currentPrintZone.width / currentPrintZone.canvas < 0.25 ? "Принт" : "Зона печати"}
                      </span>
                    )}
                    {currentElements.map((element) => (
                      <button
                        key={element.id}
                        className={`canvas-design-element design-element-${element.type} ${currentStep === 3 && selectedElementId === element.id ? "selected" : ""}`}
                        style={{
                          left: `${element.x}%`,
                          top: `${element.y}%`,
                          aspectRatio: element.type === "shape" ? "1" : undefined,
                          width: element.type !== "text" || (element.curve ?? 0) !== 0
                            ? `${element.width}%`
                            : undefined,
                          color: element.color,
                          fontFamily: element.fontFamily,
                          fontWeight: element.fontWeight,
                          fontStyle: element.fontStyle,
                          letterSpacing: element.type === "text" ? `${element.letterSpacing ?? 0}px` : undefined,
                          textAlign: element.textAlign,
                          WebkitTextStroke: element.type === "text" && element.outlined
                            ? `0.8px ${getContrastingOutlineColor(element.color)}`
                            : undefined,
                          transform: `translate(-50%, -50%) rotate(${element.rotation}deg) scale(${element.scale})`,
                        }}
                        type="button"
                        aria-label={`${element.type === "image" ? "Изображение" : element.type === "shape" ? "Графика" : "Текст"}: ${element.name}`}
                        onPointerDown={(event) => startMoveGesture(event, element)}
                        onPointerMove={handleTransformMove}
                        onPointerUp={finishTransformGesture}
                        onPointerCancel={finishTransformGesture}
                        onTouchStart={(event) => handleElementTouchStart(event, element)}
                        onTouchMove={(event) => handleElementTouchMove(event, element)}
                        onTouchEnd={handleElementTouchEnd}
                        onTouchCancel={handleElementTouchEnd}
                      >
                        {element.type === "image" ? (
                          <>
                            {/* Uploaded data URLs are already client-side data and cannot benefit from Next image optimization. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={element.content} alt="" draggable={false} />
                          </>
                        ) : element.type === "shape" ? (
                          <GraphicShape id={element.content as GraphicShapeId} className="canvas-shape-svg" />
                        ) : (element.curve ?? 0) !== 0 ? (
                          <svg className="curved-text-svg" viewBox="0 0 300 160" aria-hidden="true">
                            <defs>
                              <path id={`text-curve-${element.id}`} d={`M 16 100 Q 150 ${100 - (element.curve ?? 0) * 0.65} 284 100`} />
                            </defs>
                            <text
                              fill={element.color}
                              stroke={element.outlined ? getContrastingOutlineColor(element.color) : "none"}
                              strokeWidth={element.outlined ? 2 : 0}
                              paintOrder="stroke"
                              fontFamily={element.fontFamily}
                              fontWeight={element.fontWeight}
                              fontStyle={element.fontStyle}
                              fontSize={element.content.length > 17 ? 21 : element.content.length > 11 ? 26 : 32}
                              letterSpacing={element.letterSpacing ?? 0}
                            >
                              <textPath href={`#text-curve-${element.id}`} startOffset="50%" textAnchor="middle">
                                {element.content.replace(/\s+/g, " ")}
                              </textPath>
                            </text>
                          </svg>
                        ) : (
                          <span>{element.content}</span>
                        )}
                        {selectedElementId === element.id && currentStep === 3 && (
                          <>
                            <span
                              className="design-resize-handle"
                              style={getResizeHandleStyle(currentPrintZone, element, workspaceZoomed)}
                              aria-hidden="true"
                              onPointerDown={(event) => startResizeGesture(event, element)}
                              onPointerMove={(event) => { event.stopPropagation(); handleTransformMove(event); }}
                              onPointerUp={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                              onPointerCancel={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                            />
                            <span
                              className="design-rotate-handle"
                              style={getRotateHandleStyle(currentPrintZone, element, workspaceZoomed)}
                              aria-hidden="true"
                              onPointerDown={(event) => startRotateGesture(event, element)}
                              onPointerMove={(event) => { event.stopPropagation(); handleTransformMove(event); }}
                              onPointerUp={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                              onPointerCancel={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                            >
                              <ConfigIcon name="rotate" size={16}/>
                            </span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {currentStep === 3 && !currentPrintZone && (
                  <div className="print-zone-unavailable">На этом ракурсе нанесение недоступно</div>
                )}
                </div>
                {currentStep === 3 && currentPrintZone && selectedElement && (
                  <div
                    className={`canvas-element-toolbar ${selectedElement.type === "text" ? "text-quick-toolbar" : selectedElement.type === "shape" ? "shape-quick-toolbar" : ""}`}
                    style={{
                      ...getElementToolbarStyle(currentPrintZone, selectedElement, workspaceZoomed),
                      ...(selectedElement.type === "shape" && quickTextPanel === "color" ? {
                        top: "12px",
                        left: "50%",
                        width: "min(300px, calc(100vw - 20px))",
                        transform: "translateX(-50%)",
                        transformOrigin: "center top",
                      } : {}),
                    }}
                    role="toolbar"
                    aria-label="Управление выбранным элементом"
                  >
                    {selectedElement.type === "text" ? (
                      <>
                        <div className="text-quick-editor-row">
                          <input
                            type="text"
                            value={selectedElement.content}
                            maxLength={60}
                            onFocus={beginQuickTextEdit}
                            onChange={(event) => updateQuickTextContent(event.target.value)}
                            onBlur={finishQuickTextEdit}
                            aria-label="Текст надписи"
                          />
                          <button type="button" onClick={duplicateSelectedElement} title="Дублировать" aria-label="Дублировать текст">
                            <ConfigIcon name="copy" size={18}/>
                          </button>
                          <button type="button" onClick={deleteSelectedElement} className="danger" title="Удалить" aria-label="Удалить">
                            <ConfigIcon name="trash" size={18}/>
                          </button>
                        </div>

                        <div className="text-quick-controls-row">
                          <button
                            type="button"
                            className="text-quick-font-trigger"
                            style={{
                              display: "inline-flex",
                              justifyContent: "center",
                              fontFamily: selectedElement.fontFamily ?? textFont,
                            }}
                            onClick={() => setQuickTextPanel("font")}
                            aria-expanded={quickTextPanel === "font"}
                            aria-label="Выбрать шрифт текста"
                            title="Шрифт"
                          >
                            <span>{textFontOptions.find((font) => font.value === (selectedElement.fontFamily ?? textFont))?.label ?? "Шрифт"}</span>
                            <ConfigIcon name="chevronDown" size={14}/>
                          </button>
                          <div className="text-quick-size" aria-label="Размер текста">
                            <button type="button" onClick={() => updateSelectedTextQuick({ scale: +clamp(selectedElement.scale - 0.1, 0.35, 2.2).toFixed(2) })} title="Уменьшить" aria-label="Уменьшить текст">
                              <ConfigIcon name="minus" size={17}/>
                            </button>
                            <output>{Math.round(selectedElement.scale * 100)}%</output>
                            <button type="button" onClick={() => updateSelectedTextQuick({ scale: +clamp(selectedElement.scale + 0.1, 0.35, 2.2).toFixed(2) })} title="Увеличить" aria-label="Увеличить текст">
                              <ConfigIcon name="plus" size={17}/>
                            </button>
                          </div>
                          <button type="button" className={selectedElement.fontWeight === 800 ? "active" : ""} onClick={() => updateSelectedTextQuick({ fontWeight: selectedElement.fontWeight === 800 ? 500 : 800 })} aria-pressed={selectedElement.fontWeight === 800} title="Жирный" aria-label="Жирный текст">
                            <ConfigIcon name="bold" size={18}/>
                          </button>
                          <button type="button" className={selectedElement.fontStyle === "italic" ? "active" : ""} onClick={() => updateSelectedTextQuick({ fontStyle: selectedElement.fontStyle === "italic" ? "normal" : "italic" })} aria-pressed={selectedElement.fontStyle === "italic"} title="Курсив" aria-label="Курсив">
                            <ConfigIcon name="italic" size={18}/>
                          </button>
                          <button type="button" onClick={cycleSelectedTextAlignment} title="Выравнивание" aria-label={`Выравнивание: ${selectedElement.textAlign ?? "center"}`}>
                            <ConfigIcon name={selectedElement.textAlign === "left" ? "alignLeft" : selectedElement.textAlign === "right" ? "alignRight" : "alignCenter"} size={18}/>
                          </button>
                        <button type="button" className={quickTextPanel === "curve" ? "active" : ""} onClick={() => setQuickTextPanel((panel) => panel === "curve" ? null : "curve")} aria-expanded={quickTextPanel === "curve"} title="Изгиб" aria-label="Настроить изгиб текста">
                          <ConfigIcon name="curve" size={18}/>
                        </button>
                        <button
                          type="button"
                          className={`text-quick-color ${quickTextPanel === "color" ? "active" : ""}`}
                          onClick={() => setQuickTextPanel((panel) => panel === "color" ? null : "color")}
                          aria-expanded={quickTextPanel === "color"}
                          aria-label="Изменить цвет текста"
                          title="Цвет текста"
                        >
                          <span style={{ backgroundColor: selectedElement.color ?? "#111111" }} />
                        </button>
                        <button type="button" className={quickTextPanel === "more" ? "active" : ""} onClick={() => setQuickTextPanel((panel) => panel === "more" ? null : "more")} aria-expanded={quickTextPanel === "more"} title="Дополнительно" aria-label="Дополнительные настройки текста">
                          <ConfigIcon name="more" size={18}/>
                        </button>
                        </div>

                        {quickTextPanel === "font" && (
                          <div className="text-quick-subpanel text-font-controls">
                            <div className="text-quick-subpanel-head simple">
                              <button type="button" onClick={() => setQuickTextPanel(null)} aria-label="Вернуться к настройкам текста" title="Назад">
                                <ConfigIcon name="arrowLeft" size={17}/>
                              </button>
                              <b>Шрифт</b>
                            </div>
                            <div className="text-quick-font-list" role="radiogroup" aria-label="Выбор шрифта текста">
                              {textFontOptions.map((font) => (
                                <button
                                  key={font.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={(selectedElement.fontFamily ?? textFont) === font.value}
                                  className={(selectedElement.fontFamily ?? textFont) === font.value ? "active" : ""}
                                  style={{ fontFamily: font.value }}
                                  onClick={() => updateSelectedTextQuick({ fontFamily: font.value })}
                                >
                                  <span>Принт</span>
                                  <small>{font.label}</small>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {quickTextPanel === "color" && (
                          <div className="text-quick-subpanel text-color-controls">
                            <div className="text-quick-subpanel-head simple">
                              <button type="button" onClick={() => setQuickTextPanel(null)} aria-label="Вернуться к настройкам текста" title="Назад">
                                <ConfigIcon name="arrowLeft" size={17}/>
                              </button>
                              <b>Цвет текста</b>
                            </div>
                            <div className="text-color-swatches" role="radiogroup" aria-label="Выбор цвета текста">
                              {textColorOptions.map((textColor) => (
                                <button
                                  key={textColor.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={(selectedElement.color ?? "#111111") === textColor.value}
                                  className={(selectedElement.color ?? "#111111") === textColor.value ? "active" : ""}
                                  onClick={() => {
                                    updateSelectedTextQuick({ color: textColor.value });
                                    setQuickTextPanel(null);
                                  }}
                                  aria-label={textColor.label}
                                  title={textColor.label}
                                >
                                  <span style={{ backgroundColor: textColor.value }} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {quickTextPanel === "curve" && (
                          <div className="text-quick-subpanel text-curve-controls">
                            <div className="text-quick-subpanel-head">
                              <button type="button" onClick={() => setQuickTextPanel(null)} aria-label="Вернуться к настройкам текста" title="Назад">
                                <ConfigIcon name="arrowLeft" size={17}/>
                              </button>
                              <b>Изгиб</b>
                              <input type="range" min="-100" max="100" step="5" value={selectedElement.curve ?? 0} onChange={(event) => updateSelectedTextQuick({ curve: Number(event.target.value) })} aria-label="Сила изгиба" />
                              <output>{selectedElement.curve ?? 0}%</output>
                            </div>
                            <div className="text-curve-presets" role="group" aria-label="Форма текста">
                              <button type="button" className={(selectedElement.curve ?? 0) === 0 ? "active" : ""} onClick={() => updateSelectedTextQuick({ curve: 0 })}>Прямо</button>
                              <button type="button" className={(selectedElement.curve ?? 0) > 0 ? "active" : ""} onClick={() => updateSelectedTextQuick({ curve: 55 })}>Дуга вверх</button>
                              <button type="button" className={(selectedElement.curve ?? 0) < 0 ? "active" : ""} onClick={() => updateSelectedTextQuick({ curve: -55 })}>Дуга вниз</button>
                            </div>
                          </div>
                        )}

                        {quickTextPanel === "more" && (
                          <div className="text-quick-subpanel text-more-controls">
                            <div className="text-quick-subpanel-head simple">
                              <button type="button" onClick={() => setQuickTextPanel(null)} aria-label="Вернуться к настройкам текста" title="Назад">
                                <ConfigIcon name="arrowLeft" size={17}/>
                              </button>
                              <b>Дополнительно</b>
                            </div>
                            <div className="text-more-controls-row">
                              <button type="button" className={selectedElement.outlined ? "active" : ""} onClick={() => updateSelectedTextQuick({ outlined: !selectedElement.outlined })} aria-pressed={selectedElement.outlined}>
                                <ConfigIcon name="type" size={17}/> Контур
                              </button>
                              <label>
                                <span>Интервал</span>
                                <input type="range" min="0" max="6" step="0.5" value={Math.max(0, selectedElement.letterSpacing ?? 0)} onChange={(event) => updateSelectedTextQuick({ letterSpacing: Number(event.target.value) })} />
                                <output>{selectedElement.letterSpacing ?? 0}px</output>
                              </label>
                            </div>
                          </div>
                        )}
                      </>
                    ) : selectedElement.type === "shape" ? (
                      <>
                        {quickTextPanel === "color" ? (
                          <div className="text-quick-subpanel shape-color-controls">
                            <div className="text-quick-subpanel-head simple">
                              <button type="button" onClick={() => setQuickTextPanel(null)} aria-label="Вернуться к настройкам графики" title="Назад">
                                <ConfigIcon name="arrowLeft" size={17}/>
                              </button>
                              <b>Цвет графики</b>
                            </div>
                            <div className="text-color-swatches" role="radiogroup" aria-label="Выбор цвета графики">
                              {textColorOptions.map((graphicColor) => (
                                <button
                                  key={graphicColor.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={(selectedElement.color ?? "#111111") === graphicColor.value}
                                  className={(selectedElement.color ?? "#111111") === graphicColor.value ? "active" : ""}
                                  onClick={() => {
                                    updateSelectedElement({ color: graphicColor.value });
                                    setQuickTextPanel(null);
                                  }}
                                  aria-label={graphicColor.label}
                                  title={graphicColor.label}
                                >
                                  <span style={{ backgroundColor: graphicColor.value }} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <>
                            <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale - 0.1, 0.3, 2.4).toFixed(2) })} title="Уменьшить" aria-label="Уменьшить графику">
                              <ConfigIcon name="minus" size={18}/>
                            </button>
                            <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale + 0.1, 0.3, 2.4).toFixed(2) })} title="Увеличить" aria-label="Увеличить графику">
                              <ConfigIcon name="plus" size={18}/>
                            </button>
                            <button type="button" onClick={() => updateSelectedElement({ rotation: selectedElement.rotation - 15 })} title="Повернуть влево" aria-label="Повернуть графику влево">
                              <ConfigIcon name="rotate" size={18}/>
                            </button>
                            <button type="button" onClick={() => updateSelectedElement({ rotation: selectedElement.rotation + 15 })} title="Повернуть вправо" aria-label="Повернуть графику вправо">
                              <span className="mirrored-icon"><ConfigIcon name="rotate" size={18}/></span>
                            </button>
                            <button
                              type="button"
                              className="text-quick-color"
                              onClick={() => setQuickTextPanel("color")}
                              aria-expanded={false}
                              aria-label="Изменить цвет графики"
                              title="Цвет графики"
                            >
                              <span style={{ backgroundColor: selectedElement.color ?? "#111111" }} />
                            </button>
                            <button type="button" onClick={duplicateSelectedElement} title="Дублировать" aria-label="Дублировать графику">
                              <ConfigIcon name="copy" size={18}/>
                            </button>
                            <button type="button" onClick={deleteSelectedElement} className="danger" title="Удалить" aria-label="Удалить графику">
                              <ConfigIcon name="trash" size={18}/>
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale - 0.1, 0.35, 2.2).toFixed(2) })} title="Уменьшить" aria-label="Уменьшить">
                          <ConfigIcon name="minus" size={18}/>
                        </button>
                        <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale + 0.1, 0.35, 2.2).toFixed(2) })} title="Увеличить" aria-label="Увеличить">
                          <ConfigIcon name="plus" size={18}/>
                        </button>
                        <button type="button" onClick={duplicateSelectedElement} title="Дублировать" aria-label="Дублировать изображение">
                          <ConfigIcon name="copy" size={18}/>
                        </button>
                        <button type="button" onClick={deleteSelectedElement} className="danger" title="Удалить" aria-label="Удалить">
                          <ConfigIcon name="trash" size={18}/>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {currentStep === 3 && currentPrintZone && hasArtwork && (
                  <button
                    type="button"
                    className={`canvas-workspace-zoom ${workspaceZoomed ? "active" : ""}`}
                    onClick={() => setWorkspaceZoomed((zoomed) => !zoomed)}
                    aria-pressed={workspaceZoomed}
                    aria-label={workspaceZoomed ? "Показать товар целиком" : "Приблизить рабочую область"}
                    title={workspaceZoomed ? "Показать товар целиком" : "Приблизить рабочую область"}
                  >
                    <ConfigIcon name={workspaceZoomed ? "zoomOut" : "zoom"} size={21}/>
                  </button>
                )}
              {currentStep === 2 && (
                <div className="stage-view-navigation" aria-label="Ракурс изделия">
                  <button type="button" onClick={() => cycleViewAngle(-1)} aria-label="Предыдущий ракурс">
                    <ConfigIcon name="chevronLeft" size={22}/>
                  </button>
                  <button type="button" onClick={() => cycleViewAngle(1)} aria-label="Следующий ракурс">
                    <ConfigIcon name="chevronRight" size={22}/>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
        )}

        {/* Right Column: Step Controls Form */}
        <div className="config-controls-panel">
          {/* STEP 1: ITEM */}
          {currentStep === 1 && (
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>Выберите изделие</h2>
                <p>Базовые модели премиум качества с идеальной посадкой по фигуре.</p>
              </div>

              <div className="product-tiles-grid">
                {availableItems.map((i) => (
                  <button
                    key={i.id}
                    className={`product-tile catalog-card ${item === i.id ? "selected" : ""}`}
                    onClick={() => {
                      setItem(i.id);
                      const nextSizes = resolveSizes(i.id);
                      setGarmentSize(nextSizes.find((size) => size.id === "m")?.id ?? nextSizes[0].id);
                      const availColors = resolveColors(i.id);
                      if (!availColors.some((c) => c.id === color)) {
                        setColor(availColors[0].id);
                      }
                      const nextPlacements = getAvailablePlacementsForItem(i.id);
                      if (!nextPlacements.some((placementOption) => placementOption.id === placement) || !getPrintZone(i.id, viewAngle)) {
                        setPlacement("center");
                        setViewAngle("front");
                      }
                      setCurrentStep(2);
                    }}
                  >
                    <ConfigIcon name={i.icon} size={48} />
                    <div className="tile-info">
                      <b>{i.label}</b>
                      <small>{i.note}</small>
                      <span className="tile-price">от {i.base} BYN</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="step-actions-row desktop-only mt-6">
                <button className="button button-primary wide" onClick={() => setCurrentStep(2)}>
                  Далее: Выбор цвета <ConfigIcon name="arrowRight" size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: COLOR */}
          {currentStep === 2 && (
            <div className="step-pane product-options-pane animate-fade">
              <div className="step-pane-header product-options-header">
                <span className="product-options-kicker">{selectedItem.label}</span>
                <h2>Цвет и размер</h2>
                <p>Выберите вариант изделия. Макет можно будет добавить на следующем экране.</p>
              </div>

              <section className="product-option-section">
                <div className="product-option-heading">
                  <div>
                    <h3>Цвет</h3>
                    <p>{selectedColor.label}</p>
                  </div>
                  <span className="selected-color-preview" style={{ backgroundColor: selectedColor.hex, borderColor: selectedColor.border }} aria-hidden="true" />
                </div>
                <div className="product-color-grid">
                  {availableColors.map((c) => (
                    <button
                      key={c.id}
                      className={`product-color-option ${color === c.id ? "selected" : ""}`}
                      onClick={() => setColor(c.id)}
                      type="button"
                      aria-pressed={color === c.id}
                      aria-label={c.label}
                    >
                      <span className="product-color-swatch" style={{ backgroundColor: c.hex, borderColor: c.border }}>
                        {color === c.id && <ConfigIcon name="check" size={15}/>}
                      </span>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="product-option-section size-option-section">
                <div className="product-option-heading">
                  <div>
                    <h3>Размер</h3>
                    <p>{selectedGarmentSize.label}</p>
                  </div>
                  {(item === "shirt" || item === "hoodie" || item === "polo") && (
                    <span className="fit-note">Унисекс · стандартная посадка</span>
                  )}
                </div>

                <div className={`garment-size-grid ${availableGarmentSizes.length === 1 ? "single-size" : ""}`}>
                  {availableGarmentSizes.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      className={garmentSize === size.id ? "selected" : ""}
                      onClick={() => setGarmentSize(size.id)}
                      aria-pressed={garmentSize === size.id}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>

                {(item === "shirt" || item === "hoodie" || item === "polo") && (
                  <details className="size-guide-details">
                    <summary>Как выбрать размер</summary>
                    <div className="size-guide-table-wrap">
                      <table className="size-guide-table">
                        <thead><tr><th>Размер</th><th>Обхват груди, см</th><th>Рост, см</th></tr></thead>
                        <tbody>
                          {garmentSizeGuide
                            .filter((row) => availableGarmentSizes.some((size) => size.id === row.size))
                            .map((row) => (
                              <tr key={row.size}><td>{row.size}</td><td>{row.chest}</td><td>{row.height}</td></tr>
                            ))}
                        </tbody>
                      </table>
                      <p className="size-guide-note">Ориентировочные значения. Точные замеры зависят от выбранной модели.</p>
                    </div>
                  </details>
                )}
              </section>

              <div className="step-actions-row desktop-only mt-6">
                <button className="button outline" onClick={() => setCurrentStep(1)}>
                  <ConfigIcon name="arrowLeft" size={18}/> Назад
                </button>
                <button className="button button-primary" onClick={advanceStep}>
                  Далее: Создать макет <ConfigIcon name="arrowRight" size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: UPLOAD & POSITIONING */}
          {currentStep === 3 && (
            <div className="step-pane designer-pane animate-fade">
              <div className="step-pane-header">
                <h2>Создайте макет</h2>
                <p>Добавьте изображение, текст или графику. Перемещайте выбранный элемент прямо на товаре.</p>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  handleFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />

              <div className="designer-tool-tabs" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} role="tablist" aria-label="Инструменты конструктора">
                {[
                  { id: "image", label: "Изображение", icon: "image" },
                  { id: "text", label: "Текст", icon: "type" },
                  { id: "graphics", label: "Графика", icon: "shapes" },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    role="tab"
                    aria-selected={activeDesignerTool === tool.id}
                    className={activeDesignerTool === tool.id ? "active" : ""}
                    onClick={() => setActiveDesignerTool(tool.id as DesignerTool)}
                  >
                    <ConfigIcon name={tool.icon} size={20}/>
                    <span>{tool.label}</span>
                  </button>
                ))}
              </div>

              <div className="designer-tool-panel">
                {activeDesignerTool === "image" && (
                  <div className="designer-image-panel">
                    <div
                      className="upload-dropzone designer-upload"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }}
                    >
                      <span className="upload-icon-wrap"><ConfigIcon name="upload" size={24}/></span>
                      <div className="upload-prompt">
                        <p><b>Добавьте логотип или изображение</b></p>
                        <small>PNG, JPG или WebP · до 10 МБ · не более 5 файлов</small>
                      </div>
                      <button className="button button-primary button-small" type="button" onClick={() => inputRef.current?.click()}>
                        Выбрать файл
                      </button>
                    </div>
                    {fileError && <div className="designer-message error"><ConfigIcon name="warning" size={16}/>{fileError}</div>}
                    {selectedElement?.type === "image" && (
                      <div className={`designer-message quality ${selectedElement.quality === "low" ? "warning" : "good"}`}>
                        <ConfigIcon name={selectedElement.quality === "low" ? "warning" : "check"} size={16}/>
                        <span>
                          {selectedElement.quality === "vector" && "Векторный файл — подходит для печати"}
                          {selectedElement.quality === "good" && "Высокое качество изображения"}
                          {selectedElement.quality === "medium" && "Качество достаточное для среднего принта"}
                          {selectedElement.quality === "low" && "Низкое разрешение — изображение может быть размытым"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {activeDesignerTool === "text" && (
                  <div className="designer-text-store">
                    <div className="designer-add-text">
                      <div>
                        <b>Свой текст</b>
                        <span>Добавьте надпись и отредактируйте её прямо на изделии</span>
                      </div>
                      <button type="button" className="button button-primary" onClick={addPlainText}>
                        <ConfigIcon name="plus" size={18}/>
                        Добавить текст
                      </button>
                    </div>
                    <div className="designer-font-picker">
                      <span className="designer-control-label">Шрифт</span>
                      <div className="designer-font-list" role="radiogroup" aria-label="Шрифт текста">
                        {textFontOptions.map((font) => (
                          <button
                            key={font.value}
                            type="button"
                            role="radio"
                            aria-checked={textFont === font.value}
                            className={textFont === font.value ? "active" : ""}
                            style={{ fontFamily: font.value }}
                            onClick={() => setTextFont(font.value)}
                          >
                            <span>Принт</span>
                            <small>{font.label}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="designer-text-presets">
                      <div className="designer-store-heading">
                        <span className="designer-control-label">Магазин надписей</span>
                        <small>Готовые стили</small>
                      </div>
                      <div className="text-preset-grid">
                        {textPresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`text-preset-card preset-${preset.id}`}
                            onClick={() => addTextPreset(preset)}
                            aria-label={`Добавить шаблон: ${preset.label}`}
                          >
                            <span
                              className={preset.curve !== 0 ? "preset-curved" : ""}
                              style={{
                                color: preset.color,
                                fontFamily: preset.fontFamily,
                                fontWeight: preset.fontWeight,
                                fontStyle: preset.fontStyle,
                                letterSpacing: `${preset.letterSpacing}px`,
                                WebkitTextStroke: preset.outlined ? "0.7px #111827" : undefined,
                              }}
                            >
                              {preset.content}
                            </span>
                            <small>{preset.label}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeDesignerTool === "graphics" && (
                  <div className="designer-graphics-store" style={{ minWidth: 0, display: "grid", gap: 10 }}>
                    <div className="designer-store-heading">
                      <span className="designer-control-label">Магазин графики</span>
                      <small>{graphicShapes.length + graphicClipart.length} элементов</small>
                    </div>
                    {graphicCollections.map((collection, collectionIndex) => (
                      <section
                        key={collection.id}
                        className="graphic-collection"
                        style={{
                          minWidth: 0,
                          display: "grid",
                          gap: 7,
                          marginTop: collectionIndex ? 8 : 0,
                          paddingTop: collectionIndex ? 16 : 0,
                          borderTop: collectionIndex ? "1px solid #e5e7eb" : 0,
                        }}
                      >
                        <div className="graphic-collection-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <b style={{ color: "#111827", fontSize: 12 }}>{collection.label}</b>
                          <span style={{ minWidth: 22, padding: "2px 6px", borderRadius: 4, background: "#eef0f3", color: "#6b7280", fontSize: 9, fontWeight: 800, textAlign: "center" }}>{collection.items.length}</span>
                        </div>
                        <div className="graphic-shape-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                          {collection.items.map((graphic) => (
                            <button
                              key={graphic.id}
                              type="button"
                              className="graphic-shape-card"
                              style={{
                                minWidth: 0,
                                aspectRatio: "1",
                                padding: "12px 9px 7px",
                                display: "grid",
                                gridTemplateRows: "minmax(0, 1fr) auto",
                                placeItems: "center",
                                gap: 7,
                                overflow: "hidden",
                                border: "1px solid #d1d5db",
                                borderRadius: 8,
                                backgroundColor: "#ffffff",
                                color: graphic.color,
                                cursor: "pointer",
                              }}
                              onClick={() => addGraphic(graphic)}
                              aria-label={`Добавить графику: ${graphic.label}`}
                            >
                              <span style={{ width: "min(82%, 104px)", height: "min(82%, 104px)" }}>
                                <GraphicShape id={graphic.id} className="graphic-shape-preview" />
                              </span>
                              <small style={{ width: "calc(100% + 18px)", margin: "0 -9px -7px", padding: "6px 7px", borderTop: "1px solid #e5e7eb", color: "#6b7280", fontSize: 9, fontWeight: 800, textAlign: "left" }}>{graphic.label}</small>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

              </div>

              {currentElements.length > 0 && (
                <div className="designer-elements-row">
                  <span className="designer-elements-label">На этой стороне</span>
                  <div className="designer-element-chips">
                    {currentElements.map((element, index) => (
                      <button
                        key={element.id}
                        type="button"
                        className={selectedElementId === element.id ? "active" : ""}
                        onClick={() => selectDesignElement(element)}
                      >
                        <ConfigIcon name={element.type === "image" ? "image" : element.type === "shape" ? "shapes" : "type"} size={15}/>
                        <span>{element.type === "image" || element.type === "shape" ? element.name : element.content || `Текст ${index + 1}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="step-actions-row desktop-only">
                <button className="button outline" onClick={() => setCurrentStep(2)}>
                  <ConfigIcon name="arrowLeft" size={18}/> Назад
                </button>
                <button className="button button-primary" onClick={() => setCurrentStep(4)}>
                  Далее: Тираж и цена <ConfigIcon name="arrowRight" size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: METHOD, AUTOMATIC FORMAT & QUANTITY */}
          {currentStep === 4 && (
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>Печать и тираж</h2>
                <p>Выберите способ нанесения и укажите количество изделий.</p>
              </div>

              <div className="section-block">
                <div className="section-heading-row">
                  <h3>Технология нанесения</h3>
                  <span>Цена указана за одно изделие</span>
                </div>
                <div className="methods-stack">
                  {availableMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`method-select-card ${selectedMethod.id === m.id ? "selected" : ""}`}
                      onClick={() => setMethod(m.id)}
                      aria-pressed={selectedMethod.id === m.id}
                    >
                      <span className="method-icon"><ConfigIcon name={m.icon} size={22}/></span>
                      <div className="method-copy">
                        <span className="method-title-row">
                          <b>{m.label}</b>
                          {recommendedMethod === m.id && <em>Рекомендуем</em>}
                        </span>
                        <small>{m.desc}</small>
                        <span className="method-tags">
                          {m.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </span>
                      </div>
                      <div className="method-choice">
                        <span className="method-add-badge">+{m.add} BYN</span>
                        <span className="method-radio" aria-hidden="true">
                          {selectedMethod.id === m.id && <ConfigIcon name="check" size={14}/>}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-block">
                <h3>Размер нанесения</h3>
                <div className="automatic-format-card">
                  <span className="automatic-format-icon"><ConfigIcon name="target" size={24}/></span>
                  <div className="automatic-format-copy">
                    <small>{printEstimate.isFallback ? "Предварительный формат" : "Рассчитано по вашему макету"}</small>
                    <strong>{selectedSize.label} <span>{selectedSize.dimensions}</span></strong>
                    <p>
                      {printEstimate.isFallback
                        ? "Добавьте макет, и формат пересчитается автоматически."
                        : `Фактический габарит около ${printEstimate.width.toString().replace(".", ",")} × ${printEstimate.height.toString().replace(".", ",")} см.`}
                    </p>
                  </div>
                  <span className="automatic-format-note">Уточним перед печатью</span>
                </div>
              </div>

              <div className="section-block qty-calculator-block">
                <div className="section-heading-row">
                  <h3>Количество изделий</h3>
                  <span>От 1 до 1000 шт.</span>
                </div>
                <div className="quantity-composer">
                  <div className="qty-stepper" aria-label="Количество изделий">
                    <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Уменьшить количество">
                      <ConfigIcon name="minus" size={20}/>
                    </button>
                    <label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={qty}
                        min="1"
                        max="1000"
                        aria-label="Количество изделий"
                        onChange={(e) => setQty(clamp(Number(e.target.value) || 1, 1, 1000))}
                      />
                      <span>шт.</span>
                    </label>
                    <button type="button" onClick={() => setQty((q) => Math.min(1000, q + 1))} aria-label="Увеличить количество">
                      <ConfigIcon name="plus" size={20}/>
                    </button>
                  </div>
                  <div className="quantity-presets" aria-label="Быстрый выбор количества">
                    {quantityPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={qty === preset ? "active" : ""}
                        onClick={() => setQty(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="volume-discount-bar">
                  <div className="discount-summary">
                    <div>
                      <small>Скидка за тираж</small>
                      <b>{discount.percent ? `${discount.percent}%` : "Пока без скидки"}</b>
                    </div>
                    {discount.nextAt && <span>Ещё {discount.nextAt - qty} шт. до следующей скидки</span>}
                  </div>
                  <div className="quantity-discount-scale" aria-label="Пороговые значения скидки">
                    {discountMilestones.map((milestone, index) => (
                      <span key={milestone} className={qty >= milestone ? "active" : ""}>
                        <i />
                        <small>{milestone}{index === discountMilestones.length - 1 ? "+" : ""}</small>
                      </span>
                    ))}
                  </div>
                  <div className="unit-sum-display">
                    <span>За одно изделие <b>{unitPrice} BYN</b></span>
                    <span>Итого <strong>{totalPrice} BYN</strong></span>
                  </div>
                </div>
              </div>

              <div className="step-actions-row desktop-only">
                <button className="button outline" onClick={() => setCurrentStep(3)}>
                  <ConfigIcon name="arrowLeft" size={18}/> Назад
                </button>
                <button className="button button-primary" onClick={() => setCurrentStep(5)}>
                  Далее: Оформить заказ <ConfigIcon name="arrowRight" size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: ORDER CONFIRMATION */}
          {currentStep === 5 && (
            <div className="step-pane animate-fade">
              {!submitted ? (
                <>
                  <div className="step-pane-header">
                    <h2>Оформление заказа</h2>
                    <p>Оставьте контакты — менеджер проверит макет и подтвердит итоговую стоимость.</p>
                  </div>

                  <div className="checkout-summary">
                    <div className="checkout-summary-heading">
                      <div>
                        <small>Ваш расчёт</small>
                        <h3>{selectedItem.label}, {qty} шт.</h3>
                      </div>
                      <span>{discount.percent ? `Скидка ${discount.percent}%` : "Базовая цена"}</span>
                    </div>
                    <div className="checkout-summary-list">
                      <div className="checkout-summary-item">
                        <span className="checkout-summary-icon"><ConfigIcon name="shirt" size={19}/></span>
                        <div><small>Изделие</small><b>{selectedColor.label} · {selectedGarmentSize.label}</b></div>
                        <button type="button" onClick={() => setCurrentStep(2)} aria-label="Изменить изделие" title="Изменить изделие"><ConfigIcon name="edit" size={16}/></button>
                      </div>
                      <div className="checkout-summary-item">
                        <span className="checkout-summary-icon"><ConfigIcon name="upload" size={19}/></span>
                        <div><small>Макет</small><b>{designElementsCount ? `${designElementsCount} элем. · ${selectedPlacementCopy.label}` : "Макет не добавлен"}</b></div>
                        <button type="button" onClick={() => setCurrentStep(3)} aria-label="Изменить макет" title="Изменить макет"><ConfigIcon name="edit" size={16}/></button>
                      </div>
                      <div className="checkout-summary-item">
                        <span className="checkout-summary-icon"><ConfigIcon name="layers" size={19}/></span>
                        <div><small>Печать и тираж</small><b>{selectedMethod.label} · {selectedSize.label} · {qty} шт.</b></div>
                        <button type="button" onClick={() => setCurrentStep(4)} aria-label="Изменить печать и тираж" title="Изменить печать и тираж"><ConfigIcon name="edit" size={16}/></button>
                      </div>
                    </div>
                    <div className="checkout-total-row">
                      <span><small>{qty} шт. × {unitPrice} BYN</small><b>Предварительная стоимость</b></span>
                      <strong>{totalPrice} BYN</strong>
                    </div>
                  </div>

                  <form id="order-checkout-form" className="checkout-form" onSubmit={handleSubmitOrder}>
                    <section className="checkout-section">
                      <div className="checkout-section-heading">
                        <span>1</span>
                        <div><h3>Контактные данные</h3><p>Кому отправить подтверждение расчёта</p></div>
                      </div>
                      <div className="checkout-form-grid">
                        <div className="form-group">
                          <label htmlFor="customer-name">Ваше имя <span className="req">*</span></label>
                          <input
                            id="customer-name"
                            type="text"
                            required
                            autoComplete="name"
                            placeholder="Александр"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="customer-phone">Номер телефона <span className="req">*</span></label>
                          <input
                            id="customer-phone"
                            type="tel"
                            required
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="+375 (29) 000-00-00"
                            value={customerPhone}
                            aria-invalid={Boolean(phoneError)}
                            aria-describedby={phoneError ? "customer-phone-error" : undefined}
                            onChange={(e) => {
                              setCustomerPhone(e.target.value);
                              if (phoneError) setPhoneError("");
                            }}
                          />
                          {phoneError && <small id="customer-phone-error" className="form-field-error" role="alert">{phoneError}</small>}
                        </div>
                      </div>
                      <div className="checkout-choice-label">Как удобнее связаться</div>
                      <div className="checkout-segmented" role="group" aria-label="Предпочтительный способ связи">
                        <button type="button" className={contactMethod === "phone" ? "selected" : ""} onClick={() => setContactMethod("phone")} aria-pressed={contactMethod === "phone"}>
                          <ConfigIcon name="phone" size={17}/> Позвонить
                        </button>
                        <button type="button" className={contactMethod === "telegram" ? "selected" : ""} onClick={() => setContactMethod("telegram")} aria-pressed={contactMethod === "telegram"}>
                          <ConfigIcon name="message" size={17}/> Написать в Telegram
                        </button>
                      </div>
                    </section>

                    <section className="checkout-section">
                      <div className="checkout-section-heading">
                        <span>2</span>
                        <div><h3>Получение заказа</h3><p>Способ и стоимость доставки подтвердит менеджер</p></div>
                      </div>
                      <div className="fulfillment-options">
                        <button type="button" className={fulfillmentMethod === "pickup" ? "selected" : ""} onClick={() => setFulfillmentMethod("pickup")} aria-pressed={fulfillmentMethod === "pickup"}>
                          <ConfigIcon name="pin" size={21}/>
                          <span><b>Самовывоз</b><small>Минск, ул. Октябрьская, 16</small></span>
                          <i>{fulfillmentMethod === "pickup" && <ConfigIcon name="check" size={13}/>}</i>
                        </button>
                        <button type="button" className={fulfillmentMethod === "delivery" ? "selected" : ""} onClick={() => setFulfillmentMethod("delivery")} aria-pressed={fulfillmentMethod === "delivery"}>
                          <ConfigIcon name="truck" size={21}/>
                          <span><b>Доставка</b><small>По Минску и Беларуси</small></span>
                          <i>{fulfillmentMethod === "delivery" && <ConfigIcon name="check" size={13}/>}</i>
                        </button>
                      </div>
                      {fulfillmentMethod === "delivery" && (
                        <div className="form-group checkout-address-field">
                          <label htmlFor="delivery-address">Город и адрес доставки <span className="req">*</span></label>
                          <input
                            id="delivery-address"
                            type="text"
                            required
                            autoComplete="street-address"
                            placeholder="Минск, ул. ..."
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                          />
                        </div>
                      )}
                    </section>

                    <section className="checkout-section checkout-comment-section">
                      <div className="form-group">
                        <label htmlFor="customer-comment">Комментарий <span>необязательно</span></label>
                        <textarea
                          id="customer-comment"
                          rows={3}
                          placeholder="Распределение размеров по тиражу, срок или другие пожелания"
                          value={customerComment}
                          onChange={(e) => setCustomerComment(e.target.value)}
                        />
                      </div>
                    </section>

                    <div className="checkout-submit-row desktop-only">
                      <button type="button" className="button outline" onClick={() => setCurrentStep(4)}>
                        <ConfigIcon name="arrowLeft" size={18}/> Назад
                      </button>
                      <button type="submit" className="button button-primary wide" disabled={submitting}>
                        {submitting ? "Отправляем…" : `Отправить заявку · ${totalPrice} BYN`} {!submitting && <ConfigIcon name="arrowRight" size={18}/>}
                      </button>
                    </div>
                    {submissionError && <p className="checkout-submit-error" role="alert">{submissionError}</p>}
                    <p className="checkout-confirmation-note">Точная стоимость фиксируется после проверки макета менеджером.</p>
                  </form>
                </>
              ) : (
                <div className="success-order-box animate-fade">
                  <div className="success-icon"><ConfigIcon name="check" size={48}/></div>
                  <h2>Заказ №{orderId} принят!</h2>
                  <p>Спасибо, <b>{customerName}</b>. Подтверждение отправим на номер {customerPhone}.</p>
                  <p className="subtext">Менеджер проверит макет, рассчитает получение заказа и свяжется с вами {contactMethod === "telegram" ? "в Telegram" : "по телефону"}.</p>

                  <div className="success-actions">
                    <a className="button button-primary" href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer">
                      Написать менеджеру в Telegram
                    </a>
                    <button className="button outline" onClick={startNewOrder}>
                      Создать новый заказ
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {currentStep === 3 && mobileDesignPanelOpen && (
        <button
          type="button"
          className="mobile-designer-backdrop"
          onClick={() => setMobileDesignPanelOpen(false)}
          aria-label="Закрыть инструменты дизайна"
        />
      )}

      {/* Sticky Mobile Action Footer */}
      {!submitted && currentStep !== 1 && (
        <div className={`mobile-config-sticky-footer ${currentStep === 3 ? "designer-mobile-footer" : ""}`}>
          {currentStep === 3 ? (
            <>
              <div className="designer-mobile-price-row">
                <span>Предварительная цена</span>
                <b>от {selectedItem.base + selectedColor.add} BYN</b>
              </div>
              <div className="designer-mobile-navigation">
                <button type="button" onClick={() => { setMobileDesignPanelOpen(false); setCurrentStep(2); }} aria-label="Назад к цвету и размеру">
                  <ConfigIcon name="arrowLeft" size={24}/>
                </button>
                <button
                  type="button"
                  className={mobileDesignPanelOpen ? "active" : ""}
                  onClick={toggleMobileDesignPanel}
                  aria-expanded={mobileDesignPanelOpen}
                >
                  <ConfigIcon name={mobileDesignPanelOpen ? "check" : "layers"} size={22}/>
                  <span>{mobileDesignPanelOpen ? "Готово" : "Дизайн"}</span>
                </button>
                <button type="button" className="designer-mobile-next" onClick={() => { setMobileDesignPanelOpen(false); setCurrentStep(4); }} aria-label="Перейти к тиражу">
                  <ConfigIcon name="arrowRight" size={24}/>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sticky-price-info">
                {currentStep <= 3 ? (
                  <>
                    <small>Цена изделия</small>
                    <b>от {selectedItem.base + selectedColor.add} BYN</b>
                  </>
                ) : (
                  <>
                    <small>{qty} шт. × {unitPrice} BYN</small>
                    <b>{totalPrice} BYN</b>
                  </>
                )}
              </div>

              <div className="sticky-buttons-group">
                {currentStep > 1 && (
                  <button className="button outline button-small" onClick={() => setCurrentStep((s) => s - 1)} aria-label="Вернуться на предыдущий шаг">
                    <ConfigIcon name="arrowLeft" size={16}/>
                  </button>
                )}
                {currentStep < 5 ? (
                  <button className="button button-primary button-small" onClick={advanceStep}>
                    Далее <ConfigIcon name="arrowRight" size={16}/>
                  </button>
                ) : (
                  <button type="submit" form="order-checkout-form" className="button button-primary button-small" disabled={submitting}>
                    {submitting ? "Отправляем…" : "Оформить"} {!submitting && <ConfigIcon name="arrowRight" size={16}/>}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
