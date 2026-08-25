"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Tab = "overview" | "orders" | "catalog";
type CatalogTab = "products" | "methods" | "formats" | "discounts";
type OrderStatus = "NEW" | "CONFIRMED" | "IN_PRODUCTION" | "READY" | "COMPLETED" | "CANCELLED";

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

type OrderDetails = OrderSummary & {
  deliveryAddress: string | null;
  comment: string | null;
  subtotal: number;
  discountPercent: number;
  items: Array<{
    id: string;
    productName: string;
    colorLabel: string | null;
    sizeLabel: string | null;
    placement: string | null;
    quantity: number;
    baseUnitPrice: number;
    unitPrice: number;
    total: number;
    design: unknown;
    printMethod: { name: string } | null;
    printFormat: { code: string; widthCm: string; heightCm: string } | null;
    assets: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    changedBy: string;
    createdAt: string;
  }>;
};

type CatalogOption = { id: string; type: "COLOR" | "SIZE"; value: string; label: string; colorHex: string | null; priceDelta: number; active: boolean; sortOrder: number };
type CatalogProduct = { id: string; slug: string; name: string; description: string | null; basePrice: number; active: boolean; sortOrder: number; options: CatalogOption[] };
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
  const [tab, setTab] = useState<Tab>("overview");
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("products");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [orderStatus, setOrderStatus] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setOverview(await api("/api/admin/overview"));
  }, []);

  const loadOrders = useCallback(async (page = 1, search = orderSearch, status = orderStatus) => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const result = await api<{ orders: OrderSummary[]; pagination: typeof pagination }>(`/api/admin/orders?${params}`);
    setOrders(result.orders);
    setPagination(result.pagination);
  }, [orderSearch, orderStatus]);

  const loadCatalog = useCallback(async () => {
    setCatalog(await api<Catalog>("/api/admin/catalog"));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<OverviewData>("/api/admin/overview"),
      api<{ orders: OrderSummary[]; pagination: typeof pagination }>("/api/admin/orders?page=1&pageSize=25"),
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
    if (!selectedOrder) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedOrder(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedOrder]);

  async function logout() {
    await api("/api/admin/session", { method: "DELETE" });
    window.location.replace("/admin/login");
  }

  async function openOrder(id: string) {
    setError("");
    try {
      const result = await api<{ order: OrderDetails }>(`/api/admin/orders/${id}`);
      setSelectedOrder(result.order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось открыть заказ.");
    }
  }

  async function updateOrderStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    setSaving("order-status");
    setError("");
    try {
      await api(`/api/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: form.get("status"), note: form.get("note") }),
      });
      await Promise.all([openOrder(selectedOrder.id), loadOrders(pagination.page), loadOverview()]);
      setNotice("Статус заказа обновлён.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось обновить статус.");
    } finally {
      setSaving("");
    }
  }

  function updateCatalogItem(resource: keyof Catalog, id: string, changes: Record<string, unknown>) {
    setCatalog((current) => {
      if (!current) return current;
      if (resource === "products") return { ...current, products: current.products.map((item) => item.id === id ? { ...item, ...changes } : item) };
      return { ...current, [resource]: current[resource].map((item) => item.id === id ? { ...item, ...changes } : item) } as Catalog;
    });
  }

  function updateOption(productId: string, optionId: string, changes: Partial<CatalogOption>) {
    setCatalog((current) => current ? {
      ...current,
      products: current.products.map((product) => product.id === productId
        ? { ...product, options: product.options.map((option) => option.id === optionId ? { ...option, ...changes } : option) }
        : product),
    } : current);
  }

  async function saveCatalogItem(resource: string, id: string, changes: Record<string, unknown>) {
    setSaving(id);
    setError("");
    try {
      await api("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, id, changes }),
      });
      await Promise.all([loadCatalog(), loadOverview()]);
      setNotice("Изменения сохранены.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения.");
    } finally {
      setSaving("");
    }
  }

  async function createCatalogItem(event: FormEvent<HTMLFormElement>, resource: string) {
    event.preventDefault();
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

  const currentTitle = navItems.find((item) => item.id === tab)?.label ?? "Админка";
  const newOrders = overview?.counts.NEW ?? 0;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span>П</span><strong>ПРИНТОПУС</strong><small>управление</small></Link>
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
            {tab === "overview" && overview && <Overview overview={overview} onOpenOrder={(id) => { setTab("orders"); openOrder(id); }} />}
            {tab === "orders" && (
              <OrdersView
                orders={orders}
                pagination={pagination}
                search={orderSearch}
                status={orderStatus}
                onSearch={setOrderSearch}
                onStatus={setOrderStatus}
                onSubmit={() => loadOrders(1)}
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
                saveItem={saveCatalogItem}
                createItem={createCatalogItem}
              />
            )}
          </>
        )}
      </section>

      {selectedOrder && <OrderPanel order={selectedOrder} saving={saving === "order-status"} onClose={() => setSelectedOrder(null)} onSubmit={updateOrderStatus} />}
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
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSubmit: () => void;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="admin-card admin-orders-card">
      <form className="admin-order-toolbar" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
        <label className="admin-search"><span>⌕</span><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Номер, имя или телефон" aria-label="Поиск заказов" /></label>
        <select value={props.status} onChange={(event) => { props.onStatus(event.target.value); }} aria-label="Фильтр по статусу">
          <option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit">Найти</button><span className="admin-results-count">{props.pagination.total} заказов</span>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Заказ</th><th>Клиент</th><th>Получение</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
          <tbody>{props.orders.map((order) => (
            <tr key={order.id}>
              <td><b>{order.orderNumber}</b><small>{dateTime(order.createdAt)} · {order.itemCount} поз.</small></td>
              <td><b>{order.customerName}</b><small>+{order.customerPhone}</small></td>
              <td>{order.fulfillmentMethod === "DELIVERY" ? "Доставка" : "Самовывоз"}</td>
              <td><strong>{money(order.total)}</strong></td>
              <td><em className="admin-status" data-status={order.status}>{statusLabels[order.status]}</em></td>
              <td><button type="button" className="admin-row-action" onClick={() => props.onOpen(order.id)} aria-label={`Открыть ${order.orderNumber}`}>→</button></td>
            </tr>
          ))}</tbody>
        </table>
        {!props.orders.length && <p className="admin-empty">По выбранным условиям заказов нет.</p>}
      </div>
      <footer className="admin-pagination"><button type="button" disabled={props.pagination.page <= 1} onClick={() => props.onPage(props.pagination.page - 1)}>← Назад</button><span>Страница {props.pagination.page} из {props.pagination.pages}</span><button type="button" disabled={props.pagination.page >= props.pagination.pages} onClick={() => props.onPage(props.pagination.page + 1)}>Далее →</button></footer>
    </section>
  );
}

function OrderPanel({ order, saving, onClose, onSubmit }: { order: OrderDetails; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="admin-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="admin-order-panel" role="dialog" aria-modal="true" aria-labelledby="order-panel-title">
        <header><div><span className="admin-kicker">Заказ</span><h2 id="order-panel-title">{order.orderNumber}</h2><p>{dateTime(order.createdAt)}</p></div><button type="button" onClick={onClose} aria-label="Закрыть заказ">×</button></header>
        <div className="admin-panel-scroll">
          <section className="admin-order-customer"><div><small>Клиент</small><strong>{order.customerName}</strong><a href={`tel:+${order.customerPhone}`}>+{order.customerPhone}</a></div><div><small>Получение</small><strong>{order.fulfillmentMethod === "DELIVERY" ? "Доставка" : "Самовывоз"}</strong><span>{order.deliveryAddress || "ул. Октябрьская, 16"}</span></div></section>
          {order.comment && <section className="admin-order-comment"><small>Комментарий клиента</small><p>{order.comment}</p></section>}
          <section className="admin-order-items"><h3>Состав заказа</h3>{order.items.map((item) => <article key={item.id}><div><strong>{item.productName}</strong><span>{item.colorLabel} · {item.sizeLabel} · {item.placement}</span><small>{item.printMethod?.name} · {item.printFormat?.code} · {item.quantity} шт.</small></div><b>{money(item.total)}</b></article>)}</section>
          <section className="admin-order-totals"><div><span>До скидки</span><b>{money(order.subtotal)}</b></div><div><span>Скидка</span><b>{order.discountPercent}%</b></div><div><span>Итого</span><strong>{money(order.total)}</strong></div></section>
          <form className="admin-status-form" onSubmit={onSubmit}><h3>Изменить статус</h3><label><span>Новый статус</span><select name="status" defaultValue={order.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Комментарий для истории</span><textarea name="note" rows={2} maxLength={500} placeholder="Например: согласован макет" /></label><button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить статус"}</button></form>
          <section className="admin-history"><h3>История статусов</h3>{order.statusHistory.length ? order.statusHistory.map((event) => <div key={event.id}><i data-status={event.toStatus} /><span><b>{statusLabels[event.toStatus]}</b><small>{event.note || `Изменил ${event.changedBy}`}</small></span><time>{dateTime(event.createdAt)}</time></div>) : <p className="admin-empty">Статус ещё не менялся.</p>}</section>
        </div>
      </aside>
    </div>
  );
}

function CatalogView(props: {
  catalog: Catalog;
  tab: CatalogTab;
  onTab: (tab: CatalogTab) => void;
  saving: string;
  updateItem: (resource: keyof Catalog, id: string, changes: Record<string, unknown>) => void;
  updateOption: (productId: string, optionId: string, changes: Partial<CatalogOption>) => void;
  saveItem: (resource: string, id: string, changes: Record<string, unknown>) => Promise<void>;
  createItem: (event: FormEvent<HTMLFormElement>, resource: string) => Promise<void>;
}) {
  return (
    <div className="admin-catalog">
      <nav className="admin-subnav" aria-label="Разделы каталога">
        {([['products', 'Товары'], ['methods', 'Способы печати'], ['formats', 'Форматы'], ['discounts', 'Скидки']] as const).map(([id, label]) => <button key={id} type="button" className={props.tab === id ? "active" : ""} onClick={() => props.onTab(id)}>{label}</button>)}
      </nav>

      {props.tab === "products" && <div className="admin-product-list">{props.catalog.products.map((product) => (
        <article className="admin-product-editor" key={product.id}>
          <header><div><span className="admin-kicker">{product.slug}</span><input value={product.name} onChange={(event) => props.updateItem("products", product.id, { name: event.target.value })} aria-label="Название товара" /></div><label className="admin-switch"><input type="checkbox" checked={product.active} onChange={(event) => props.updateItem("products", product.id, { active: event.target.checked })} /><span />Активен</label></header>
          <div className="admin-product-fields"><label><span>Описание</span><input value={product.description ?? ""} onChange={(event) => props.updateItem("products", product.id, { description: event.target.value })} /></label><label><span>Базовая цена, BYN</span><input type="number" min="0" step="0.01" value={product.basePrice} onChange={(event) => props.updateItem("products", product.id, { basePrice: Number(event.target.value) })} /></label><button type="button" disabled={props.saving === product.id} onClick={() => props.saveItem("product", product.id, { name: product.name, description: product.description, basePrice: product.basePrice, active: product.active })}>{props.saving === product.id ? "Сохраняем…" : "Сохранить товар"}</button></div>
          <details><summary>Цвета и размеры <b>{product.options.length}</b></summary><div className="admin-options-grid">{product.options.map((option) => <div key={option.id} className={!option.active ? "inactive" : ""}><span className="admin-option-kind">{option.type === "COLOR" ? "Цвет" : "Размер"}</span>{option.colorHex && <i style={{ backgroundColor: option.colorHex }} />}<input value={option.label} onChange={(event) => props.updateOption(product.id, option.id, { label: event.target.value })} aria-label="Название варианта" /><input type="number" min="0" step="0.01" value={option.priceDelta} onChange={(event) => props.updateOption(product.id, option.id, { priceDelta: Number(event.target.value) })} aria-label="Доплата" /><label><input type="checkbox" checked={option.active} onChange={(event) => props.updateOption(product.id, option.id, { active: event.target.checked })} /> доступен</label><button type="button" disabled={props.saving === option.id} onClick={() => props.saveItem("option", option.id, { label: option.label, colorHex: option.colorHex, priceDelta: option.priceDelta, active: option.active })}>Сохранить</button></div>)}</div>
            <form className="admin-add-form" onSubmit={(event) => props.createItem(event, "option")}><input type="hidden" name="productId" value={product.id} /><select name="type"><option value="COLOR">Цвет</option><option value="SIZE">Размер</option></select><input name="value" required placeholder="Код: orange" /><input name="label" required placeholder="Название" /><input name="colorHex" placeholder="#ff8800" /><input name="priceDelta" type="number" min="0" step="0.01" defaultValue="0" /><button disabled={props.saving === "new-option"}>Добавить вариант</button></form>
          </details>
        </article>
      ))}</div>}

      {props.tab === "methods" && <CatalogTable title="Способы печати" columns={["Название", "Описание", "Доплата", "Доступен", ""]}>{props.catalog.printMethods.map((item) => <tr key={item.id}><td><input value={item.name} onChange={(event) => props.updateItem("printMethods", item.id, { name: event.target.value })} /><small>{item.slug}</small></td><td><input value={item.description ?? ""} onChange={(event) => props.updateItem("printMethods", item.id, { description: event.target.value })} /></td><td><input type="number" min="0" step="0.01" value={item.priceDelta} onChange={(event) => props.updateItem("printMethods", item.id, { priceDelta: Number(event.target.value) })} /></td><td><input type="checkbox" checked={item.active} onChange={(event) => props.updateItem("printMethods", item.id, { active: event.target.checked })} /></td><td><button type="button" onClick={() => props.saveItem("printMethod", item.id, { name: item.name, description: item.description, priceDelta: item.priceDelta, active: item.active })}>Сохранить</button></td></tr>)}</CatalogTable>}
      {props.tab === "formats" && <CatalogTable title="Форматы печати" columns={["Код", "Ширина", "Высота", "Доплата", "Доступен", ""]}>{props.catalog.printFormats.map((item) => <tr key={item.id}><td><b>{item.code}</b></td><td><input type="number" min="1" step="0.1" value={item.widthCm} onChange={(event) => props.updateItem("printFormats", item.id, { widthCm: Number(event.target.value) })} /></td><td><input type="number" min="1" step="0.1" value={item.heightCm} onChange={(event) => props.updateItem("printFormats", item.id, { heightCm: Number(event.target.value) })} /></td><td><input type="number" min="0" step="0.01" value={item.priceDelta} onChange={(event) => props.updateItem("printFormats", item.id, { priceDelta: Number(event.target.value) })} /></td><td><input type="checkbox" checked={item.active} onChange={(event) => props.updateItem("printFormats", item.id, { active: event.target.checked })} /></td><td><button type="button" onClick={() => props.saveItem("printFormat", item.id, { widthCm: item.widthCm, heightCm: item.heightCm, priceDelta: item.priceDelta, active: item.active })}>Сохранить</button></td></tr>)}</CatalogTable>}
      {props.tab === "discounts" && <CatalogTable title="Скидки за тираж" columns={["От количества", "Скидка, %", "Доступна", ""]}>{props.catalog.discounts.map((item) => <tr key={item.id}><td><input type="number" min="1" value={item.minQuantity} onChange={(event) => props.updateItem("discounts", item.id, { minQuantity: Number(event.target.value) })} /></td><td><input type="number" min="0" max="100" step="0.01" value={item.percent} onChange={(event) => props.updateItem("discounts", item.id, { percent: Number(event.target.value) })} /></td><td><input type="checkbox" checked={item.active} onChange={(event) => props.updateItem("discounts", item.id, { active: event.target.checked })} /></td><td><button type="button" onClick={() => props.saveItem("discount", item.id, { minQuantity: item.minQuantity, percent: item.percent, active: item.active })}>Сохранить</button></td></tr>)}</CatalogTable>}

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
