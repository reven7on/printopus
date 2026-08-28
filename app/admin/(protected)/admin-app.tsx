"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Tab = "overview" | "orders" | "catalog";
type CatalogTab = "products" | "methods" | "formats" | "discounts";
type OrderStatus = "NEW" | "CONFIRMED" | "IN_PRODUCTION" | "READY" | "COMPLETED" | "CANCELLED";
type DirtyCatalogResource = "product" | "option" | "printMethod" | "printFormat" | "productPrintMethod" | "productPrintFormat" | "discount";
type DeletableCatalogResource = Exclude<DirtyCatalogResource, "product">;

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  contactMethod: "PHONE" | "TELEGRAM";
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

type CatalogOption = { id: string; type: "COLOR" | "SIZE"; value: string; label: string; colorHex: string | null; priceDelta: number; active: boolean; sortOrder: number };
type ProductPrintFormat = { id: string; printFormatId: string; code: string; widthCm: number; heightCm: number; priceDelta: number; active: boolean; sortOrder: number };
type ProductPrintMethod = { id: string; printMethodId: string; slug: string; name: string; description: string | null; priceDelta: number; active: boolean; sortOrder: number; formats: ProductPrintFormat[] };
type CatalogProduct = { id: string; slug: string; name: string; description: string | null; basePrice: number; active: boolean; sortOrder: number; options: CatalogOption[]; printMethods: ProductPrintMethod[] };
type PrintMethod = { id: string; slug: string; name: string; description: string | null; priceDelta: number; active: boolean; sortOrder: number };
type PrintFormat = { id: string; code: string; widthCm: number; heightCm: number; priceDelta: number; active: boolean; sortOrder: number };
type Discount = { id: string; minQuantity: number; percent: number; active: boolean };
type Catalog = { products: CatalogProduct[]; printMethods: PrintMethod[]; printFormats: PrintFormat[]; discounts: Discount[] };
type OverviewData = {
  counts: Record<OrderStatus, number>;
  totalOrders: number;
  activeRevenue: number;
  activeOrderCount: number;
  activeProducts: number;
  recentOrders: OrderSummary[];
  auditLog: Array<{ id: string; actor: string; action: string; entity: string; createdAt: string }>;
};

