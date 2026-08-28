"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type OrderStatus = "NEW" | "CONFIRMED" | "IN_PRODUCTION" | "READY" | "COMPLETED" | "CANCELLED";
type PrintView = "front" | "back" | "sleeve_left" | "sleeve_right";

type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  contactMethod: "PHONE" | "TELEGRAM";
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  deliveryAddress: string | null;
  comment: string | null;
  subtotal: number;
  discountPercent: number;
  total: number;
  createdAt: string;
  items: Array<{
    id: string;
    productName: string;
    colorLabel: string | null;
    sizeLabel: string | null;
    placement: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
    printMethod: { name: string } | null;
    printFormat: { code: string; widthCm: string; heightCm: string } | null;
    product: { slug: string } | null;
    colorValue: string | null;
    colorHex: string | null;
    design: unknown;
    assets: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null }>;
  }>;
  statusHistory: Array<{ id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; changedBy: string; createdAt: string }>;
};

const statusLabels: Record<OrderStatus, string> = {
  NEW: "Новый",
  CONFIRMED: "Подтверждён",
  IN_PRODUCTION: "В производстве",
  READY: "Готов",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const workflow: OrderStatus[] = ["NEW", "CONFIRMED", "IN_PRODUCTION", "READY", "COMPLETED"];
const nextAction: Partial<Record<OrderStatus, string>> = {
  NEW: "Подтвердить заказ",
  CONFIRMED: "Передать в производство",
  IN_PRODUCTION: "Отметить готовым",
  READY: "Завершить заказ",
};

function money(value: number) {
  return `${new Intl.NumberFormat("ru-BY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} BYN`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ru-BY", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function fileSize(value: number) {
  return value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} МБ` : `${Math.max(1, Math.round(value / 1024))} КБ`;
}

const placementLabels: Record<string, string> = {
  center: "Спереди по центру",
  chest_left: "Спереди слева",
  back: "На спине",
  sleeve_left: "На левом рукаве",
  sleeve_right: "На правом рукаве",
};

const colorKeysByLabel: Record<string, string> = {
  "Белый": "white", "Натуральный": "natural", "Чёрный": "black", "Хаки / Олива": "khaki", "Меланж": "grey",
  "Тёмно-серый": "darkgrey", "Тёмно-синий": "navy", "Синий": "blue", "Красный": "red", "Бордовый": "burgundy", "Зелёный": "green", "Песочный": "sand",
};

const printZones: Record<string, Partial<Record<PrintView, { canvas: number; x: number; y: number; width: number; height: number }>>> = {
  shirt: { front: { canvas: 799.101, x: 231.169, y: 122.719, width: 331, height: 399 }, back: { canvas: 759.829, x: 219.808, y: 81.41, width: 314, height: 379 }, sleeve_right: { canvas: 317.5, x: 94.116, y: 149.679, width: 97, height: 109 }, sleeve_left: { canvas: 317.5, x: 121.33, y: 149.679, width: 96, height: 109 } },
  hoodie: { front: { canvas: 833.763, x: 241.196, y: 196.53, width: 348, height: 297 }, back: { canvas: 897.98, x: 272.602, y: 214.874, width: 355, height: 445 }, sleeve_right: { canvas: 797.309, x: 338.857, y: 165.157, width: 93, height: 373 }, sleeve_left: { canvas: 797.309, x: 361.637, y: 165.157, width: 93, height: 373 } },
  polo: { front: { canvas: 856.902, x: 254.214, y: 147.102, width: 349, height: 457 }, back: { canvas: 855.939, x: 253.929, y: 109.846, width: 348, height: 457 }, sleeve_right: { canvas: 375.502, x: 120.697, y: 185.069, width: 95, height: 95 }, sleeve_left: { canvas: 375.508, x: 158.965, y: 184.938, width: 95, height: 95 } },
  cap: { front: { canvas: 309.621, x: 91.781, y: 139.33, width: 127, height: 50 }, sleeve_right: { canvas: 309.621, x: 144.859, y: 138.224, width: 65, height: 50 }, sleeve_left: { canvas: 309.621, x: 99.521, y: 138.224, width: 65, height: 50 } },
  bag: { front: { canvas: 747.844, x: 248.391, y: 355.226, width: 251, height: 299 }, back: { canvas: 747.844, x: 248.391, y: 355.226, width: 251, height: 299 } },
};

function getPrintZoneStyle(productSlug: string | undefined, view: PrintView) {
  const zone = productSlug ? printZones[productSlug]?.[view] : undefined;
  if (!zone) return undefined;
  return {
    left: `${(zone.x / zone.canvas) * 100}%`, top: `${(zone.y / zone.canvas) * 100}%`, width: `${(zone.width / zone.canvas) * 100}%`, height: `${(zone.height / zone.canvas) * 100}%`,
  };
}

function getMockupPath(item: Order["items"][number], view: PrintView) {
  const product = item.product?.slug;
  if (!product || !["shirt", "hoodie", "polo", "cap", "bag"].includes(product)) return null;
  const folder = product === "shirt" ? "tshirt" : product;
  const viewSlug = view === "back" ? "back" : view === "sleeve_left" ? "sleeve-left" : view === "sleeve_right" ? "sleeve-right" : "front";
  const color = item.colorValue ?? colorKeysByLabel[item.colorLabel ?? ""] ?? "white";
  return `/mockups/spreadshirt/${folder}/${folder}-${color}-${viewSlug}.png`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSavedPrintViews(item: Order["items"][number]): Array<{ view: PrintView; placement: string; artwork: Order["items"][number]["assets"][number] | undefined }> {
  const views: PrintView[] = ["front", "back", "sleeve_left", "sleeve_right"];
  const design = isRecord(item.design) ? item.design : null;
  let imageIndex = 0;
  const savedViews = views.flatMap((view) => {
    const elements = design && Array.isArray(design[view]) ? design[view].filter(isRecord) : [];
    const imageCount = elements.filter((element) => element.type === "image").length;
    const artwork = imageCount > 0 ? item.assets[imageIndex] : undefined;
    imageIndex += imageCount;
    if (elements.length === 0) return [];
    const placement = view === "front"
      ? item.placement === "center" || item.placement === "chest_left" ? item.placement : "center"
      : view;
    return [{ view, placement, artwork }];
  });
  if (savedViews.length) return savedViews;
  const placement = item.placement ?? "center";
  const view: PrintView = placement === "back" || placement === "sleeve_left" || placement === "sleeve_right" ? placement : "front";
  return [{ view, placement, artwork: item.assets.find((asset) => asset.mimeType.startsWith("image/")) }];
}

function OrderPrintPreviews({ item }: { item: Order["items"][number] }) {
  const previews = getSavedPrintViews(item);
  return <div className="admin-print-preview-list">{previews.map(({ view, placement, artwork }) => {
    const mockup = getMockupPath(item, view);
    const label = placementLabels[placement] ?? placement;
    if (!mockup) return null;
    return <figure className="admin-print-preview" key={view}><div className="admin-garment-preview" data-placement={placement} style={{ backgroundImage: `url(${mockup})` }} role="img" aria-label={`${item.productName}: ${label}`}><span className="admin-print-zone-marker" style={getPrintZoneStyle(item.product?.slug, view)}>{artwork?.mimeType.startsWith("image/") ? <i style={{ backgroundImage: `url(/api/admin/assets/${artwork.id}?preview=1)` }} aria-hidden="true" /> : "Зона печати"}</span></div><figcaption>{label}</figcaption></figure>;
  })}</div>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (response.status === 401) {
    throw new Error("Сессия завершена.");
  }
  if (!response.ok) throw new Error(result.error?.message ?? "Не удалось выполнить запрос.");
  return result;
}

export default function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const backHref = useMemo(() => {
    const candidate = searchParams.get("back");
    return candidate?.startsWith("/admin") ? candidate : "/admin?tab=orders";
  }, [searchParams]);

  const loadOrder = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ order: Order }>(`/api/admin/orders/${orderId}`);
      setOrder(result.order);
    } catch (reason) {
      if (reason instanceof Error && reason.message === "Сессия завершена.") {
        router.replace("/admin/login");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить заказ.");
    }
  }, [orderId, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOrder(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOrder]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Не удалось скопировать. Выделите текст и скопируйте вручную.");
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !pendingStatus) return;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    const currentIndex = workflow.indexOf(order.status);
    const targetIndex = workflow.indexOf(pendingStatus);
    const requiresReason = pendingStatus === "CANCELLED" || order.status === "CANCELLED" || (targetIndex >= 0 && currentIndex >= 0 && targetIndex < currentIndex);
    if (requiresReason && !note) {
      setError(pendingStatus === "CANCELLED" ? "Укажите причину отмены." : "Укажите комментарий к возврату на предыдущий этап.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pendingStatus, note }),
      });
      await loadOrder();
      setPendingStatus(null);
      setNotice("Статус заказа обновлён.");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "Сессия завершена.") {
        router.replace("/admin/login");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Не удалось обновить статус.");
    } finally {
      setSaving(false);
    }
  }

  if (!order) return <main className="admin-order-page"><p className="admin-loading">{error || "Загружаем заказ…"}</p></main>;

  const currentIndex = workflow.indexOf(order.status);
  const proposedIndex = pendingStatus ? workflow.indexOf(pendingStatus) : -1;
  const nextStatus = currentIndex >= 0 ? workflow[currentIndex + 1] : undefined;
  const requiresReason = pendingStatus === "CANCELLED" || order.status === "CANCELLED" || (proposedIndex >= 0 && currentIndex >= 0 && proposedIndex < currentIndex);

  return (
    <main className="admin-order-page">
      <header className="admin-order-page-header">
        <div className="admin-order-heading">
          <Link href={backHref} className="admin-order-back">← К списку заказов</Link>
          <div><h1>{order.orderNumber}</h1><em className="admin-status" data-status={order.status}>{statusLabels[order.status]}</em></div>
          <p>{dateTime(order.createdAt)}</p>
        </div>
        <div className="admin-order-header-actions">
          <a className="admin-secondary-action" href={`tel:+${order.customerPhone}`}>Позвонить</a>
          <button type="button" className="admin-primary-action" onClick={() => setPendingStatus(nextStatus ?? order.status)} disabled={!nextStatus}>{nextStatus ? nextAction[order.status] : "Статус завершён"}</button>
        </div>
      </header>

      {notice && <button type="button" className="admin-notice success" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {error && <button type="button" className="admin-notice error" onClick={() => setError("")}>{error}<span>×</span></button>}

      <div className="admin-order-layout">
        <section className="admin-order-card admin-order-items-card">
          <header><div><span className="admin-kicker">Состав заказа</span><h2>Изделия, параметры и макеты</h2></div><strong>{order.items.length} поз.</strong></header>
          <div className="admin-order-item-list">
            {order.items.map((item) => <article key={item.id} className="admin-order-item">
              <div className="admin-order-item-main"><OrderPrintPreviews item={item} /><div className="admin-order-item-details"><div className="admin-item-title"><h3>{item.productName}</h3><b>× {item.quantity}</b></div>
                <dl><div><dt>Цвет</dt><dd>{item.colorLabel && <i className="admin-color-swatch" style={{ backgroundColor: item.colorHex ?? undefined }} aria-hidden="true" />}{item.colorLabel || "Не указан"}</dd></div><div><dt>Размер</dt><dd>{item.sizeLabel || "Не указан"}</dd></div><div><dt>Печать</dt><dd>{item.printMethod?.name || "Не указана"}</dd></div><div><dt>Формат</dt><dd>{item.printFormat ? `${item.printFormat.code} · ${item.printFormat.widthCm}×${item.printFormat.heightCm} см` : "Не указан"}</dd></div><div><dt>Расположение</dt><dd>{item.placement || "Не указано"}</dd></div></dl>
                {item.assets.length > 0 && <div className="admin-order-assets">{item.assets.map((asset) => <a key={asset.id} href={`/api/admin/assets/${asset.id}`} download>{asset.mimeType.startsWith("image/") && <i className="admin-asset-preview" style={{ backgroundImage: `url(/api/admin/assets/${asset.id}?preview=1)` }} aria-hidden="true" />}<span>Скачать макет</span><b>{asset.originalName}</b><small>{fileSize(asset.sizeBytes)}{asset.width && asset.height ? ` · ${asset.width}×${asset.height} px` : ""}</small></a>)}</div>}
              </div></div>
              <div className="admin-item-price"><small>{money(item.unitPrice)} / шт.</small><strong>{money(item.total)}</strong></div>
            </article>)}
          </div>
          {order.comment && <aside className="admin-order-comment"><span className="admin-kicker">Комментарий клиента</span><p>{order.comment}</p></aside>}
        </section>

        <aside className="admin-order-side">
          <section className="admin-order-card admin-contact-card"><header><span className="admin-kicker">Клиент</span><h2>{order.customerName}</h2></header><a className="admin-contact-value" href={`tel:+${order.customerPhone}`}>+{order.customerPhone}</a><div className="admin-quick-actions"><a href={`tel:+${order.customerPhone}`}>Позвонить</a>{order.contactMethod === "TELEGRAM" && <a href={`https://t.me/+${order.customerPhone}`} target="_blank" rel="noreferrer">Telegram ↗</a>}<button type="button" onClick={() => void copy(`+${order.customerPhone}`, "Телефон скопирован")}>{copied === "Телефон скопирован" ? "Скопировано" : "Копировать телефон"}</button></div></section>
          <section className="admin-order-card admin-fulfillment-card"><header><span className="admin-kicker">Получение</span><h2>{order.fulfillmentMethod === "DELIVERY" ? "Доставка" : "Самовывоз"}</h2></header><p>{order.fulfillmentMethod === "DELIVERY" ? order.deliveryAddress || "Адрес не указан" : "ул. Октябрьская, 16"}</p>{order.fulfillmentMethod === "DELIVERY" && <button type="button" className="admin-text-action" onClick={() => void copy(order.deliveryAddress || "", "Адрес скопирован")} disabled={!order.deliveryAddress}>{copied === "Адрес скопирован" ? "Скопировано" : "Копировать адрес"}</button>}</section>
          <section className="admin-order-card admin-total-card"><span className="admin-kicker">Расчёт стоимости</span><div><span>До скидки</span><b>{money(order.subtotal)}</b></div><div><span>Скидка</span><b>{order.discountPercent}%</b></div><div className="admin-total-result"><span>Итого</span><strong>{money(order.total)}</strong></div></section>
          <section className="admin-order-card admin-status-card">
            <header className="admin-status-card-header">
              <div>
                <span className="admin-kicker">Статус заказа</span>
                <div className="admin-status-current">
                  <em className="admin-status" data-status={order.status}>{statusLabels[order.status]}</em>
                  <span>{order.status === "CANCELLED" ? "Процесс остановлен" : `Этап ${currentIndex + 1} из ${workflow.length}`}</span>
                </div>
              </div>
              <p>{order.status === "CANCELLED" ? "Заказ исключён из рабочего процесса." : nextStatus ? `Далее — ${statusLabels[nextStatus].toLowerCase()}.` : "Все этапы заказа пройдены."}</p>
            </header>

            {order.status === "CANCELLED" ? (
              <div className="admin-status-cancelled">
                <i aria-hidden="true">×</i>
                <div><strong>Заказ отменён</strong><span>Причину и дату можно посмотреть в истории ниже.</span></div>
              </div>
            ) : (
              <ol className="admin-status-stepper" aria-label="Этапы выполнения заказа">
                {workflow.map((status, index) => {
                  const state = index < currentIndex ? "done" : index === currentIndex ? "current" : index === currentIndex + 1 ? "next" : "future";
                  return (
                    <li key={status} className={state}>
                      <i aria-hidden="true">{index < currentIndex ? "✓" : index + 1}</i>
                      <span><b>{statusLabels[status]}</b>{state === "current" && <small>Текущий этап</small>}{state === "next" && <small>Следующий</small>}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <details className="admin-status-more">
              <summary><span>Другие действия</span><i aria-hidden="true">⌄</i></summary>
              <div className="admin-other-status">
                {order.status === "CANCELLED" ? (
                  <button type="button" onClick={() => setPendingStatus("NEW")}>Возобновить как новый</button>
                ) : (
                  <>
                    {currentIndex > 0 && <button type="button" onClick={() => setPendingStatus(workflow[currentIndex - 1])}>Вернуть на этап «{statusLabels[workflow[currentIndex - 1]]}»</button>}
                    <button type="button" className="danger" onClick={() => setPendingStatus("CANCELLED")}>Отменить заказ</button>
                  </>
                )}
              </div>
            </details>
          </section>
        </aside>
      </div>

      <section className="admin-order-history"><header><span className="admin-kicker">История заказа</span><h2>Изменения статусов</h2></header>{order.statusHistory.length ? <div className="admin-history-timeline">{order.statusHistory.map((event) => <article key={event.id}><i data-status={event.toStatus} /><div><b>{event.fromStatus ? `${statusLabels[event.fromStatus]} → ${statusLabels[event.toStatus]}` : statusLabels[event.toStatus]}</b><span>{event.changedBy} · {dateTime(event.createdAt)}</span>{event.note && <p>{event.note}</p>}</div></article>)}</div> : <p className="admin-history-empty">Изменений статуса ещё не было.</p>}</section>
      <button type="button" className="admin-mobile-status-action" onClick={() => setPendingStatus(nextStatus ?? order.status)} disabled={!nextStatus}>{nextStatus ? nextAction[order.status] : "Статус завершён"}</button>

      {pendingStatus && pendingStatus !== order.status && <div className="admin-status-confirm-backdrop" role="presentation"><form className="admin-status-confirm" onSubmit={changeStatus}><span className="admin-kicker">Подтверждение изменения</span><h2>{statusLabels[order.status]} → {statusLabels[pendingStatus]}</h2><p>{requiresReason ? pendingStatus === "CANCELLED" ? "Для отмены заказа обязательно укажите причину." : "При возврате на предыдущий этап нужен комментарий." : "Статус изменится только после явного подтверждения."}</p><label><span>Комментарий{requiresReason ? " (обязательно)" : ""}</span><textarea name="note" rows={3} required={requiresReason} maxLength={500} placeholder={requiresReason ? "Опишите причину" : "Например: согласован макет"} /></label><div><button type="button" className="admin-secondary-action" onClick={() => setPendingStatus(null)}>Отмена</button><button type="submit" className="admin-primary-action" disabled={saving}>{saving ? "Сохраняем…" : nextAction[order.status] && pendingStatus === nextStatus ? nextAction[order.status] : "Подтвердить изменение"}</button></div></form></div>}
    </main>
  );
}
