"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";

type ItemId = "shirt" | "hoodie" | "polo" | "cap" | "bag";
type ViewAngle = "front" | "back" | "sleeve_left" | "sleeve_right";
type PlacementId = "center" | "chest_left" | "back" | "sleeve_left" | "sleeve_right";
type DesignerTool = "image" | "text" | "position";
type DesignElementType = "image" | "text";

type DesignElement = {
  id: string;
  type: DesignElementType;
  content: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: 500 | 800;
  quality?: "good" | "medium" | "low" | "vector";
};

type DesignsByView = Record<ViewAngle, DesignElement[]>;

type TransformGesture = {
  mode: "move" | "resize";
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
};

type PrintZone = {
  canvas: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const items = [
  { id: "shirt", label: "Футболка", note: "100% хлопковый трикотаж", base: 15, icon: "shirt" },
  { id: "hoodie", label: "Толстовка", note: "Утеплённый футер 320 г/м²", base: 45, icon: "hoodie" },
  { id: "polo", label: "Поло", note: "Классическое пике 220 г/м²", base: 25, icon: "polo" },
  { id: "cap", label: "Кепка", note: "6-панельная классическая", base: 12, icon: "cap" },
  { id: "bag", label: "Шопер", note: "Плотный натуральный канвас", base: 10, icon: "bag" },
] as const;

const garmentColors = [
  { id: "white", label: "Белый", hex: "#ffffff", border: "#e5e7eb", add: 0 },
  { id: "natural", label: "Натуральный", hex: "#f7ebcd", border: "#e5e7eb", add: 0 },
  { id: "black", label: "Чёрный", hex: "#1a1a1a", border: "#1a1a1a", add: 2 },
  { id: "khaki", label: "Хаки / Олива", hex: "#786c62", border: "#786c62", add: 2 },
  { id: "grey", label: "Меланж", hex: "#5b5d61", border: "#5b5d61", add: 2 },
  { id: "darkgrey", label: "Тёмно-серый", hex: "#4a4b4d", border: "#4a4b4d", add: 2 },
  { id: "navy", label: "Тёмно-синий", hex: "#1a2437", border: "#1a2437", add: 2 },
  { id: "blue", label: "Синий", hex: "#2b49b3", border: "#2b49b3", add: 2 },
  { id: "red", label: "Красный", hex: "#e94711", border: "#e94711", add: 2 },
  { id: "burgundy", label: "Бордовый", hex: "#750033", border: "#750033", add: 2 },
  { id: "green", label: "Зелёный", hex: "#07462c", border: "#07462c", add: 2 },
  { id: "sand", label: "Песочный", hex: "#ebe4dc", border: "#ebe4dc", add: 2 },
];

const methods = {
  dtf: { label: "DTF-печать", desc: "Яркие фото-принты от 1 шт. на любых тканях", add: 4 },
  silk: { label: "Шелкография", desc: "Стойкая краска, выгодно при тираже от 30 шт.", add: 3 },
  embroidery: { label: "Объёмная вышивка", desc: "Премиальный объёмный вид, не истирается", add: 6 },
};

const printSizes = [
  { id: "A7", label: "A7 (7,4 × 10,5 см)", note: "маленький логотип", add: 0 },
  { id: "A6", label: "A6 (10,5 × 14,8 см)", note: "грудь / рукав", add: 2 },
  { id: "A5", label: "A5 (14,8 × 21,0 см)", note: "компактный принт", add: 4 },
  { id: "A4", label: "A4 (21,0 × 29,7 см)", note: "стандартный принт", add: 7 },
  { id: "A3", label: "A3 (29,7 × 42,0 см)", note: "большой спинной принт", add: 11 },
];

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  { n: 2, title: "Цвет", note: "Цвет и ракурс", icon: "target" },
  { n: 3, title: "Макет", note: "Логотип и позиция", icon: "upload" },
  { n: 4, title: "Тираж", note: "Метод и количество", icon: "layers" },
  { n: 5, title: "Заказ", note: "Сводка и отправка", icon: "clipboard" },
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
    rotate: <><path d="M20 7v5h-5"/><path d="M19 12a8 8 0 1 0-2 5"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    trash: <><path d="M5 7h14M9 7V4h6v3m2 0-1 14H8L7 7m4 4v6m3-6v6"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></>,
    type: <><path d="M5 5h14M12 5v14M8 19h8"/></>,
    move: <><path d="M12 2v20m0-20-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12h20M2 12l3-3m-3 3 3 3m17-3-3-3m3 3-3 3"/></>,
    undo: <><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></>,
    minus: <path d="M5 12h14"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    bold: <><path d="M8 5h5a3 3 0 0 1 0 6H8Zm0 6h6a4 4 0 0 1 0 8H8Z"/></>,
    warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4m0 3h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrowRight: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    arrowLeft: <path d="M19 12H5m5-5-5 5 5 5"/>,
    phone: <path d="M6 3h4l2 5-3 2c2 4 4 6 8 8l2-3 4 2v4c-1 2-4 2-6 1C9 19 4 14 2 7 1 5 3 3 6 3Z"/>,
  };
  return <svg className="config-icon" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
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

