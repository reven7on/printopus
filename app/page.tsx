"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  DEFAULT_PRINT_METHOD_PRICE,
  FIRST_VOLUME_DISCOUNT_QUANTITY,
  MAX_VOLUME_DISCOUNT_PERCENT,
  PRINT_FORMATS,
  PRODUCT_BASE_PRICES,
} from "./pricing";
import { usePublicCatalog } from "./use-public-catalog";

function Icon({ name }: { name: string }) {
  const shapes: Record<string, ReactNode> = {
    shirt: <path d="m8 4 4 2 4-2 5 4-3 4-2-2v10H8V10l-2 2-3-4Z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    shield: <><path d="m12 3 8 3v6c0 5-3 8-8 9-5-1-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    calculator: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-5 5h2"/></>,
    box: <><path d="m4 7 8-4 8 4v10l-8 4-8-4Z"/><path d="m4 7 8 4 8-4m-8 4v10"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    phone: <path d="M6 3h4l2 5-3 2c2 4 4 6 8 8l2-3 4 2v4c-1 2-4 2-6 1C9 19 4 14 2 7 1 5 3 3 6 3Z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    telegram: <path d="M21.5 3.5 2.2 11c-.7.3-.7 1.2 0 1.4l4.9 1.5 1.8 5.6c.2.6.9.8 1.4.4l2.8-2.3 4.8 3.5c.6.4 1.4.1 1.6-.6L22.8 4.7c.3-.9-.6-1.6-1.3-1.2zM9.4 13.4l9.2-5.7-7.4 6.8-.3 3.1-1.5-4.2z"/>,
    instagram: <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

const products = [
  {
    title: "Футболки и поло",
    copy: "Плотный хлопок 180–240 г/м². Классическая или свободная посадка.",
    image: "/product-shirt.webp",
    kind: "shirt",
    methods: [
      ["DTF-печать", "Перед, спина и рукава"],
      ["Шелкография", "Для ярких тиражей от 20 штук"],
      ["Вышивка", "Грудь, рукав или небольшой шеврон"],
    ],
    fit: ["Классическая и оверсайз", "Размеры XS–5XL", "Женские и детские модели — по запросу"],
    material: ["Хлопок или смесовый трикотаж", "180–240 г/м²"],
    scales: [["Плотность", 58], ["Мягкость", 74]],
    features: [
      ["Стабильная форма", "Предусадочная обработка полотна"],
      ["Стойкое нанесение", "50+ стирок при правильном уходе"],
      ["Фирменные цвета", "Подберём оттенок под стиль бренда"],
    ],
  },
  {
    title: "Толстовки и худи",
    copy: "Тёплый футер 320–380 г/м². Подходит для вышивки и крупных принтов.",
    image: "/product-hoodie.webp",
    kind: "hoodie",
    methods: [
      ["DTF-печать", "Грудь, спина и рукава"],
      ["Шелкография", "Перед и спина для средних тиражей"],
      ["Вышивка", "Грудь, рукав или край капюшона"],
    ],
    fit: ["Свободная и оверсайз", "Размеры XS–4XL", "Модели с молнией и без неё"],
    material: ["Футер с начёсом или петлёй", "320–380 г/м²"],
    scales: [["Плотность", 90], ["Мягкость", 82]],
    features: [
      ["Тёплая основа", "Комфортна для прохладной погоды"],
      ["Усиленные швы", "Рассчитаны на регулярную носку"],
      ["Стойкое нанесение", "50+ стирок при правильном уходе"],
    ],
  },
  {
    title: "Головные уборы",
    copy: "Бейсболки и шапки с плоской, объёмной вышивкой или шевронами.",
    image: "/product-cap.webp",
    kind: "cap",
    methods: [
      ["Плоская вышивка", "Спереди, сбоку или сзади"],
      ["3D-вышивка", "Объёмный логотип на фронтальной панели"],
      ["Шевроны", "Тканые и вышитые нашивки"],
    ],
    fit: ["Шестипанельная конструкция", "Обхват 54–62 см", "Регулируемая застёжка"],
    material: ["Хлопковый твил или смесовая ткань", "Плотная формованная основа"],
    scales: [["Плотность", 72], ["Мягкость", 42]],
    features: [
      ["Чёткая форма", "Усиленная фронтальная панель"],
      ["Точная детализация", "Подходит для небольших логотипов"],
      ["Выбор основы", "Разные цвета, козырьки и застёжки"],
    ],
  },
  {
    title: "Шоперы и сумки",
    copy: "Канвас 280 г/м². Большая зона печати и усиленные длинные ручки.",
    image: "/product-shopper.webp",
    kind: "bag",
    methods: [
      ["Шелкография", "Одна или две стороны, выгодно для тиража"],
      ["DTF-печать", "Полноцветные изображения и градиенты"],
      ["Вышивка", "Небольшой знак или надпись"],
    ],
    fit: ["Базовый размер 38 × 42 см", "Ручки длиной около 70 см", "Другие размеры — под заказ"],
    material: ["Хлопковый канвас", "Около 280 г/м²"],
    scales: [["Плотность", 78], ["Мягкость", 38]],
    features: [
      ["До 15 кг", "Усиленное крепление ручек"],
      ["Большая зона печати", "Макет хорошо читается с расстояния"],
      ["Гибкое производство", "Подберём размер и цвет под задачу"],
    ],
  },
];

const portfolioItems = [
  {
    title: "Тиражи футболок",
    detail: "Шелкография · плотный хлопок",
    image: "/portfolio-print-run.webp",
    alt: "Проверка партии футболок со свежей шелкографией в печатной мастерской",
  },
  {
    title: "Мерч для команды",
    detail: "DTF-печать · единый стиль",
    image: "/portfolio-event-team.webp",
    alt: "Команда организаторов в футболках с одинаковым принтом на площадке мероприятия",
  },
  {
    title: "Вышивка на спецодежде",
    detail: "Машинная вышивка · точная детализация",
    image: "/portfolio-embroidery.webp",
    alt: "Вышивальная машина наносит красную эмблему на графитовую рабочую куртку",
  },
  {
    title: "Шоперы для брендов",
    detail: "Одноцветная печать · натуральный канвас",
    image: "/portfolio-tote-run.webp",
    alt: "Партия канвасовых шоперов с ботаническими принтами на столе контроля качества",
  },
];

const fallbackBasePrices = [
  { title: "Футболка", note: "Классическая модель из хлопка", price: PRODUCT_BASE_PRICES.shirt, image: "/product-shirt.webp" },
  { title: "Худи", note: "Утеплённая модель с капюшоном", price: PRODUCT_BASE_PRICES.hoodie, image: "/product-hoodie.webp" },
  { title: "Кепка", note: "Классическая шестипанельная", price: PRODUCT_BASE_PRICES.cap, image: "/product-cap.webp" },
  { title: "Шопер", note: "Плотный натуральный хлопок", price: PRODUCT_BASE_PRICES.bag, image: "/product-shopper.webp" },
];

const fallbackPrintPrices = PRINT_FORMATS.map((format) => ({
  size: format.id,
  dimensions: format.dimensions,
  label: format.landingLabel,
  price: DEFAULT_PRINT_METHOD_PRICE + format.add,
  scale: format.scale,
}));

const faqs = [
  ["Можно заказать одну футболку?", "Да. Печатаем от одной штуки — без обязательного минимального тиража."],
  ["Можно принести свою одежду?", "Да. Сначала проверим состав ткани и состояние изделия, затем подберём подходящую технологию."],
  ["Сколько времени занимает печать?", "Стандартный срок — от 1 до 5 рабочих дней. Он зависит от технологии, тиража и готовности макета."],
  ["Можно напечатать фотографию?", "Да. Для полноцветных изображений обычно используем DTF или прямую печать по ткани."],
  ["Какой файл лучше загрузить?", "Подойдут PNG, PDF, SVG, AI или EPS. Для растрового изображения желательно разрешение от 300 dpi."],
  ["Вы доставляете по Беларуси?", "Да. Отправляем курьером по Минску, а также Белпочтой, Европочтой и CDEK по всей Беларуси."],
];

function FormatShirtIcon({ scale, size }: { scale: string; size: string }) {
  // Precision print area overlay coordinates on real studio photo /product-shirt.webp (viewBox 100x100)
  const printZones: Record<string, { x: number; y: number; width: number; height: number }> = {
    xs: { x: 32.5,  y: 28, width: 7.0,  height: 9.9 },  // A7 — left chest logo
    sm: { x: 45.05, y: 28, width: 9.9,  height: 14.0 }, // A6 — small front
    md: { x: 43.05, y: 28, width: 13.9, height: 19.7 }, // A5 — compact front
    lg: { x: 40.15, y: 28, width: 19.7, height: 27.9 }, // A4 — standard front
    xl: { x: 36.05, y: 28, width: 27.9, height: 39.5 }, // A3 — large front
  };
  const zone = printZones[scale] || printZones.lg;

  return (
    <div className="format-photo-wrap">
      <Image src="/product-shirt.webp" alt={`Белая футболка с зоной печати ${size}`} className="format-photo-img" width={1000} height={1000} sizes="122px" />
      <svg className="format-photo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          rx="1.5"
          fill="#ED1017"
          fillOpacity="0.1"
          stroke="#ED1017"
          strokeWidth="1.8"
          strokeDasharray="3.5 2.5"
        />
      </svg>
    </div>
  );
}

export default function Home() {
  const publicCatalog = usePublicCatalog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(true);
  const [active, setActive] = useState("products");
  const [catalogProduct, setCatalogProduct] = useState(0);
  const [priceProduct, setPriceProduct] = useState(0);
  const [priceFormat, setPriceFormat] = useState(3);

  const basePrices = fallbackBasePrices.map((item) => {
    const slug = item.title === "Футболка" ? "shirt" : item.title === "Худи" ? "hoodie" : item.title === "Кепка" ? "cap" : "bag";
    const databaseProduct = publicCatalog?.products.find((product) => product.slug === slug);
    return databaseProduct ? { ...item, title: databaseProduct.name, note: databaseProduct.description ?? item.note, price: databaseProduct.basePrice } : item;
  });
  const printMethodPrice = publicCatalog?.printMethods.find((method) => method.slug === "dtf")?.priceDelta ?? DEFAULT_PRINT_METHOD_PRICE;
  const printPrices = publicCatalog?.printFormats.length
    ? publicCatalog.printFormats.map((format, index) => {
      const fallback = PRINT_FORMATS.find((item) => item.id === format.code) ?? PRINT_FORMATS[Math.min(index, PRINT_FORMATS.length - 1)];
      return {
        size: format.code,
        dimensions: `${format.widthCm.toString().replace(".", ",")} × ${format.heightCm.toString().replace(".", ",")} см`,
        label: fallback.landingLabel,
        price: printMethodPrice + format.priceDelta,
        scale: fallback.scale,
      };
    })
    : fallbackPrintPrices;
  const firstDiscountQuantity = publicCatalog?.volumeDiscounts[0]?.minQuantity ?? FIRST_VOLUME_DISCOUNT_QUANTITY;
  const maxDiscountPercent = publicCatalog?.volumeDiscounts.at(-1)?.percent ?? MAX_VOLUME_DISCOUNT_PERCENT;
  const selectedBasePrice = basePrices[priceProduct] ?? basePrices[0];
  const selectedPrintPrice = printPrices[priceFormat] ?? printPrices[0];

  useEffect(() => {
    const onScroll = () => setShowMobileCta(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const ids = ["products", "prices", "works", "how-it-works", "contacts"];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    }, { rootMargin: "-25% 0px -55%", threshold: [0, .15, .35] });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const nav = [["products", "Продукция"], ["prices", "Цены"], ["works", "Примеры работ"], ["how-it-works", "Как заказать"], ["contacts", "Контакты"]];
  const selectedCatalogProduct = products[catalogProduct];

  return (
    <main className="landing">
      <header className="lp-header">
        <a className="brand" href="#top" aria-label="Принтопус — на главную">
          <Image src="/logo.webp" alt="" className="brand-logo-img" width={256} height={256} priority />
          <span className="brand-title"><b>ПРИНТОПУС</b><small>центр печати</small></span>
        </a>

        <nav className="lp-nav" aria-label="Навигация по странице">
          {nav.map(([id,label]) => <a key={id} className={active === id ? "active" : ""} href={`#${id}`}>{label}</a>)}
        </nav>

        <div className="lp-head-actions">
          <a className="lp-address-badge" href="#contacts" title="Адрес нашей студии печати в Минске">
            <Icon name="pin"/>
            <span>Минск, ул. Октябрьская, 16</span>
          </a>

          <a className="lp-phone" href="tel:+375295552030">
            <Icon name="phone"/>
            <span><b>+375 (29) 555-20-30</b><small>Пн–Пт 9:00–18:00</small></span>
          </a>

          <div className="head-socials">
            <a href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer" className="soc-badge tg" title="Telegram" aria-label="Telegram"><Icon name="telegram"/></a>
            <a href="https://instagram.com/printservice_by" target="_blank" rel="noopener noreferrer" className="soc-badge ig" title="Instagram" aria-label="Instagram"><Icon name="instagram"/></a>
          </div>

          <a className="button button-small" href="/configurator">Создать дизайн</a>
        </div>

        <div className={`m-head-contacts-strip ${menuOpen ? "drawer-is-open" : ""}`}>
          <a href="tel:+375295552030" className="m-head-call" title="Позвонить" aria-label="Позвонить">
            <Icon name="phone"/>
            <span>Звонок</span>
          </a>
          <a href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer" className="m-head-soc m-soc-tg" title="Telegram" aria-label="Telegram">
            <Icon name="telegram"/>
          </a>
          <a href="https://instagram.com/printservice_by" target="_blank" rel="noopener noreferrer" className="m-head-soc m-soc-ig" title="Instagram" aria-label="Instagram">
            <Icon name="instagram"/>
          </a>
          <button className={`burger ${menuOpen ? "open" : ""}`} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <span/><span/><span/>
          </button>
        </div>

        <nav className={`mobile-drawer ${menuOpen ? "open" : ""}`}>
          <div className="drawer-contact-card">
            <div className="drawer-phone-row">
              <Icon name="phone"/>
              <div>
                <b>+375 (29) 555-20-30</b>
                <small>Пн–Пт 9:00–18:00 · ул. Октябрьская, 16</small>
              </div>
            </div>
            <div className="drawer-soc-row">
              <a href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer" className="drawer-soc-btn tg"><Icon name="telegram"/> Telegram</a>
              <a href="https://instagram.com/printservice_by" target="_blank" rel="noopener noreferrer" className="drawer-soc-btn ig"><Icon name="instagram"/> Instagram</a>
            </div>
          </div>
          <div className="drawer-nav-list">
            {nav.map(([id,label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
          </div>
          <a className="button" href="/configurator" onClick={() => setMenuOpen(false)}>Создать дизайн</a>
        </nav>
      </header>

      <section className="lp-hero" id="top" aria-label="Главный баннер">
        <div className="lp-hero-copy">
          <h1>Печать принтов<br/>и логотипов на одежде</h1>
          <p>«Принтопус» — печатаем на всём, до чего тянутся щупальца! Создаём брендовый мерч, корпоративную форму и уникальные принты от 1 штуки. DTF, шелкография и вышивка с гарантией 50+ стирок.</p>
          <div className="lp-hero-actions">
            <a className="button" href="#prices">Рассчитать стоимость</a>
            <a className="button outline" href="/configurator">Конструктор онлайн</a>
          </div>
        </div>
        <div className="lp-hero-media" role="img" aria-label="Печатный центр с современным оборудованием" />
      </section>

      <section className="lp-benefits" aria-label="Преимущества">
        <article><Icon name="shirt"/><div><b>Любые тиражи</b><span>От 1 шт. до партий в 10 000+</span></div></article>
        <article><Icon name="clock"/><div><b>Срочные заказы</b><span>Готовность от 24 часов</span></div></article>
        <article><Icon name="shield"/><div><b>Гарантия стойкости</b><span>50+ стирок без потери цвета</span></div></article>
        <article><Icon name="truck"/><div><b>Быстрая доставка</b><span>По Минску и всей Беларуси</span></div></article>
      </section>

      <section className="lp-section products-section" id="products">
        <div className="lp-heading">
          <div>
            <p style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>Ассортимент</p>
            <h2>Одежда и текстиль под нанесение</h2>
          </div>
          <a href="/configurator">Рассчитать свой макет <Icon name="arrow"/></a>
        </div>
        <div className="lp-products product-browser-grid">
          {products.map((p, index) => (
            <button
              type="button"
              className={`lp-product ${p.kind} ${catalogProduct === index ? "selected" : ""}`}
              aria-pressed={catalogProduct === index}
              onClick={() => setCatalogProduct(index)}
              style={{ order: index * 2 }}
              key={p.title}
            >
              <div>
                <h3>{p.title}</h3>
                <p>{p.copy}</p>
                <span>Подробнее <Icon name="arrow" /></span>
              </div>
              <Image className="product-photo" src={p.image} alt={p.title} fill sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1200px) 50vw, 25vw" />
            </button>
          ))}
          <div className="product-detail-panel" style={{ order: catalogProduct * 2 + 1 }} aria-live="polite">
            <div className="product-detail-topline">
              <div>
                <small>Паспорт изделия</small>
                <h3>{selectedCatalogProduct.title}</h3>
              </div>
              <p>Подберём основу и способ нанесения под макет, тираж и бюджет.</p>
              <a className="button product-detail-cta" href="/configurator">
                Открыть в конструкторе <Icon name="arrow" />
              </a>
            </div>

            <div className="product-detail-grid">
              <article>
                <div className="product-detail-heading"><Icon name="card" /><h4>Способы нанесения</h4></div>
                <div className="product-detail-list">
                  {selectedCatalogProduct.methods.map(([title, description]) => (
                    <div key={title}><b>{title}</b><span>{description}</span></div>
                  ))}
                </div>
              </article>

              <article>
                <div className="product-detail-heading"><Icon name="shirt" /><h4>Посадка и размеры</h4></div>
                <div className="product-check-list">
                  {selectedCatalogProduct.fit.map((item) => <span key={item}>{item}</span>)}
                </div>
              </article>

              <article>
                <div className="product-detail-heading"><Icon name="box" /><h4>Материал</h4></div>
                <b className="product-material-name">{selectedCatalogProduct.material[0]}</b>
                <span className="product-material-note">{selectedCatalogProduct.material[1]}</span>
                <div className="product-scales">
                  {selectedCatalogProduct.scales.map(([label, value]) => (
                    <div className="product-scale" key={label}>
                      <div><b>{label}</b><span>{value}%</span></div>
                      <i><span style={{ width: `${value}%` }} /></i>
                    </div>
                  ))}
                </div>
              </article>

              <article>
                <div className="product-detail-heading"><Icon name="shield" /><h4>Особенности</h4></div>
                <div className="product-detail-list">
                  {selectedCatalogProduct.features.map(([title, description]) => (
                    <div key={title}><b>{title}</b><span>{description}</span></div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="cost-section" id="prices">
        <div className="cost-inner">
          <div className="cost-heading">
            <p>Честная стоимость без скрытых наценок</p>
            <h2>Прозрачный расчёт цен</h2>
            <span>Единая стоимость изделия и нанесения. При заказе от {firstDiscountQuantity} штук — оптовые скидки до -{maxDiscountPercent}%.</span>
          </div>
          <div className="cost-row cost-products-row">
            <div className="cost-side"><Icon name="shirt"/><b>Базовые изделия</b><span>Цена за изделие<br/>без нанесения.</span></div>
            <div className="base-price-grid">{basePrices.map((item,index)=><button type="button" className={`base-price-card ${priceProduct===index?"selected":""}`} aria-pressed={priceProduct===index} onClick={()=>setPriceProduct(index)} key={item.title}><div><h3>{item.title}</h3><p>{item.note}</p><strong>{item.price} BYN</strong><small>без печати</small></div><Image src={item.image} alt="" fill sizes="(max-width: 760px) 50vw, 25vw"/></button>)}</div>
          </div>
          <div className="cost-row print-cost-row">
            <div className="cost-side"><Icon name="calculator"/><b>Стоимость печати</b><span>Выберите размер зоны<br/>нанесения на изделии.</span></div>
            <div className="format-price-grid">{printPrices.map((item,index)=><button type="button" className={`format-card ${priceFormat===index?"selected":""}`} aria-pressed={priceFormat===index} onClick={()=>setPriceFormat(index)} key={item.size}><b>{item.size}</b><small className="format-dimensions">{item.dimensions}</small><div className="format-shirt"><FormatShirtIcon scale={item.scale} size={item.size}/></div><span className="format-label">{item.label}</span><strong>от {item.price} BYN</strong></button>)}</div>
          </div>
          <div className="cost-summary-card">
            <div className="cost-summary-header">
              <Icon name="calculator"/>
              <div>
                <b>Калькулятор вашей конфигурации</b>
                <span>Выберите изделие и размер печати выше — стоимость пересчитается автоматически</span>
              </div>
            </div>

            <div className="cost-summary-body">
              <div className="cost-summary-line">
                <Image src={selectedBasePrice.image} alt="" className="cost-line-img" width={1000} height={1000} sizes="64px" />
                <div className="cost-line-text">
                  <small>Выбранное изделие</small>
                  <b>{selectedBasePrice.title}</b>
                  <span className="cost-line-note">{selectedBasePrice.note}</span>
                </div>
                <strong className="cost-line-price">{selectedBasePrice.price} BYN</strong>
              </div>

              <div className="cost-summary-plus" aria-hidden="true">+</div>

              <div className="cost-summary-line">
                <div className="cost-line-icon-box">
                  <Icon name="shirt" />
                </div>
                <div className="cost-line-text">
                  <small>Зона печати ({selectedPrintPrice.size})</small>
                  <b>{selectedPrintPrice.label}</b>
                  <span className="cost-line-note">{selectedPrintPrice.dimensions}</span>
                </div>
                <strong className="cost-line-price">{selectedPrintPrice.price} BYN</strong>
              </div>
            </div>

            <div className="cost-summary-footer">
              <div className="cost-total-group">
                <small>Предварительная стоимость за 1 шт. от</small>
                <strong>{selectedBasePrice.price + selectedPrintPrice.price} BYN</strong>
              </div>
              <a href="/configurator" className="button">
                Оформить в конструкторе <Icon name="arrow" />
              </a>
            </div>
          </div>
          <p className="cost-note">Размеры зон указаны в сантиметрах. Перед запуском в печать макет бесплатно проверяется и согласовывается. Скидки от объёма рассчитываются автоматически в конструкторе.</p>
        </div>
      </section>

      <section className="lp-section works-section" id="works">
        <div className="lp-heading">
          <div>
            <p>Печать в деталях</p>
            <h2>Так выглядит готовый тираж</h2>
          </div>
          <a href="/configurator">Заказать похожий тираж <Icon name="arrow"/></a>
        </div>
        <div className="portfolio-grid">
          {portfolioItems.map((item) => (
            <article className="work-card" key={item.title}>
              <Image
                src={item.image}
                alt={item.alt}
                fill
                sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1150px) 50vw, 58vw"
              />
              <div className="work-card-copy">
                <b>{item.title}</b>
                <span>{item.detail}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section how-section" id="how-it-works">
        <div className="lp-heading">
          <div>
            <p>Онлайн-конструктор</p>
            <h2>Как оформить заказ за 4 шага</h2>
          </div>
          <a href="/configurator">Открыть конструктор <Icon name="arrow"/></a>
        </div>
        <ol className="lp-steps">
          <li>
            <i>01</i>
            <Icon name="shirt"/>
            <div>
              <b>Выберите модель и цвет</b>
              <span>Укажите тип одежды (футболка, худи, шопер) и цвет на интерактивной модели.</span>
            </div>
          </li>
          <li>
            <i>02</i>
            <Icon name="upload"/>
            <div>
              <b>Загрузите свой логотип</b>
              <span>Добавьте изображение или надпись, регулируйте масштаб и расположение спереди или сзади.</span>
            </div>
          </li>
          <li>
            <i>03</i>
            <Icon name="calculator"/>
            <div>
              <b>Укажите тираж и размер</b>
              <span>Калькулятор мгновенно пересчитает итоговую сумму с учётом вашей оптовой скидки.</span>
            </div>
          </li>
          <li>
            <i>04</i>
            <Icon name="box"/>
            <div>
              <b>Отправьте в производство</b>
              <span>Дизайнер бесплатно проверит допуски макета и пришлёт финальную визуализацию в течение 15 минут.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="designer-banner">
        <div>
          <p>Интерактивный конструктор</p>
          <h2>Посмотрите, как принт выглядит на одежде</h2>
          <span>Загрузите свой логотип, меняйте масштаб и расположение на модели в реальном времени. Рассчитайте точную стоимость за 1 минуту.</span>
        </div>
        <div className="designer-visual"><Image src="/portfolio-hoodies-real.webp" alt="Готовый тираж худи с печатью" fill sizes="(max-width: 760px) calc(100vw - 76px), 50vw"/></div>
        <a className="button light" href="/configurator">Открыть конструктор <Icon name="arrow"/></a>
      </section>

      <section className="lp-section faq-section" id="faq">
        <div className="lp-heading">
          <div>
            <p>Ответы экспертов</p>
            <h2>Часто задаваемые вопросы</h2>
          </div>
        </div>
        <div className="faq-grid">{faqs.map(([q,a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="lp-section contacts-section" id="contacts">
        <div className="contact-copy">
          <p>Ждём вас в шоуруме</p>
          <h2>Свяжитесь с нами</h2>
          <span>Приезжайте в наш шоурум в Минске посмотреть образцы тканей и печать вживую или оставьте заявку на расчёт тиража.</span>
          <a className="button" href="tel:+375295552030">Позвонить нам</a>
        </div>
        <div className="contact-card">
          <article><Icon name="pin"/><div><b>Адрес шоурума</b><span>Минск, ул. Октябрьская, 16, корп. 2<br/>2 этаж, офис 204</span></div></article>
          <article><Icon name="clock"/><div><b>Режим работы</b><span>Пн–Пт: 9:00–18:00<br/>Сб–Вс: по записи</span></div></article>
          <article><Icon name="phone"/><div><b>Телефон</b><a href="tel:+375295552030">+375 (29) 555-20-30</a></div></article>
          <article><Icon name="telegram"/><div><b>Telegram</b><a href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer">@printservice_by</a></div></article>
          <article><Icon name="instagram"/><div><b>Instagram</b><a href="https://instagram.com/printservice_by" target="_blank" rel="noopener noreferrer">@printservice_by</a></div></article>
          <article><Icon name="mail"/><div><b>E-mail</b><a href="mailto:info@printservice.by">info@printservice.by</a></div></article>
        </div>
        <div className="map-card" aria-label="Схема проезда">
          <iframe
            src="https://yandex.ru/map-widget/v1/?ll=27.5684%2C53.8893&z=16.5&pt=27.5684%2C53.8893%2Cpm2rdm"
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
            title="Яндекс Карта — Минск, ул. Октябрьская, 16"
            className="map-iframe"
          />
          <span className="map-badge">м. Первомайская · 6 минут пешком</span>
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <a className="brand brand-invert" href="#top" style={{ gap: '12px' }}>
            <Image src="/logo.webp" alt="" className="brand-logo-img" width={256} height={256} />
            <span className="brand-title"><b style={{ color: '#fff' }}>ПРИНТОПУС</b><small style={{ color: '#a5a8ae' }}>центр печати</small></span>
          </a>
          <p>Собственное производство в Минске<br/>и контроль качества на всех этапах.</p>
        </div>
        <nav><b>Продукция</b><a href="#products">Футболки и поло</a><a href="#products">Толстовки и худи</a><a href="#products">Шоперы</a></nav>
        <nav><b>Клиентам</b><a href="#prices">Цены</a><a href="#how-it-works">Как заказать</a><a href="#faq">Вопросы и ответы</a></nav>
        <nav>
          <b>Контакты и соцсети</b>
          <a href="tel:+375295552030">+375 (29) 555-20-30</a>
          <a href="https://t.me/printservice_by" target="_blank" rel="noopener noreferrer">Telegram (@printservice_by)</a>
          <a href="https://instagram.com/printservice_by" target="_blank" rel="noopener noreferrer">Instagram (@printservice_by)</a>
          <a href="mailto:info@printservice.by">info@printservice.by</a>
        </nav>
        <small>© 2026 Студия печати «Принтопус». Все права защищены.</small>
      </footer>
      <a className={`mobile-sticky-cta ${showMobileCta ? "show" : ""}`} href="/configurator" aria-label="Создать дизайн — открыть конструктор">Создать дизайн <Icon name="arrow"/></a>
    </main>
  );
}