const statusLabels: Record<OrderStatus, string> = {
  NEW: "Новый",
  CONFIRMED: "Подтверждён",
  IN_PRODUCTION: "В производстве",
  READY: "Готов",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const navItems: Array<{ id: Tab; label: string; mark: string }> = [
  { id: "overview", label: "Сводка", mark: "01" },
  { id: "orders", label: "Заказы", mark: "02" },
  { id: "catalog", label: "Каталог и цены", mark: "03" },
];

function money(value: number) {
  return new Intl.NumberFormat("ru-BY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) + " BYN";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ru-BY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return plural(minutes, "минуту назад", "минуты назад", "минут назад");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "час назад", "часа назад", "часов назад");
  const days = Math.round(hours / 24);
  return plural(days, "день назад", "дня назад", "дней назад");
}

function plural(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return `${value} ${many}`;
  if (last === 1) return `${value} ${one}`;
  if (last >= 2 && last <= 4) return `${value} ${few}`;
  return `${value} ${many}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("Сессия завершена.");
  }
  if (!response.ok) throw new Error(result.error?.message ?? "Не удалось выполнить запрос.");
  return result;
}

export default function AdminApp({ username }: { username: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "orders" || initialTab === "catalog" ? initialTab : "overview");
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("products");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [orderStatus, setOrderStatus] = useState(() => searchParams.get("status") ?? "");
  const [orderSearch, setOrderSearch] = useState(() => searchParams.get("search") ?? "");
  const [orderSort, setOrderSort] = useState(() => searchParams.get("sort") ?? "date-desc");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [dirtyCatalogItems, setDirtyCatalogItems] = useState<Array<{ resource: DirtyCatalogResource; id: string }>>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const skipOrderRefresh = useRef(true);
  const initialOrderFilters = useRef({ search: orderSearch, status: orderStatus, sort: orderSort });

  const loadOverview = useCallback(async () => {
    setOverview(await api("/api/admin/overview"));
  }, []);

  const loadOrders = useCallback(async (page = 1, search = orderSearch, status = orderStatus, sort = orderSort) => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    const result = await api<{ orders: OrderSummary[]; pagination: typeof pagination }>(`/api/admin/orders?${params}`);
    setOrders(result.orders);
    setPagination(result.pagination);
  }, [orderSearch, orderSort, orderStatus]);

  const loadCatalog = useCallback(async () => {
    setCatalog(await api<Catalog>("/api/admin/catalog"));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<OverviewData>("/api/admin/overview"),
      api<{ orders: OrderSummary[]; pagination: typeof pagination }>(`/api/admin/orders?${new URLSearchParams({
        page: "1", pageSize: "25", ...(initialOrderFilters.current.search.trim() ? { search: initialOrderFilters.current.search.trim() } : {}), ...(initialOrderFilters.current.status ? { status: initialOrderFilters.current.status } : {}), sort: initialOrderFilters.current.sort,
      })}`),
      api<Catalog>("/api/admin/catalog"),
    ])
      .then(([overviewResult, ordersResult, catalogResult]) => {
        if (!active) return;
        setOverview(overviewResult);
        setOrders(ordersResult.orders);
        setPagination(ordersResult.pagination);
        setCatalog(catalogResult);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить админку."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (skipOrderRefresh.current) {
      skipOrderRefresh.current = false;
      return;
    }
    void loadOrders(1);
  }, [loadOrders]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "overview") params.set("tab", tab);
    if (tab === "orders") {
      if (orderSearch.trim()) params.set("search", orderSearch.trim());
      if (orderStatus) params.set("status", orderStatus);
      if (orderSort !== "date-desc") params.set("sort", orderSort);
    }
    const query = params.toString();
    router.replace(query ? `/admin?${query}` : "/admin", { scroll: false });
  }, [orderSearch, orderSort, orderStatus, router, tab]);

  useEffect(() => {
    if (dirtyCatalogItems.length === 0) return;
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnAboutUnsavedChanges);
    return () => window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
  }, [dirtyCatalogItems.length]);

  async function logout() {
    await api("/api/admin/session", { method: "DELETE" });
    window.location.replace("/admin/login");
  }

  function openOrder(id: string) {
    const params = new URLSearchParams({ tab: "orders" });
    if (orderSearch.trim()) params.set("search", orderSearch.trim());
    if (orderStatus) params.set("status", orderStatus);
    if (orderSort !== "date-desc") params.set("sort", orderSort);
    router.push(`/admin/orders/${id}?back=${encodeURIComponent(`/admin?${params}`)}`);
  }

  function markCatalogDirty(resource: DirtyCatalogResource, id: string) {
    setDirtyCatalogItems((current) => current.some((item) => item.resource === resource && item.id === id)
      ? current
      : [...current, { resource, id }]);
  }

  function updateCatalogItem(resource: keyof Catalog, id: string, changes: Record<string, unknown>, trackChanges = true) {
    setCatalog((current) => {
      if (!current) return current;
      if (resource === "products") return { ...current, products: current.products.map((item) => item.id === id ? { ...item, ...changes } : item) };
      return { ...current, [resource]: current[resource].map((item) => item.id === id ? { ...item, ...changes } : item) } as Catalog;
    });
    if (trackChanges) {
      const apiResource = resource === "products" ? "product" : resource === "printMethods" ? "printMethod" : resource === "printFormats" ? "printFormat" : "discount";
      markCatalogDirty(apiResource, id);
    }
  }

  function updateOption(productId: string, optionId: string, changes: Partial<CatalogOption>, trackChanges = true) {
    setCatalog((current) => current ? {
      ...current,
      products: current.products.map((product) => product.id === productId
        ? { ...product, options: product.options.map((option) => option.id === optionId ? { ...option, ...changes } : option) }
        : product),
    } : current);
    if (trackChanges) markCatalogDirty("option", optionId);
  }

  function updateProductPrintMethod(productId: string, methodId: string, changes: Partial<ProductPrintMethod>, trackChanges = true) {
    setCatalog((current) => current ? {
      ...current,
      products: current.products.map((product) => product.id === productId
        ? { ...product, printMethods: product.printMethods.map((method) => method.id === methodId ? { ...method, ...changes } : method) }
        : product),
    } : current);
    if (trackChanges) markCatalogDirty("productPrintMethod", methodId);
  }

  function updateProductPrintFormat(productId: string, methodId: string, formatId: string, changes: Partial<ProductPrintFormat>, trackChanges = true) {
    setCatalog((current) => current ? {
      ...current,
      products: current.products.map((product) => product.id === productId
        ? {
          ...product,
          printMethods: product.printMethods.map((method) => method.id === methodId
            ? { ...method, formats: method.formats.map((format) => format.id === formatId ? { ...format, ...changes } : format) }
            : method),
        }
        : product),
    } : current);
    if (trackChanges) markCatalogDirty("productPrintFormat", formatId);
  }

  async function saveCatalogStatus(resource: DirtyCatalogResource, id: string, active: boolean) {
    setSaving(`status:${id}`);
    setError("");
    try {
      await api("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, id, changes: { active } }),
      });
      setNotice(active ? "Позиция опубликована на сайте." : "Позиция скрыта с сайта.");
    } catch (reason) {
      setCatalog((current) => {
        if (!current) return current;
        if (resource === "option") return {
          ...current,
          products: current.products.map((product) => ({
            ...product,
            options: product.options.map((option) => option.id === id ? { ...option, active: !active } : option),
          })),
        };
        if (resource === "productPrintMethod") return {
          ...current,
          products: current.products.map((product) => ({
            ...product,
            printMethods: product.printMethods.map((method) => method.id === id ? { ...method, active: !active } : method),
          })),
        };
        if (resource === "productPrintFormat") return {
          ...current,
          products: current.products.map((product) => ({
            ...product,
            printMethods: product.printMethods.map((method) => ({
              ...method,
              formats: method.formats.map((format) => format.id === id ? { ...format, active: !active } : format),
            })),
          })),
        };
        const collection = resource === "product" ? "products" : resource === "printMethod" ? "printMethods" : resource === "printFormat" ? "printFormats" : "discounts";
        return { ...current, [collection]: current[collection].map((item) => item.id === id ? { ...item, active: !active } : item) } as Catalog;
      });
      setError(reason instanceof Error ? reason.message : "Не удалось изменить доступность.");
    } finally {
      setSaving("");
    }
  }

  async function saveCatalogChanges() {
    if (!catalog || dirtyCatalogItems.length === 0) return;
    setSaving("catalog-changes");
    setError("");
    try {
      await Promise.all(dirtyCatalogItems.map(({ resource, id }) => {
        let changes: Record<string, unknown> | null = null;
        if (resource === "product") {
          const item = catalog.products.find((product) => product.id === id);
          if (item) changes = { name: item.name, description: item.description, basePrice: item.basePrice };
        } else if (resource === "option") {
          const item = catalog.products.flatMap((product) => product.options).find((option) => option.id === id);
          if (item) changes = { label: item.label, colorHex: item.colorHex };
        } else if (resource === "printMethod") {
          const item = catalog.printMethods.find((method) => method.id === id);
          if (item) changes = { name: item.name, description: item.description, priceDelta: item.priceDelta };
        } else if (resource === "printFormat") {
          const item = catalog.printFormats.find((format) => format.id === id);
          if (item) changes = { widthCm: item.widthCm, heightCm: item.heightCm, priceDelta: item.priceDelta };
        } else if (resource === "productPrintMethod") {
          const item = catalog.products.flatMap((product) => product.printMethods).find((method) => method.id === id);
          if (item) changes = { priceDelta: item.priceDelta };
        } else if (resource === "productPrintFormat") {
          const item = catalog.products.flatMap((product) => product.printMethods.flatMap((method) => method.formats)).find((format) => format.id === id);
          if (item) changes = { priceDelta: item.priceDelta };
        } else {
          const item = catalog.discounts.find((discount) => discount.id === id);
          if (item) changes = { minQuantity: item.minQuantity, percent: item.percent };
        }
        if (!changes) return Promise.resolve();
        return api("/api/admin/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource, id, changes }),
        });
      }));
      await Promise.all([loadCatalog(), loadOverview()]);
      setDirtyCatalogItems([]);
      setNotice("Все изменения каталога сохранены.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения каталога.");
    } finally {
      setSaving("");
    }
  }

  async function createCatalogItem(event: FormEvent<HTMLFormElement>, resource: string) {
    event.preventDefault();
    if (dirtyCatalogItems.length > 0) {
      setError("Сначала сохраните изменения каталога, затем добавьте новую запись.");
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setSaving(`new-${resource}`);
    setError("");
    try {
      await api("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, data }),
      });
      form.reset();
      await Promise.all([loadCatalog(), loadOverview()]);
      setNotice("Новая запись добавлена.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить запись.");
    } finally {
      setSaving("");
    }
  }

  async function createPrintCompatibility(resource: "productPrintMethod" | "productPrintFormat", data: Record<string, unknown>) {
    if (dirtyCatalogItems.length > 0) {
      setError("Сначала сохраните изменения каталога, затем меняйте состав печати.");
      return;
    }
    setSaving(`new-${resource}:${String(data.printMethodId ?? data.printFormatId)}`);
    setError("");
    try {
      await api("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, data }),
      });
      await loadCatalog();
      setNotice("Вариант печати добавлен к изделию.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить вариант печати.");
    } finally {
      setSaving("");
    }
  }

  async function deleteCatalogItem(resource: DeletableCatalogResource, id: string, label: string) {
    if (dirtyCatalogItems.length > 0) {
      setError("Сначала сохраните изменения каталога, затем удалите запись.");
      return;
    }
    if (!window.confirm(`Удалить «${label}»? Отменить это действие будет нельзя.`)) return;
    setSaving(`delete:${id}`);
    setError("");
    try {
      await api("/api/admin/catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, id }),
      });
      await Promise.all([loadCatalog(), loadOverview()]);
      setNotice(`«${label}» удалено.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить запись.");
    } finally {
      setSaving("");
    }
  }

  const currentTitle = navItems.find((item) => item.id === tab)?.label ?? "Админка";
  const newOrders = overview?.counts.NEW ?? 0;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><Image src="/logo.webp" alt="" width={48} height={48} /><strong>ПРИНТОПУС</strong><small>центр печати · управление</small></Link>
        <nav aria-label="Разделы админки">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <i>{item.mark}</i><span>{item.label}</span>{item.id === "orders" && newOrders > 0 && <b>{newOrders}</b>}
            </button>
          ))}
        </nav>
        <div className="admin-user-card">
          <span>{username.slice(0, 1).toUpperCase()}</span>
          <div><strong>{username}</strong><small>Менеджер</small></div>
          <button type="button" onClick={logout} title="Выйти" aria-label="Выйти из админки">↗</button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div><span className="admin-kicker">Панель управления</span><h1>{currentTitle}</h1></div>
          <div className="admin-topbar-actions"><a href="/" target="_blank">Открыть сайт ↗</a><span>{new Date().toLocaleDateString("ru-BY", { day: "numeric", month: "long" })}</span><button type="button" onClick={logout}>Выйти</button></div>
        </header>

        {notice && <button type="button" className="admin-notice success" onClick={() => setNotice("")} aria-label="Закрыть сообщение">{notice}<span>×</span></button>}
        {error && <button type="button" className="admin-notice error" onClick={() => setError("")} aria-label="Закрыть ошибку">{error}<span>×</span></button>}
        {loading ? <div className="admin-loading">Загружаем рабочее пространство…</div> : (
          <>
            {tab === "overview" && overview && <Overview overview={overview} onOpenOrder={openOrder} />}
            {tab === "orders" && (
              <OrdersView
                orders={orders}
                pagination={pagination}
                search={orderSearch}
                status={orderStatus}
                sort={orderSort}
                counts={overview?.counts}
                onSearch={setOrderSearch}
                onStatus={setOrderStatus}
                onSort={setOrderSort}
                onPage={(page) => loadOrders(page)}
                onOpen={openOrder}
              />
            )}
            {tab === "catalog" && catalog && (
              <CatalogView
                catalog={catalog}
                tab={catalogTab}
                onTab={setCatalogTab}
                saving={saving}
                updateItem={updateCatalogItem}
                updateOption={updateOption}
                updateProductPrintMethod={updateProductPrintMethod}
                updateProductPrintFormat={updateProductPrintFormat}
                saveStatus={saveCatalogStatus}
                createItem={createCatalogItem}
                createPrintCompatibility={createPrintCompatibility}
                deleteItem={deleteCatalogItem}
              />
            )}
          </>
        )}
        {dirtyCatalogItems.length > 0 && (
          <div className="admin-context-savebar" role="status" aria-live="polite">
            <div>
              <b>Есть несохранённые изменения</b>
              <span>{plural(dirtyCatalogItems.length, "изменение", "изменения", "изменений")}</span>
            </div>
            <button type="button" disabled={saving === "catalog-changes"} onClick={saveCatalogChanges}>
              {saving === "catalog-changes" ? "Сохраняем…" : "Сохранить изменения"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function Overview({ overview, onOpenOrder }: { overview: OverviewData; onOpenOrder: (id: string) => void }) {
  const cards = [
    { label: "Всего заказов", value: overview.totalOrders, note: `${overview.counts.NEW} требуют внимания` },
    { label: "Активная сумма", value: money(overview.activeRevenue), note: `${overview.activeOrderCount} без отменённых` },
    { label: "В производстве", value: overview.counts.IN_PRODUCTION, note: `${overview.counts.READY} готовы к выдаче` },
    { label: "Активных товаров", value: overview.activeProducts, note: "публичный каталог" },
  ];
  return (
    <div className="admin-overview">
      <section className="admin-metrics">{cards.map((card) => <article key={card.label}><small>{card.label}</small><strong>{card.value}</strong><span>{card.note}</span></article>)}</section>
      <div className="admin-grid-two">
        <section className="admin-card">
          <header><div><span className="admin-kicker">Последние</span><h2>Новые заявки</h2></div></header>
          <div className="admin-order-mini-list">
            {overview.recentOrders.length ? overview.recentOrders.map((order: OrderSummary) => (
              <button key={order.id} type="button" onClick={() => onOpenOrder(order.id)}>
                <span><b>{order.orderNumber}</b><small>{order.customerName} · {dateTime(order.createdAt)}</small></span>
                <strong>{money(order.total)}</strong><em data-status={order.status}>{statusLabels[order.status]}</em>
              </button>
            )) : <p className="admin-empty">Заказов пока нет.</p>}
          </div>
        </section>
        <section className="admin-card">
          <header><div><span className="admin-kicker">Контроль</span><h2>Последние изменения</h2></div></header>
          <div className="admin-audit-list">
            {overview.auditLog.length ? overview.auditLog.map((event: { id: string; actor: string; action: string; entity: string; createdAt: string }) => (
              <div key={event.id}><i>•</i><span><b>{event.actor}</b><small>{event.action} · {event.entity}</small></span><time>{dateTime(event.createdAt)}</time></div>
            )) : <p className="admin-empty">Изменений пока нет.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function OrdersView(props: {
  orders: OrderSummary[];
  pagination: { page: number; pages: number; total: number };
  search: string;
  status: string;
  sort: string;
  counts?: Record<OrderStatus, number>;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSort: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}) {
  const filters: Array<{ label: string; value: string; statuses: OrderStatus[] }> = [
    { label: "Новые", value: "NEW", statuses: ["NEW"] },
    { label: "В работе", value: "WORK", statuses: ["CONFIRMED", "IN_PRODUCTION"] },
    { label: "Готовые", value: "READY", statuses: ["READY"] },
    { label: "Завершённые", value: "COMPLETED", statuses: ["COMPLETED"] },
    { label: "Отменённые", value: "CANCELLED", statuses: ["CANCELLED"] },
  ];
  return (
    <section className="admin-card admin-orders-card">
      <div className="admin-order-toolbar">
        <label className="admin-search"><span>⌕</span><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Номер, имя или телефон" aria-label="Поиск заказов" /></label>
        <select value={props.status} onChange={(event) => { props.onStatus(event.target.value); }} aria-label="Фильтр по статусу">
          <option value="">Все статусы</option><option value="WORK">В работе</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={props.sort} onChange={(event) => props.onSort(event.target.value)} aria-label="Сортировка заказов">
          <option value="date-desc">Сначала новые</option><option value="date-asc">Сначала старые</option><option value="total-desc">Сумма: больше</option><option value="total-asc">Сумма: меньше</option>
        </select>
        <span className="admin-results-count">{props.pagination.total} заказов</span>
      </div>
      <div className="admin-order-chips" aria-label="Быстрые фильтры заказов">
        <button type="button" className={!props.status ? "active" : ""} onClick={() => props.onStatus("")}>Все</button>
        {filters.map((filter) => <button key={filter.value} type="button" className={props.status === filter.value ? "active" : ""} onClick={() => props.onStatus(filter.value)}>{filter.label}<b>{filter.statuses.reduce((sum, status) => sum + (props.counts?.[status] ?? 0), 0)}</b></button>)}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Заказ</th><th>Клиент</th><th>Получение</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
          <tbody>{props.orders.map((order) => (
            <tr key={order.id} className={`admin-order-row ${order.status === "NEW" ? "is-new" : ""}`} tabIndex={0} role="link" onClick={() => props.onOpen(order.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpen(order.id); } }}>
              <td><b>{order.orderNumber}</b><small>{timeAgo(order.createdAt)} · {dateTime(order.createdAt)} · {plural(order.itemCount, "позиция", "позиции", "позиций")}</small></td>
              <td><b>{order.customerName}</b><small>+{order.customerPhone}</small></td>
              <td>{order.fulfillmentMethod === "DELIVERY" ? "Доставка" : "Самовывоз"}</td>
              <td><strong>{money(order.total)}</strong></td>
              <td><em className="admin-status" data-status={order.status}>{statusLabels[order.status]}</em></td>
              <td><span className="admin-row-action" aria-hidden="true">→</span></td>
            </tr>
          ))}</tbody>
        </table>
        {!props.orders.length && <p className="admin-empty">По выбранным условиям заказов нет.</p>}
      </div>
      <footer className="admin-pagination"><button type="button" disabled={props.pagination.page <= 1} onClick={() => props.onPage(props.pagination.page - 1)}>← Назад</button><span>Страница {props.pagination.page} из {props.pagination.pages}</span><button type="button" disabled={props.pagination.page >= props.pagination.pages} onClick={() => props.onPage(props.pagination.page + 1)}>Далее →</button></footer>
    </section>
  );
}

function CatalogSwitch({
  checked,
  busy,
  onChange,
  onLabel = "На сайте",
  offLabel = "Скрыт",
}: {
  checked: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <label className={`admin-switch ${busy ? "saving" : ""}`}>
      <input type="checkbox" checked={checked} disabled={busy} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
      <b>{busy ? "Сохраняем…" : checked ? onLabel : offLabel}</b>
    </label>
  );
}

function CatalogDeleteButton({ label, busy, onDelete }: { label: string; busy: boolean; onDelete: () => void }) {
  return <button className="admin-delete-button" type="button" disabled={busy} onClick={onDelete} aria-label={`Удалить ${label}`} title={`Удалить ${label}`}>{busy ? "…" : "×"}</button>;
}

function ProductOptionsEditor({
  product,
  saving,
  updateOption,
  saveStatus,
  createItem,
  deleteItem,
}: {
  product: CatalogProduct;
  saving: string;
  updateOption: (productId: string, optionId: string, changes: Partial<CatalogOption>, trackChanges?: boolean) => void;
  saveStatus: (resource: DirtyCatalogResource, id: string, active: boolean) => Promise<void>;
  createItem: (event: FormEvent<HTMLFormElement>, resource: string) => Promise<void>;
  deleteItem: (resource: DeletableCatalogResource, id: string, label: string) => Promise<void>;
}) {
  const colors = product.options.filter((option) => option.type === "COLOR");
  const sizes = product.options.filter((option) => option.type === "SIZE");

  const renderGroup = (type: CatalogOption["type"], title: string, note: string, options: CatalogOption[]) => (
    <section className="admin-variant-group">
      <header>
        <div><h4>{title}</h4><p>{note}</p></div>
        <span>{options.length}</span>
      </header>
      <div className="admin-variant-list">
        {options.map((option) => (
          <div className={`admin-variant-row ${type.toLowerCase()} ${!option.active ? "inactive" : ""}`} key={option.id}>
            {type === "COLOR" && <div className="admin-variant-identity">
              <small>Образец</small>
              <input
                className="admin-color-input"
                type="color"
                value={option.colorHex ?? "#ffffff"}
                aria-label={`Цвет ${option.label}`}
                onChange={(event) => updateOption(product.id, option.id, { colorHex: event.target.value })}
              />
            </div>}
            <label className="admin-variant-field">
              <span>{type === "COLOR" ? "Название цвета" : "Размер"}</span>
              <input value={option.label} onChange={(event) => updateOption(product.id, option.id, { label: event.target.value })} />
            </label>
            <CatalogSwitch
              checked={option.active}
              busy={saving === `status:${option.id}`}
              onLabel="Доступен"
              onChange={(active) => {
                updateOption(product.id, option.id, { active }, false);
                void saveStatus("option", option.id, active);
              }}
            />
            <CatalogDeleteButton label={option.label} busy={saving === `delete:${option.id}`} onDelete={() => void deleteItem("option", option.id, option.label)} />
          </div>
        ))}
      </div>
      <form className={`admin-variant-add ${type.toLowerCase()}`} onSubmit={(event) => createItem(event, "option")}>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="type" value={type} />
        <label><span>{type === "COLOR" ? "Название цвета" : "Размер"}</span><input name="label" required placeholder={type === "COLOR" ? "Оранжевый" : "2XL"} /></label>
        {type === "COLOR" && <label><span>Цвет</span><input name="colorHex" type="color" defaultValue="#ff8800" /></label>}
        <button disabled={saving === "new-option"}>{saving === "new-option" ? "Добавляем…" : `Добавить ${type === "COLOR" ? "цвет" : "размер"}`}</button>
      </form>
    </section>
  );

  return <div className="admin-variant-groups">{renderGroup("COLOR", "Цвета", "Название и оттенок, которые увидит клиент", colors)}{renderGroup("SIZE", "Размеры", "Один размер — одно понятное значение", sizes)}</div>;
}

function ProductPrintEditor(props: {
  product: CatalogProduct;
  methods: PrintMethod[];
  formats: PrintFormat[];
  saving: string;
  updateMethod: (productId: string, methodId: string, changes: Partial<ProductPrintMethod>, trackChanges?: boolean) => void;
  updateFormat: (productId: string, methodId: string, formatId: string, changes: Partial<ProductPrintFormat>, trackChanges?: boolean) => void;
  saveStatus: (resource: DirtyCatalogResource, id: string, active: boolean) => Promise<void>;
  createCompatibility: (resource: "productPrintMethod" | "productPrintFormat", data: Record<string, unknown>) => Promise<void>;
}) {
  return <div className="admin-product-print-editor">
    <p className="admin-product-print-help">Клиент увидит только включённые здесь сочетания. Цена печати складывается из цены способа и доплаты выбранного формата.</p>
    {props.methods.map((method) => {
      const configured = props.product.printMethods.find((item) => item.printMethodId === method.id);
      if (!configured) return <article className="admin-product-method is-unconfigured" key={method.id}>
        <div><b>{method.name}</b><small>{method.description ?? method.slug}</small></div>
        <button type="button" disabled={props.saving === `new-productPrintMethod:${method.id}`} onClick={() => void props.createCompatibility("productPrintMethod", { productId: props.product.id, printMethodId: method.id, priceDelta: method.priceDelta })}>Добавить к товару</button>
      </article>;

      return <article className={`admin-product-method ${configured.active ? "" : "is-disabled"}`} key={configured.id}>
        <header>
          <div><b>{configured.name}</b><small>{configured.description ?? configured.slug}</small></div>
          <label className="admin-print-price"><span>Цена способа, BYN</span><input type="number" min="0" step="0.01" value={configured.priceDelta} onChange={(event) => props.updateMethod(props.product.id, configured.id, { priceDelta: Number(event.target.value) })} /></label>
          <CatalogSwitch checked={configured.active} busy={props.saving === `status:${configured.id}`} onLabel="Доступен" onChange={(active) => { props.updateMethod(props.product.id, configured.id, { active }, false); void props.saveStatus("productPrintMethod", configured.id, active); }} />
        </header>
        <div className="admin-product-format-list">
          {props.formats.map((format) => {
            const configuredFormat = configured.formats.find((item) => item.printFormatId === format.id);
            if (!configuredFormat) return <div className="admin-product-format is-unconfigured" key={format.id}>
              <div><b>{format.code}</b><small>{format.widthCm} × {format.heightCm} см</small></div>
              <button type="button" disabled={props.saving === `new-productPrintFormat:${format.id}`} onClick={() => void props.createCompatibility("productPrintFormat", { productPrintMethodId: configured.id, printFormatId: format.id, priceDelta: format.priceDelta })}>Добавить</button>
            </div>;
            return <div className={`admin-product-format ${configuredFormat.active ? "" : "is-disabled"}`} key={configuredFormat.id}>
              <div><b>{configuredFormat.code}</b><small>{configuredFormat.widthCm} × {configuredFormat.heightCm} см</small></div>
              <label><span>Доплата, BYN</span><input type="number" min="0" step="0.01" value={configuredFormat.priceDelta} onChange={(event) => props.updateFormat(props.product.id, configured.id, configuredFormat.id, { priceDelta: Number(event.target.value) })} /></label>
              <CatalogSwitch checked={configuredFormat.active} busy={props.saving === `status:${configuredFormat.id}`} onLabel="Доступен" onChange={(active) => { props.updateFormat(props.product.id, configured.id, configuredFormat.id, { active }, false); void props.saveStatus("productPrintFormat", configuredFormat.id, active); }} />
            </div>;
          })}
        </div>
      </article>;
    })}
  </div>;
}

function CatalogView(props: {
  catalog: Catalog;
  tab: CatalogTab;
  onTab: (tab: CatalogTab) => void;
  saving: string;
  updateItem: (resource: keyof Catalog, id: string, changes: Record<string, unknown>, trackChanges?: boolean) => void;
  updateOption: (productId: string, optionId: string, changes: Partial<CatalogOption>, trackChanges?: boolean) => void;
  updateProductPrintMethod: (productId: string, methodId: string, changes: Partial<ProductPrintMethod>, trackChanges?: boolean) => void;
  updateProductPrintFormat: (productId: string, methodId: string, formatId: string, changes: Partial<ProductPrintFormat>, trackChanges?: boolean) => void;
  saveStatus: (resource: DirtyCatalogResource, id: string, active: boolean) => Promise<void>;
  createItem: (event: FormEvent<HTMLFormElement>, resource: string) => Promise<void>;
  createPrintCompatibility: (resource: "productPrintMethod" | "productPrintFormat", data: Record<string, unknown>) => Promise<void>;
  deleteItem: (resource: DeletableCatalogResource, id: string, label: string) => Promise<void>;
}) {
  return (
    <div className="admin-catalog">
      <aside className="admin-catalog-guide">
        <b>Как сохраняются изменения</b>
        <span>Переключатели применяются сразу. После изменения названий или цен появится одна кнопка «Сохранить изменения» внизу экрана.</span>
      </aside>
      <nav className="admin-subnav" aria-label="Разделы каталога">
        {([['products', 'Товары и печать'], ['methods', 'Справочник способов'], ['formats', 'Справочник форматов'], ['discounts', 'Скидки']] as const).map(([id, label]) => <button key={id} type="button" className={props.tab === id ? "active" : ""} onClick={() => props.onTab(id)}>{label}</button>)}
      </nav>

      {props.tab === "products" && <div className="admin-product-list">{props.catalog.products.map((product) => (
        <article className="admin-product-editor" key={product.id}>
          <header><div><span className="admin-kicker">{product.slug}</span><input value={product.name} onChange={(event) => props.updateItem("products", product.id, { name: event.target.value })} aria-label="Название товара" /></div><CatalogSwitch checked={product.active} busy={props.saving === `status:${product.id}`} onChange={(active) => { props.updateItem("products", product.id, { active }, false); void props.saveStatus("product", product.id, active); }} /></header>
          <div className="admin-product-fields"><label><span>Описание</span><input value={product.description ?? ""} onChange={(event) => props.updateItem("products", product.id, { description: event.target.value })} /></label><label><span>Базовая цена, BYN</span><input type="number" min="0" step="0.01" value={product.basePrice} onChange={(event) => props.updateItem("products", product.id, { basePrice: Number(event.target.value) })} /></label></div>
          <details><summary>Настроить цвета и размеры <b>{plural(product.options.filter((option) => option.type === "COLOR").length, "цвет", "цвета", "цветов")} · {plural(product.options.filter((option) => option.type === "SIZE").length, "размер", "размера", "размеров")}</b></summary><ProductOptionsEditor product={product} saving={props.saving} updateOption={props.updateOption} saveStatus={props.saveStatus} createItem={props.createItem} deleteItem={props.deleteItem} /></details>
          <details><summary>Настроить способы и форматы печати <b>{plural(product.printMethods.filter((method) => method.active).length, "способ", "способа", "способов")}</b></summary><ProductPrintEditor product={product} methods={props.catalog.printMethods} formats={props.catalog.printFormats} saving={props.saving} updateMethod={props.updateProductPrintMethod} updateFormat={props.updateProductPrintFormat} saveStatus={props.saveStatus} createCompatibility={props.createPrintCompatibility} /></details>
        </article>
      ))}</div>}

      {props.tab === "methods" && <><aside className="admin-catalog-reference-note">Это справочник названий технологий. Доступность и цена настраиваются отдельно внутри каждого товара.</aside><CatalogTable title="Справочник способов" columns={["Название", "Описание", "Начальная цена для новых товаров", "Статус", ""]}>{props.catalog.printMethods.map((item) => <tr key={item.id}><td><input value={item.name} onChange={(event) => props.updateItem("printMethods", item.id, { name: event.target.value })} /><small>{item.slug}</small></td><td><input value={item.description ?? ""} onChange={(event) => props.updateItem("printMethods", item.id, { description: event.target.value })} /></td><td><input type="number" min="0" step="0.01" value={item.priceDelta} onChange={(event) => props.updateItem("printMethods", item.id, { priceDelta: Number(event.target.value) })} /></td><td><CatalogSwitch checked={item.active} busy={props.saving === `status:${item.id}`} onLabel="В справочнике" onChange={(active) => { props.updateItem("printMethods", item.id, { active }, false); void props.saveStatus("printMethod", item.id, active); }} /></td><td><CatalogDeleteButton label={item.name} busy={props.saving === `delete:${item.id}`} onDelete={() => void props.deleteItem("printMethod", item.id, item.name)} /></td></tr>)}</CatalogTable></>}
      {props.tab === "formats" && <><aside className="admin-catalog-reference-note">Это справочник физических размеров. Какие форматы подходят товару и способу печати, задаётся внутри товара.</aside><CatalogTable title="Справочник форматов" columns={["Код", "Ширина, см", "Высота, см", "Начальная доплата", "Статус", ""]}>{props.catalog.printFormats.map((item) => <tr key={item.id}><td><b>{item.code}</b></td><td><input type="number" min="1" step="0.1" value={item.widthCm} onChange={(event) => props.updateItem("printFormats", item.id, { widthCm: Number(event.target.value) })} /></td><td><input type="number" min="1" step="0.1" value={item.heightCm} onChange={(event) => props.updateItem("printFormats", item.id, { heightCm: Number(event.target.value) })} /></td><td><input type="number" min="0" step="0.01" value={item.priceDelta} onChange={(event) => props.updateItem("printFormats", item.id, { priceDelta: Number(event.target.value) })} /></td><td><CatalogSwitch checked={item.active} busy={props.saving === `status:${item.id}`} onLabel="В справочнике" onChange={(active) => { props.updateItem("printFormats", item.id, { active }, false); void props.saveStatus("printFormat", item.id, active); }} /></td><td><CatalogDeleteButton label={`формат ${item.code}`} busy={props.saving === `delete:${item.id}`} onDelete={() => void props.deleteItem("printFormat", item.id, `Формат ${item.code}`)} /></td></tr>)}</CatalogTable></>}
      {props.tab === "discounts" && <CatalogTable title="Скидки за тираж" columns={["Количество от", "Скидка, %", "Статус", ""]}>{props.catalog.discounts.map((item) => <tr key={item.id}><td><input type="number" min="1" value={item.minQuantity} onChange={(event) => props.updateItem("discounts", item.id, { minQuantity: Number(event.target.value) })} /></td><td><input type="number" min="0" max="100" step="0.01" value={item.percent} onChange={(event) => props.updateItem("discounts", item.id, { percent: Number(event.target.value) })} /></td><td><CatalogSwitch checked={item.active} busy={props.saving === `status:${item.id}`} onLabel="Доступна" onChange={(active) => { props.updateItem("discounts", item.id, { active }, false); void props.saveStatus("discount", item.id, active); }} /></td><td><CatalogDeleteButton label={`скидку от ${item.minQuantity} шт.`} busy={props.saving === `delete:${item.id}`} onDelete={() => void props.deleteItem("discount", item.id, `Скидка от ${item.minQuantity} шт.`)} /></td></tr>)}</CatalogTable>}

      {props.tab !== "products" && <NewCatalogItemForm tab={props.tab} saving={props.saving} onSubmit={props.createItem} />}
    </div>
  );
}

function CatalogTable({ title, columns, children }: { title: string; columns: string[]; children: React.ReactNode }) {
  return <section className="admin-card admin-catalog-table"><header><div><span className="admin-kicker">Редактирование</span><h2>{title}</h2></div></header><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>;
}

function NewCatalogItemForm({ tab, saving, onSubmit }: { tab: Exclude<CatalogTab, "products">; saving: string; onSubmit: (event: FormEvent<HTMLFormElement>, resource: string) => Promise<void> }) {
  const resource = tab === "methods" ? "printMethod" : tab === "formats" ? "printFormat" : "discount";
  return <form className="admin-card admin-new-record" onSubmit={(event) => onSubmit(event, resource)}><header><div><span className="admin-kicker">Новая запись</span><h2>{tab === "methods" ? "Добавить способ печати" : tab === "formats" ? "Добавить формат" : "Добавить уровень скидки"}</h2></div></header><div>{tab === "methods" && <><input name="slug" required placeholder="Код" /><input name="name" required placeholder="Название" /><input name="description" placeholder="Описание" /><input name="priceDelta" required type="number" min="0" step="0.01" placeholder="Доплата" /></>}{tab === "formats" && <><input name="code" required placeholder="Код, например A2" /><input name="widthCm" required type="number" min="1" step="0.1" placeholder="Ширина, см" /><input name="heightCm" required type="number" min="1" step="0.1" placeholder="Высота, см" /><input name="priceDelta" required type="number" min="0" step="0.01" placeholder="Доплата" /></>}{tab === "discounts" && <><input name="minQuantity" required type="number" min="1" placeholder="От количества" /><input name="percent" required type="number" min="0" max="100" step="0.01" placeholder="Скидка, %" /></>}<button disabled={saving === `new-${resource}`}>{saving === `new-${resource}` ? "Добавляем…" : "Добавить"}</button></div></form>;
}