function getAvailableColorsForItem(itemKey: ItemId) {
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
  const [currentStep, setCurrentStep] = useState(1);
  const [item, setItem] = useState<ItemId>("shirt");
  const [color, setColor] = useState("khaki");
  const [viewAngle, setViewAngle] = useState<ViewAngle>("front");
  const [method, setMethod] = useState<keyof typeof methods>("dtf");
  const [placement, setPlacement] = useState<PlacementId>("center");
  const [sizeFormat, setSizeFormat] = useState("A4");
  const [qty, setQty] = useState(30);
  
  const [fileError, setFileError] = useState("");
  const [designs, setDesigns] = useState<DesignsByView>(createEmptyDesigns);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeDesignerTool, setActiveDesignerTool] = useState<DesignerTool>("image");
  const [textValue, setTextValue] = useState("Ваш текст");
  const [textColor, setTextColor] = useState("#111111");
  const [textFont, setTextFont] = useState("Arial, sans-serif");
  const [textBold, setTextBold] = useState(true);
  const [historyAvailability, setHistoryAvailability] = useState({ undo: 0, redo: 0 });

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<DesignsByView[]>([]);
  const redoRef = useRef<DesignsByView[]>([]);
  const transformGestureRef = useRef<TransformGesture | null>(null);
  const nextElementIdRef = useRef(0);

  const selectedItem = items.find((i) => i.id === item)!;
  const selectedColor = garmentColors.find((c) => c.id === color)!;
  const selectedSize = printSizes.find((s) => s.id === sizeFormat)!;
  const selectedPlacement = placements.find((p) => p.id === placement)!;
  const activeStep = steps.find((s) => s.n === currentStep)!;
  const availablePlacements = getAvailablePlacementsForItem(item);
  const selectedPlacementCopy = getPlacementCopy(item, selectedPlacement);
  const currentPrintZone = getPrintZone(item, viewAngle);
  const currentElements = designs[viewAngle];
  const selectedElement = currentElements.find((element) => element.id === selectedElementId) ?? null;
  const hasArtwork = currentElements.length > 0;
  const designElementsCount = Object.values(designs).reduce((total, elements) => total + elements.length, 0);

  // Authentic Spreadshirt PNG mockups mapped per product, color & view
  const currentMockupImage = useMemo(() => {
    return getMockupPath(item, color, viewAngle);
  }, [item, color, viewAngle]);

  const unitPrice = useMemo(() => {
    const baseUnit = selectedItem.base + selectedColor.add + methods[method].add + selectedSize.add;
    const discountMultiplier = qty >= 200 ? 0.76 : qty >= 100 ? 0.82 : qty >= 50 ? 0.89 : qty >= 20 ? 0.95 : 1;
    return +(baseUnit * discountMultiplier).toFixed(2);
  }, [selectedItem, selectedColor, method, selectedSize, qty]);

  const totalPrice = +(unitPrice * qty).toFixed(2);

  function commitDesigns(nextDesigns: DesignsByView) {
    historyRef.current = [...historyRef.current.slice(-29), designs];
    redoRef.current = [];
    setDesigns(nextDesigns);
    setHistoryAvailability({ undo: historyRef.current.length, redo: 0 });
  }

  function addImageElement(source: string, sourceFile: File, quality: DesignElement["quality"]) {
    const initial = getInitialElementPosition(placement);
    nextElementIdRef.current += 1;
    const newElement: DesignElement = {
      id: `image-${nextElementIdRef.current}`,
      type: "image",
      content: source,
      name: sourceFile.name,
      x: initial.x,
      y: initial.y,
      scale: initial.scale,
      rotation: 0,
      width: 76,
      quality,
    };
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], newElement] });
    setSelectedElementId(newElement.id);
    setFileError("");
  }

  function handleFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["png", "jpg", "jpeg", "webp", "svg"];
    if (!extension || !allowedExtensions.includes(extension)) {
      setFileError("Поддерживаются PNG, JPG, WebP и SVG.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError("Файл больше 20 МБ. Уменьшите его и загрузите снова.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setFileError("Не удалось прочитать файл. Попробуйте другой.");
    reader.onload = () => {
      const source = String(reader.result);
      if (extension === "svg") {
        addImageElement(source, file, "vector");
        return;
      }
      const image = new Image();
      image.onload = () => {
        const shortestSide = Math.min(image.naturalWidth, image.naturalHeight);
        const quality: DesignElement["quality"] = shortestSide >= 1200 ? "good" : shortestSide >= 700 ? "medium" : "low";
        addImageElement(source, file, quality);
      };
      image.onerror = () => setFileError("Изображение повреждено или не поддерживается.");
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
  }

  function addOrUpdateText() {
    const cleanText = textValue.trim();
    if (!cleanText) return;
    if (selectedElement?.type === "text") {
      updateSelectedElement({
        content: cleanText,
        name: cleanText,
        color: textColor,
        fontFamily: textFont,
        fontWeight: textBold ? 800 : 500,
      });
      return;
    }

    const initial = getInitialElementPosition(placement);
    nextElementIdRef.current += 1;
    const newElement: DesignElement = {
      id: `text-${nextElementIdRef.current}`,
      type: "text",
      content: cleanText,
      name: cleanText,
      x: initial.x,
      y: initial.y,
      scale: initial.scale,
      rotation: 0,
      width: 70,
      color: textColor,
      fontFamily: textFont,
      fontWeight: textBold ? 800 : 500,
    };
    commitDesigns({ ...designs, [viewAngle]: [...designs[viewAngle], newElement] });
    setSelectedElementId(newElement.id);
  }

  function selectDesignElement(element: DesignElement) {
    setSelectedElementId(element.id);
    setActiveDesignerTool(element.type);
    if (element.type === "text") {
      setTextValue(element.content);
      setTextColor(element.color ?? "#111111");
      setTextFont(element.fontFamily ?? "Arial, sans-serif");
      setTextBold(element.fontWeight === 800);
    }
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
    };
  }

  function handleTransformMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = transformGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    gesture.moved = true;
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
    updateElementLive(gesture.view, gesture.elementId, {
      x: +clamp(x, halfWidth, 100 - halfWidth).toFixed(2),
      y: +clamp(y, halfHeight, 100 - halfHeight).toFixed(2),
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
  }

  function handleSelectPlacement(pId: PlacementId) {
    setPlacement(pId);
    const targetPlacement = placements.find((p) => p.id === pId);
    if (targetPlacement) {
      setViewAngle(targetPlacement.view as ViewAngle);
      setSelectedElementId(null);
    }
  }

  function handleSubmitOrder(e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    if (!customerPhone.trim()) return;
    const randomId = "BY-" + Math.floor(100000 + Math.random() * 900000);
    setOrderId(randomId);
    setSubmitted(true);
  }

  function handleSelectViewAngle(angle: ViewAngle) {
    setViewAngle(angle);
    setSelectedElementId(null);
    if (angle === "back" && availablePlacements.some((p) => p.id === "back")) setPlacement("back");
    else if (angle === "sleeve_left" && availablePlacements.some((p) => p.id === "sleeve_left")) setPlacement("sleeve_left");
    else if (angle === "sleeve_right" && availablePlacements.some((p) => p.id === "sleeve_right")) setPlacement("sleeve_right");
    else if (angle === "front" && (placement === "back" || placement === "sleeve_left" || placement === "sleeve_right")) {
      setPlacement("center");
    }
  }

  return (
    <main className="config-wizard-page">
      {/* Header */}
      <header className="config-nav-header">
        <div className="config-header-container">
          <Link className="brand" href="/" style={{ gap: '10px' }}>
            <img src="/logo.jpg" alt="Принтопус — центр печати на одежде" className="brand-logo-img" />
            <span className="brand-title"><b>ПРИНТОПУС</b><small>центр печати</small></span>
          </Link>
          <div className="config-header-right">
            <a className="config-phone-link" href="tel:+375295552030">
              <ConfigIcon name="phone" size={16} />
              <span>+375 (29) 555-20-30</span>
            </a>
            <Link href="/" className="button button-small outline">На главную</Link>
          </div>
        </div>
      </header>

      {/* Stepper Header Bar */}
      <div className="config-stepper-wrapper">
        <div className="mobile-step-status" aria-label={`Шаг ${currentStep} из ${steps.length}: ${activeStep.title}`}>
          <div className="mobile-step-status-copy">
            <span>Шаг {currentStep} из {steps.length}</span>
            <b>{activeStep.title}</b>
            <small>{activeStep.note}</small>
          </div>
          <div className="mobile-step-progress" aria-hidden="true">
            <span style={{ width: `${(currentStep / steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="config-stepper-inner">
          {steps.map((s) => {
            const isCompleted = currentStep > s.n;
            const isActive = currentStep === s.n;
            return (
              <button
                key={s.n}
                className={`step-tab ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                onClick={() => setCurrentStep(s.n)}
              >
                <span className="step-num">{isCompleted ? <ConfigIcon name="check" size={14}/> : s.n}</span>
                <span className="step-label">
                  <b>{s.title}</b>
                  <small>{s.note}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Wizard Area */}
      <div className={`config-wizard-body step-${currentStep} ${currentStep === 1 ? "catalog-mode" : ""}`}>
        {/* Left Column: Authentic Spreadshirt Visual Canvas */}
        {currentStep >= 2 && (
        <div className="config-preview-panel">
          <div className="stage-card">
            <div className="stage-header">
              <span className="stage-badge">{selectedItem.label} · {selectedColor.label}</span>
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

            {/* Authentic Spreadshirt Garment Canvas */}
            <div className="garment-stage">
              <div className="garment-canvas" data-product={item} data-view={viewAngle}>
                {/* Authentic Spreadshirt High-Res Render Image */}
                <img src={currentMockupImage} alt={selectedItem.label} className="garment-base-img authentic" />

                {/* The zone and product share one square coordinate system at every viewport size. */}
                {(hasArtwork || currentStep >= 3) && currentPrintZone && (
                  <div
                    className={`canvas-print-zone ${hasArtwork ? "has-image" : ""} ${currentStep === 3 ? "is-editable" : ""}`}
                    style={getPrintZoneStyle(currentPrintZone)}
                    aria-label={`Допустимая область печати: ${selectedItem.label}, ${viewAngle}`}
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) setSelectedElementId(null);
                    }}
                  >
                    {!hasArtwork && currentPrintZone.width / currentPrintZone.canvas >= 0.18 && (
                      <span className="print-zone-label">
                        {currentPrintZone.width / currentPrintZone.canvas < 0.25 ? "Принт" : "Зона печати"}
                      </span>
                    )}
                    {currentElements.map((element) => (
                      <button
                        key={element.id}
                        className={`canvas-design-element design-element-${element.type} ${selectedElementId === element.id ? "selected" : ""}`}
                        style={{
                          left: `${element.x}%`,
                          top: `${element.y}%`,
                          width: element.type === "image" ? `${element.width}%` : undefined,
                          color: element.color,
                          fontFamily: element.fontFamily,
                          fontWeight: element.fontWeight,
                          transform: `translate(-50%, -50%) rotate(${element.rotation}deg) scale(${element.scale})`,
                        }}
                        type="button"
                        aria-label={`${element.type === "image" ? "Изображение" : "Текст"}: ${element.name}`}
                        onPointerDown={(event) => startMoveGesture(event, element)}
                        onPointerMove={handleTransformMove}
                        onPointerUp={finishTransformGesture}
                        onPointerCancel={finishTransformGesture}
                      >
                        {element.type === "image" ? (
                          <img src={element.content} alt="" draggable={false} />
                        ) : (
                          <span>{element.content}</span>
                        )}
                        {selectedElementId === element.id && currentStep === 3 && (
                          <span
                            className="design-resize-handle"
                            aria-hidden="true"
                            onPointerDown={(event) => startResizeGesture(event, element)}
                            onPointerMove={(event) => { event.stopPropagation(); handleTransformMove(event); }}
                            onPointerUp={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                            onPointerCancel={(event) => { event.stopPropagation(); finishTransformGesture(event); }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(hasArtwork || currentStep >= 3) && !currentPrintZone && (
                  <div className="print-zone-unavailable">На этом ракурсе нанесение недоступно</div>
                )}
              </div>
            </div>

            {/* Camera Angle View Selector Thumbnails (Spreadshirt Style) */}
            <div className="view-angle-thumbnails">
              {[
                { id: "front", label: "Спереди", slug: "front" },
                { id: "back", label: "Сзади", slug: "back" },
                ...(item === "bag" ? [] : [
                  { id: "sleeve_right", label: item === "cap" ? "Пр. ракурс" : "Пр. рукав", slug: "sleeve-right" },
                  { id: "sleeve_left", label: item === "cap" ? "Лев. ракурс" : "Лев. рукав", slug: "sleeve-left" },
                ]),
              ].map((v) => {
                const thumbSrc = getMockupPath(item, color, v.id as ViewAngle);
                const isActive = viewAngle === v.id;
                return (
                  <button
                    key={v.id}
                    className={`view-thumb-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectViewAngle(v.id as ViewAngle)}
                    type="button"
                  >
                    <div className="thumb-box">
                      <img src={thumbSrc} alt={v.label} />
                    </div>
                    <span className="thumb-label">{v.label}</span>
                  </button>
                );
              })}
            </div>

            {currentStep === 3 && selectedElement && (
              <div className="canvas-transform-toolbar" aria-label="Настройки выбранного элемента">
                <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale - 0.1, 0.35, 2.2).toFixed(2) })} title="Уменьшить" aria-label="Уменьшить">
                  <ConfigIcon name="minus" size={16}/>
                </button>
                <button type="button" onClick={() => updateSelectedElement({ scale: +clamp(selectedElement.scale + 0.1, 0.35, 2.2).toFixed(2) })} title="Увеличить" aria-label="Увеличить">
                  <ConfigIcon name="plus" size={16}/>
                </button>
                <button type="button" onClick={() => updateSelectedElement({ rotation: (selectedElement.rotation + 15) % 360 })} title="Повернуть на 15 градусов">
                  <ConfigIcon name="rotate" size={16}/><span>15°</span>
                </button>
                <button type="button" onClick={() => updateSelectedElement({ x: 50, y: 46 })} title="Разместить по центру">
                  <ConfigIcon name="target" size={16}/><span>По центру</span>
                </button>
                <button type="button" onClick={deleteSelectedElement} className="danger" title="Удалить" aria-label="Удалить">
                  <ConfigIcon name="trash" size={16}/>
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Right Column: Step Controls Form */}
        <div className="config-controls-panel">
          {/* STEP 1: ITEM */}
          {currentStep === 1 && (
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>1. Выберите изделие</h2>
                <p>Базовые модели премиум качества с идеальной посадкой по фигуре.</p>
              </div>

              <div className="product-tiles-grid">
                {items.map((i) => (
                  <button
                    key={i.id}
                    className={`product-tile catalog-card ${item === i.id ? "selected" : ""}`}
                    onClick={() => {
                      setItem(i.id);
                      const availColors = getAvailableColorsForItem(i.id);
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
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>2. Цвет изделия</h2>
                <p>Выберите цвет и проверьте посадку с разных ракурсов.</p>
              </div>

              <div className="section-block">
                <h3>Цвет ткани</h3>
                <div className="color-swatches-row">
                  {getAvailableColorsForItem(item).map((c) => (
                    <button
                      key={c.id}
                      className={`color-swatch-btn ${color === c.id ? "selected" : ""}`}
                      onClick={() => setColor(c.id)}
                    >
                      <span className="swatch-circle" style={{ backgroundColor: c.hex, borderColor: c.border }} />
                      <span className="swatch-name">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="step-actions-row desktop-only mt-6">
                <button className="button outline" onClick={() => setCurrentStep(1)}>
                  <ConfigIcon name="arrowLeft" size={18}/> Назад
                </button>
                <button className="button button-primary" onClick={() => setCurrentStep(3)}>
                  Далее: Загрузка макета <ConfigIcon name="arrowRight" size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: UPLOAD & POSITIONING */}
          {currentStep === 3 && (
            <div className="step-pane designer-pane animate-fade">
              <div className="step-pane-header">
                <h2>3. Создайте макет</h2>
                <p>Добавьте изображение или текст. Перемещайте выбранный элемент прямо на товаре.</p>
              </div>

              <div className="designer-tool-tabs" role="tablist" aria-label="Инструменты конструктора">
                {[
                  { id: "image", label: "Изображение", icon: "image" },
                  { id: "text", label: "Текст", icon: "type" },
                  { id: "position", label: "Положение", icon: "move" },
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
                        <small>PNG, JPG, WebP или SVG · до 20 МБ</small>
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
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      hidden
                      onChange={(event) => {
                        handleFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                )}

                {activeDesignerTool === "text" && (
                  <div className="designer-text-panel">
                    <label className="designer-field designer-text-field">
                      <span>Надпись</span>
                      <input value={textValue} maxLength={60} onChange={(event) => setTextValue(event.target.value)} placeholder="Введите текст" />
                    </label>
                    <label className="designer-field">
                      <span>Шрифт</span>
                      <select value={textFont} onChange={(event) => setTextFont(event.target.value)}>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Trebuchet MS, sans-serif">Trebuchet</option>
                        <option value="Courier New, monospace">Courier</option>
                      </select>
                    </label>
                    <div className="designer-text-options">
                      <label className="designer-color-control" title="Цвет текста">
                        <span style={{ backgroundColor: textColor }} />
                        <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} aria-label="Цвет текста" />
                        Цвет
                      </label>
                      <button type="button" className={`designer-format-button ${textBold ? "active" : ""}`} onClick={() => setTextBold((value) => !value)} aria-pressed={textBold}>
                        <ConfigIcon name="bold" size={18}/> Жирный
                      </button>
                      <button type="button" className="button button-primary" onClick={addOrUpdateText} disabled={!textValue.trim()}>
                        <ConfigIcon name="plus" size={17}/>
                        {selectedElement?.type === "text" ? "Сохранить" : "Добавить"}
                      </button>
                    </div>
                  </div>
                )}

                {activeDesignerTool === "position" && (
                  <div className="placements-grid designer-placements">
                    {availablePlacements.map((placementOption) => {
                      const placementCopy = getPlacementCopy(item, placementOption);
                      return (
                        <button
                          key={placementOption.id}
                          className={`placement-card ${placement === placementOption.id ? "selected" : ""}`}
                          onClick={() => handleSelectPlacement(placementOption.id)}
                          type="button"
                        >
                          <b>{placementCopy.label}</b>
                          <small>{placementCopy.sub}</small>
                        </button>
                      );
                    })}
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
                        <ConfigIcon name={element.type === "image" ? "image" : "type"} size={15}/>
                        <span>{element.type === "image" ? element.name : element.content || `Текст ${index + 1}`}</span>
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

          {/* STEP 4: METHOD, SIZE & QUANTITY */}
          {currentStep === 4 && (
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>4. Метод нанесения, размер и тираж</h2>
                <p>Чем больше тираж — тем меньше цена за единицу изделия!</p>
              </div>

              <div className="section-block">
                <h3>Технология печати</h3>
                <div className="methods-stack">
                  {Object.entries(methods).map(([key, m]) => (
                    <button
                      key={key}
                      className={`method-select-card ${method === key ? "selected" : ""}`}
                      onClick={() => setMethod(key as keyof typeof methods)}
                    >
                      <div>
                        <b>{m.label}</b>
                        <small>{m.desc}</small>
                      </div>
                      <span className="method-add-badge">+{m.add} BYN</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-block">
                <h3>Размер принта</h3>
                <div className="sizes-chips-row">
                  {printSizes.map((s) => (
                    <button
                      key={s.id}
                      className={`size-chip ${sizeFormat === s.id ? "selected" : ""}`}
                      onClick={() => setSizeFormat(s.id)}
                    >
                      <b>{s.id}</b>
                      <small>{s.note}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-block qty-calculator-block">
                <h3>Количество изделий (Тираж)</h3>
                <div className="qty-control-row">
                  <button onClick={() => setQty((q) => Math.max(1, q - 10))}>−10</button>
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                  <input
                    type="number"
                    value={qty}
                    min="1"
                    max="1000"
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                  />
                  <button onClick={() => setQty((q) => Math.min(1000, q + 1))}>+</button>
                  <button onClick={() => setQty((q) => Math.min(1000, q + 10))}>+10</button>
                </div>

                <div className="volume-discount-bar">
                  <div className="discount-pill">
                    {qty >= 200 ? "🔥 Максимальная скидка 24%" : qty >= 100 ? "⚡ Скидка 18%" : qty >= 50 ? "👍 Скидка 11%" : qty >= 20 ? "💡 Скидка 5%" : "Добавьте от 20 шт. для скидки"}
                  </div>
                  <div className="unit-sum-display">
                    <span>Цена за 1 шт: <b>{unitPrice} BYN</b></span>
                    <span>Итого тираж: <strong>{totalPrice} BYN</strong></span>
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
                    <h2>5. Сводка заказа и контакты</h2>
                    <p>Проверьте детали и укажите номер телефона для подтверждения расчёта.</p>
                  </div>

                  <div className="order-summary-card">
                    <h3>Детали вашего заказа</h3>
                    <div className="summary-list">
                      <div className="summary-row"><span>Изделие:</span><b>{selectedItem.label} ({selectedColor.label})</b></div>
                      <div className="summary-row"><span>Печать:</span><b>{methods[method].label} ({selectedSize.label})</b></div>
                      <div className="summary-row"><span>Расположение:</span><b>{selectedPlacementCopy.label}</b></div>
                      <div className="summary-row"><span>Макет:</span><b>{designElementsCount ? `${designElementsCount} элем.` : "Не добавлен"}</b></div>
                      <div className="summary-row"><span>Количество:</span><b>{qty} шт.</b></div>
                      <hr className="my-2"/>
                      <div className="summary-row total"><span>Итоговая сумма:</span><strong>{totalPrice} BYN</strong></div>
                    </div>
                  </div>

                  <form className="contact-form-block" onSubmit={handleSubmitOrder}>
                    <div className="form-group">
                      <label>Ваше имя</label>
                      <input
                        type="text"
                        placeholder="Например, Александр"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Номер телефона <span className="req">*</span></label>
                      <input
                        type="tel"
                        required
                        placeholder="+375 (29) 000-00-00"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Комментарий или пожелания</label>
                      <textarea
                        rows={2}
                        placeholder="Укажите нужные размеры (S, M, L, XL) или адрес доставки..."
                        value={customerComment}
                        onChange={(e) => setCustomerComment(e.target.value)}
                      />
                    </div>

                    <div className="step-actions-row desktop-only mt-4">
                      <button type="button" className="button outline" onClick={() => setCurrentStep(4)}>
                        <ConfigIcon name="arrowLeft" size={18}/> Назад
                      </button>
                      <button type="submit" className="button button-primary wide">
                        Отправить расчёт печатнику <ConfigIcon name="arrowRight" size={18}/>
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="success-order-box animate-fade">
                  <div className="success-icon"><ConfigIcon name="check" size={48}/></div>
                  <h2>Заказ №{orderId} принят!</h2>
                  <p>Спасибо! Мы сохранили расчёт для <b>{customerName || "клиента"}</b> ({customerPhone}).</p>
                  <p className="subtext">Наш печатник забронировал ткани и свяжется с вами в течение 10-15 минут для согласования цветов и формата!</p>

                  <div className="success-actions">
                    <a className="button button-primary" href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer">
                      Написать менеджеру в Telegram
                    </a>
                    <button className="button outline" onClick={() => { setSubmitted(false); setCurrentStep(1); }}>
                      Создать новый заказ
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Mobile Action Footer */}
      {!submitted && (
        <div className="mobile-config-sticky-footer">
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
              <button className="button outline button-small" onClick={() => setCurrentStep((s) => s - 1)}>
                <ConfigIcon name="arrowLeft" size={16}/>
              </button>
            )}
            {currentStep < 5 ? (
              <button className="button button-primary button-small" onClick={() => setCurrentStep((s) => s + 1)}>
                Далее ({currentStep}/5) <ConfigIcon name="arrowRight" size={16}/>
              </button>
            ) : (
              <button className="button button-primary button-small" onClick={(e) => handleSubmitOrder(e)}>
                Отправить <ConfigIcon name="arrowRight" size={16}/>
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
