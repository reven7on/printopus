"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";

const items = [
  { id: "shirt", label: "Футболка", note: "100% хлопковый трикотаж", base: 15, icon: "shirt" },
  { id: "hoodie", label: "Толстовка", note: "Утеплённый футер 320 г/м²", base: 45, icon: "hoodie" },
  { id: "polo", label: "Поло", note: "Классическое пике 220 г/м²", base: 25, icon: "polo" },
  { id: "cap", label: "Кепка", note: "6-панельная классическая", base: 12, icon: "cap" },
  { id: "bag", label: "Шопер", note: "Плотный натуральный канвас", base: 10, icon: "bag" },
];

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
];

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
    check: <path d="m5 12 4 4L19 6"/>,
    arrowRight: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    arrowLeft: <path d="M19 12H5m5-5-5 5 5 5"/>,
    phone: <path d="M6 3h4l2 5-3 2c2 4 4 6 8 8l2-3 4 2v4c-1 2-4 2-6 1C9 19 4 14 2 7 1 5 3 3 6 3Z"/>,
  };
  return <svg className="config-icon" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function getMockupPath(itemKey: string, colorKey: string, viewAngleKey: string) {
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

function getAvailableColorsForItem(itemKey: string) {
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
  const [item, setItem] = useState("shirt");
  const [color, setColor] = useState("khaki");
  const [viewAngle, setViewAngle] = useState<"front" | "back" | "sleeve_left" | "sleeve_right">("front");
  const [method, setMethod] = useState<keyof typeof methods>("dtf");
  const [placement, setPlacement] = useState("center");
  const [sizeFormat, setSizeFormat] = useState("A4");
  const [qty, setQty] = useState(30);
  
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [artScale, setArtScale] = useState(1);
  const [artRotation, setArtRotation] = useState(0);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = items.find((i) => i.id === item)!;
  const selectedColor = garmentColors.find((c) => c.id === color)!;
  const selectedSize = printSizes.find((s) => s.id === sizeFormat)!;
  const selectedPlacement = placements.find((p) => p.id === placement)!;
  const activeStep = steps.find((s) => s.n === currentStep)!;

  // Authentic Spreadshirt PNG mockups mapped per product, color & view
  const currentMockupImage = useMemo(() => {
    if (item === "bag") return "/product-shopper.png";

    const colorKey = garmentColors.some((c) => c.id === color) ? color : "white";
    let viewSlug = "front";
    if (viewAngle === "back") viewSlug = "back";
    if (viewAngle === "sleeve_left") viewSlug = "sleeve-left";
    if (viewAngle === "sleeve_right") viewSlug = "sleeve-right";

    return `/mockups/spreadshirt/shirt-${colorKey}-${viewSlug}.png`;
  }, [item, color, viewAngle]);

  const unitPrice = useMemo(() => {
    const baseUnit = selectedItem.base + selectedColor.add + methods[method].add + selectedSize.add;
    const discountMultiplier = qty >= 200 ? 0.76 : qty >= 100 ? 0.82 : qty >= 50 ? 0.89 : qty >= 20 ? 0.95 : 1;
    return +(baseUnit * discountMultiplier).toFixed(2);
  }, [selectedItem, selectedColor, method, selectedSize, qty]);

  const totalPrice = +(unitPrice * qty).toFixed(2);

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(file);
    }
  }

  function clearArtwork() {
    setPreview("");
    setFileName("");
    setArtScale(1);
    setArtRotation(0);
  }

  function handleSelectPlacement(pId: string) {
    setPlacement(pId);
    const targetPlacement = placements.find((p) => p.id === pId);
    if (targetPlacement) {
      setViewAngle(targetPlacement.view as "front" | "back" | "sleeve_left" | "sleeve_right");
    }
  }

  function handleSubmitOrder(e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    if (!customerPhone.trim()) return;
    const randomId = "BY-" + Math.floor(100000 + Math.random() * 900000);
    setOrderId(randomId);
    setSubmitted(true);
  }

  function handleSelectViewAngle(angle: "front" | "back" | "sleeve_left" | "sleeve_right") {
    setViewAngle(angle);
    if (angle === "back") setPlacement("back");
    else if (angle === "sleeve_left") setPlacement("sleeve_left");
    else if (angle === "sleeve_right") setPlacement("sleeve_right");
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
            </div>

            {/* Authentic Spreadshirt Garment Canvas */}
            <div className="garment-stage">
              {/* Authentic Spreadshirt High-Res Render Image */}
              <img src={currentMockupImage} alt={selectedItem.label} className="garment-base-img authentic" />

              {/* Print zone - only shown when artwork uploaded or from Step 3 (Macro/Upload) onwards */}
              {(preview || currentStep >= 3) && (
                <div className={`canvas-print-zone pos-${placement} ${preview ? "has-image" : ""}`}>
                  <div
                    className="canvas-artwork"
                    style={{
                      backgroundImage: preview ? `url(${preview})` : undefined,
                      transform: `scale(${artScale}) rotate(${artRotation}deg)`,
                    }}
                  />
                </div>
              )}
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
                const thumbSrc = getMockupPath(item, color, v.id);
                const isActive = viewAngle === v.id;
                return (
                  <button
                    key={v.id}
                    className={`view-thumb-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectViewAngle(v.id as "front" | "back" | "sleeve_left" | "sleeve_right")}
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

            {/* Quick Canvas Transform Controls */}
            {preview && (
              <div className="canvas-transform-toolbar mt-3">
                <button onClick={() => setArtScale((v) => Math.min(1.5, +(v + 0.1).toFixed(1)))} title="Увеличить">
                  <ConfigIcon name="zoom" size={16}/> +
                </button>
                <button onClick={() => setArtScale((v) => Math.max(0.5, +(v - 0.1).toFixed(1)))} title="Уменьшить">
                  −
                </button>
                <button onClick={() => setArtRotation((v) => (v + 15) % 360)} title="Повернуть">
                  <ConfigIcon name="rotate" size={16}/> 15°
                </button>
                <button onClick={() => { setArtScale(1); setArtRotation(0); }} title="По центру">
                  <ConfigIcon name="target" size={16}/> Сброс
                </button>
                <button onClick={clearArtwork} className="danger" title="Удалить">
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
                    onClick={() => { setItem(i.id); setCurrentStep(2); }}
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
            <div className="step-pane animate-fade">
              <div className="step-pane-header">
                <h2>3. Макет и область нанесения</h2>
                <p>Загрузите логотип или принт и выберите расположение на одежде.</p>
              </div>

              <div className="section-block">
                <h3>Расположение принта</h3>
                <div className="placements-grid">
                  {placements.map((p) => (
                    <button
                      key={p.id}
                      className={`placement-card ${placement === p.id ? "selected" : ""}`}
                      onClick={() => handleSelectPlacement(p.id)}
                      type="button"
                    >
                      <b>{p.label}</b>
                      <small>{p.sub}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="upload-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
                <ConfigIcon name="upload" size={40} />
                {fileName ? (
                  <div className="uploaded-file-info">
                    <b>{fileName}</b>
                    <span>Макет успешно прикреплен</span>
                    <button className="button button-small outline mt-2" onClick={() => inputRef.current?.click()}>Заменить файл</button>
                  </div>
                ) : (
                  <div className="upload-prompt">
                    <p><b>Перетащите файл принта</b> или нажмите кнопку</p>
                    <button className="button button-small" onClick={() => inputRef.current?.click()}>Загрузить файл</button>
                    <small>Форматы: PNG, JPG, SVG, AI, EPS, PDF (до 50 МБ)</small>
                  </div>
                )}
                <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.svg,.ai,.eps,.pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
              </div>

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
                      <div className="summary-row"><span>Расположение:</span><b>{selectedPlacement.label}</b></div>
                      <div className="summary-row"><span>Файл принта:</span><b>{fileName || "Не загружен"}</b></div>
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
