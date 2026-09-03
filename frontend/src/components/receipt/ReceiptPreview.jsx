import { Fragment } from "react";
import logo from "../../assets/marjon-logo.svg";
import { CUSTOMER_BLOCKS, KITCHEN_BLOCKS } from "../../api/receipt";

export const customerSampleOrder = {
  order_number: "3",
  table_number: "1 (Divanli Kabina)",
  waiter: "Kassir",
  order_type: "На стол",
  payment_method: "Смешанная оплата",
  discount: 0,
  service_fee: 8000,
  vat: 0,
  total_amount: 108640,
  created_at: "2025-07-31T18:17:00",
  payments: [
    { label: "Наличные", amount: 108000 },
    { label: "Карта", amount: 600 },
  ],
  items: [
    { id: 1, name: "Somsa", quantity: 10, price: 8000, total: 80000 },
    { id: 2, name: "Shashlik tovuqli 200g", quantity: 2, price: 32000, total: 64000 },
  ],
};

export const kitchenSampleOrder = {
  order_number: "A-1042",
  table_number: "12",
  waiter: "Aziz",
  priority: "Срочно",
  note: "Без лука в салате",
  created_at: "2026-07-27T10:41:00",
  items: [
    {
      id: 1,
      name: "Плов чайханский",
      quantity: 2,
      modifiers: ["Без казы", "Острый соус отдельно"],
      note: "",
    },
    { id: 2, name: "Салат Ачичук", quantity: 1, modifiers: ["Меньше соли"], note: "" },
    { id: 3, name: "Плов чайханский", quantity: 1, modifiers: ["Один без моркови"], note: "" },
  ],
};

// Контракт конструктора — зеркало backend/app/modules/printers/formatter.py.
// Группы задают, какие блоки печатаются одним куском между разделителями.
const CUSTOMER_GROUPS = {
  logo: "head",
  restaurantName: "head",
  orderNumber: "info",
  table: "info",
  waiter: "info",
  dateTime: "info",
  items: "items",
  discount: "summary",
  serviceFee: "summary",
  vat: "summary",
  total: "total",
  paymentMethod: "pay",
  qr: "qr",
  thankYouText: "foot",
  footerText: "foot",
  address: "foot",
  phone: "foot",
};

const KITCHEN_GROUPS = {
  orderNumber: "head",
  table: "head",
  waiter: "head",
  createdAt: "head",
  items: "items",
  modifiers: "items",
  itemComments: "items",
  orderNote: "note",
  priority: "urgent",
};

// Эти блоки не участвуют в порядке групп: они всегда идут в подвале.
const POSITIONLESS_BLOCKS = ["address", "phone"];
// Выключены, если владелец не сохранил флаг явно.
const DEFAULT_OFF_BLOCKS = ["address", "phone", "qr", "vat"];

const BASE_STYLE = { size: "standard", align: "left", weight: "standard" };

const CUSTOMER_STYLES = {
  restaurantName: { size: "large", align: "center", weight: "bold" },
  orderNumber: { size: "standard", align: "center", weight: "bold" },
  dateTime: { size: "standard", align: "center", weight: "bold" },
  total: { size: "xlarge", align: "left", weight: "standard" },
  thankYouText: { size: "large", align: "center", weight: "bold" },
  footerText: { size: "large", align: "center", weight: "bold" },
};

const KITCHEN_STYLES = {
  orderNumber: { size: "xlarge", align: "center", weight: "bold" },
  table: { size: "large", align: "left", weight: "standard" },
  waiter: { size: "large", align: "left", weight: "standard" },
  createdAt: { size: "large", align: "left", weight: "standard" },
  items: { size: "large", align: "left", weight: "bold" },
  modifiers: { size: "large", align: "left", weight: "standard" },
  itemComments: { size: "large", align: "left", weight: "standard" },
  orderNote: { size: "large", align: "left", weight: "standard" },
  priority: { size: "large", align: "center", weight: "bold" },
};

// Порядок блоков: сохранённый первым, незнакомые отбрасываем, пропущенные дописываем.
function templateBlocks(template, fallback) {
  const saved = [];
  const raw = Array.isArray(template?.blocks) ? template.blocks : [];
  raw.forEach((block) => {
    if (fallback.includes(block) && !saved.includes(block)) saved.push(block);
  });
  return [...saved, ...fallback.filter((block) => !saved.includes(block))];
}

function blockEnabled(template, block) {
  const enabled = template?.enabled;
  if (!enabled || typeof enabled !== "object" || !(block in enabled)) {
    return !DEFAULT_OFF_BLOCKS.includes(block);
  }
  return Boolean(enabled[block]);
}

function blockStyle(template, block, defaults) {
  const style = { ...BASE_STYLE, ...(defaults[block] || {}) };
  const saved = template?.blockStyles?.[block];
  if (saved && typeof saved === "object") {
    ["size", "align", "weight"].forEach((key) => {
      if (typeof saved[key] === "string" && saved[key]) style[key] = saved[key];
    });
  }
  return style;
}

function groupOrder(blocks, groups) {
  const order = [];
  blocks.forEach((block) => {
    if (POSITIONLESS_BLOCKS.includes(block)) return;
    const group = groups[block];
    if (group && !order.includes(group)) order.push(group);
  });
  return order;
}

// Класс стиля ставим только там, где владелец отклонился от дефолта блока:
// иначе класс перебил бы собственную типографику блока (900, абсолютные pt).
function blockClass(style, block, defaults, { align = true } = {}) {
  const base = { ...BASE_STYLE, ...(defaults[block] || {}) };
  const classes = ["receipt-preview__block"];
  if (style.size !== base.size) classes.push(`receipt-preview__block--size-${style.size}`);
  if (align && style.align !== base.align) {
    classes.push(`receipt-preview__block--align-${style.align}`);
  }
  if (style.weight !== base.weight) {
    classes.push(`receipt-preview__block--weight-${style.weight === "bold" ? "bold" : "normal"}`);
  }
  return classes.join(" ");
}

function normalizePaperSize(value) {
  return String(value || "").includes("58") ? "58" : "80";
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

// Схематичный QR для превью: детерминированная матрица 10×10 из строки-ссылки.
// Это НЕ сканируемый код — реальный QR печатает термопринтер нативной командой
// ESC/POS (GS ( k) из той же ссылки. Превью лишь показывает, что блок QR включён.
function qrMatrix(text) {
  const size = 10;
  const cells = new Array(size * size).fill(false);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < cells.length; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    cells[i] = (h & 7) < 3;
  }
  // Угловые «глаза» QR — как в настоящем коде.
  const eye = (r0, c0) => {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        cells[(r0 + r) * size + (c0 + c)] = r === 0 || r === 2 || c === 0 || c === 2;
      }
    }
  };
  eye(0, 0);
  eye(0, size - 3);
  eye(size - 3, 0);
  return cells;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return toNumber(value)
    .toLocaleString("ru-RU", { maximumFractionDigits: 0 })
    .replace(/\s/g, " ");
}

function itemTotal(item) {
  return toNumber(item.total ?? item.amount ?? toNumber(item.price) * toNumber(item.quantity || 1));
}

function itemName(item) {
  return item.name || item.title || item.product_name || item.dish_name || "Позиция";
}

function itemQuantity(item) {
  return toNumber(item.quantity ?? item.qty ?? 1);
}

function itemPrice(item) {
  return toNumber(item.price ?? item.unit_price ?? item.amount);
}

function formatCustomerDate(value) {
  const date = new Date(value || Date.now());
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(",", "");
}

function formatKitchenDate(value) {
  const date = new Date(value || Date.now());
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getCustomerReceiptTotals(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const discount = toNumber(order.discount ?? order.discount_amount);
  const service = toNumber(order.service_fee ?? order.service_amount);
  const tax = toNumber(order.vat ?? order.tax ?? order.tax_amount);
  const total = hasValue(order.total_amount)
    ? toNumber(order.total_amount)
    : subtotal - discount + service + tax;
  return { subtotal, discount, service, tax, total };
}

function getPaymentRows(order = {}, total = 0) {
  const paymentRows = [];
  if (Array.isArray(order.payments)) {
    order.payments.forEach((payment) => {
      const amount = toNumber(payment.amount ?? payment.sum ?? payment.total);
      if (amount > 0) {
        paymentRows.push({
          label: payment.label || payment.name || payment.method || payment.payment_method || "Оплата",
          amount,
        });
      }
    });
  }

  [
    ["Наличные", order.cash_amount ?? order.cash],
    ["Карта", order.card_amount ?? order.card],
    ["Перечисление", order.transfer_amount ?? order.transfer],
  ].forEach(([label, value]) => {
    const amount = toNumber(value);
    if (amount > 0) paymentRows.push({ label, amount });
  });

  if (!paymentRows.length && hasValue(order.payment_method) && total > 0) {
    paymentRows.push({ label: order.payment_method, amount: total });
  }

  return paymentRows;
}

function getOrderNumber(order = {}) {
  return hasValue(order.order_number) ? String(order.order_number) : "-";
}

function ReceiptRule({ solid = false }) {
  return <div className={`receipt-preview__rule ${solid ? "is-solid" : ""}`} aria-hidden="true" />;
}

function InfoRows({ rows }) {
  const visibleRows = rows.filter((row) => hasValue(row.value));
  if (!visibleRows.length) return null;
  return (
    <div className="receipt-preview__info">
      {visibleRows.map((row) => (
        <div className={`receipt-preview__info-row ${row.className || ""}`.trim()} key={row.label}>
          <b>{row.label}</b>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function CustomerItems({ items = [], className = "" }) {
  return (
    <div className={`receipt-preview__items ${className}`.trim()} data-receipt-items>
      <div className="receipt-preview__items-head">
        <span>НАИМЕНОВАНИЕ</span>
        <span>КОЛ-ВО</span>
        <span>ЦЕНА</span>
        <span>ИТОГО</span>
      </div>
      {items.map((item, index) => (
        <div className="receipt-preview__item-row" key={item.id || `${itemName(item)}-${index}`}>
          <span className="receipt-preview__item-name">{itemName(item)}</span>
          <span>{money(itemQuantity(item))}</span>
          <span>{money(itemPrice(item))}</span>
          <span>{money(itemTotal(item))}</span>
        </div>
      ))}
    </div>
  );
}

// Итоговые строки печатаются без стилей блока — как в formatter._receipt_group("summary").
function SummaryRows({ rows }) {
  const visibleRows = rows.filter((row) => row.show && toNumber(row.value) > 0);
  if (!visibleRows.length) return null;
  return (
    <div className="receipt-preview__summary">
      {visibleRows.map((row) => (
        <div className="receipt-preview__summary-row" key={row.label}>
          <span>{row.label}</span>
          <b>{money(row.value)}</b>
        </div>
      ))}
    </div>
  );
}

function PaymentRows({ rows, className = "" }) {
  if (!rows.length) return null;
  return (
    <div className={`receipt-preview__payments ${className}`.trim()}>
      {rows.map((row) => (
        <div className="receipt-preview__payment-row" key={row.label}>
          <span>{row.label}:</span>
          <b>{money(row.amount)}</b>
        </div>
      ))}
    </div>
  );
}

// Выравнивание применяем только там, где принтер НЕ добивает строку до полной
// ширины (head/qr/foot): в табличных группах оно физически ничего не меняет.
function customerGroup(group, ctx) {
  const { template, org, order, totals, payments, on, cls, restaurantName } = ctx;
  switch (group) {
    case "head": {
      if (!on.logo && !on.restaurantName) return null;
      return (
        <header className="receipt-preview__brand-block">
          {on.logo ? (
            <img className="receipt-preview__logo" src={org?.logo || logo} alt={restaurantName} />
          ) : null}
          {on.restaurantName ? (
            <div className={`receipt-preview__brand ${cls("restaurantName")}`}>{restaurantName}</div>
          ) : null}
        </header>
      );
    }
    case "info": {
      const rows = [];
      if (on.orderNumber) {
        const infoClass = cls("orderNumber", { align: false });
        rows.push({ label: "Номер заказа:", value: getOrderNumber(order), className: infoClass });
        rows.push({ label: "Тип заказа:", value: order.order_type, className: infoClass });
      }
      if (on.table) {
        rows.push({ label: "Номер стола:", value: order.table_number, className: cls("table", { align: false }) });
      }
      if (on.waiter) {
        rows.push({ label: "Официант:", value: order.waiter, className: cls("waiter", { align: false }) });
      }
      if (on.dateTime) {
        rows.push({
          label: "Дата:",
          value: formatCustomerDate(order.created_at),
          className: cls("dateTime", { align: false }),
        });
      }
      return <InfoRows rows={rows} />;
    }
    case "items": {
      const items = Array.isArray(order.items) ? order.items : [];
      if (!on.items || !items.length) return null;
      return <CustomerItems items={items} className={cls("items", { align: false })} />;
    }

    case "summary":
      return (
        <SummaryRows
          rows={[
            { label: "Сумма товаров", value: totals.subtotal, show: true },
            { label: "Скидка", value: totals.discount, show: on.discount },
            { label: "Обслуживание", value: totals.service, show: on.serviceFee },
            { label: "Налог", value: totals.tax, show: on.vat },
          ]}
        />
      );
    case "total":
      if (!on.total) return null;
      return (
        <div className={`receipt-preview__total ${cls("total", { align: false })}`}>
          <span>ИТОГО:</span>
          <b>{money(totals.total)}</b>
        </div>
      );
    case "pay":
      if (!on.paymentMethod || !payments.length) return null;
      return <PaymentRows rows={payments} className={cls("paymentMethod", { align: false })} />;
    case "qr": {
      const fiscalCode = order.fiscal_code || order.fiscalCode;
      const qrUrl = template.qrUrl;
      if (!on.qr || (!hasValue(qrUrl) && !hasValue(fiscalCode))) return null;
      return (
        <div className="receipt-preview__block receipt-preview__block--align-center">
          {hasValue(qrUrl) ? (
            <>
              <div className="receipt-preview__qr" aria-hidden="true">
                {qrMatrix(String(qrUrl)).map((dark, i) => (
                  <i key={i} className={dark ? "is-dark" : undefined} />
                ))}
              </div>
              <div className="receipt-preview__qr-url">{qrUrl}</div>
            </>
          ) : null}
          {hasValue(fiscalCode) ? (
            <div className="receipt-preview__line">ФН: {fiscalCode}</div>
          ) : null}
        </div>
      );
    }
    case "foot": {
      const thanks = on.thankYouText ? template.thankYouText || "XARIDINGIZ UCHUN RAXMAT!" : "";
      const contacts = [];
      if (on.footerText && hasValue(template.footerText)) contacts.push(template.footerText);
      if (on.phone && hasValue(template.phone)) contacts.push(template.phone);
      if (on.address && hasValue(template.address)) contacts.push(template.address);
      if (!hasValue(thanks) && !contacts.length) return null;
      return (
        <footer className="receipt-preview__customer-footer">
          {hasValue(thanks) ? <strong className={cls("thankYouText")}>{thanks}</strong> : null}
          {contacts.map((contact) => (
            <b className={cls("footerText")} key={contact}>{contact}</b>
          ))}
        </footer>
      );
    }
    default:
      return null;
  }
}

function CustomerReceipt({ template = {}, org, order }) {
  const restaurantName = template.restaurantName || org?.name || "MARJON";
  const totals = getCustomerReceiptTotals(order);
  const payments = getPaymentRows(order, totals.total);
  const blocks = templateBlocks(template, CUSTOMER_BLOCKS);
  const on = {};
  blocks.forEach((block) => {
    on[block] = blockEnabled(template, block);
  });
  const cls = (block, options) =>
    blockClass(blockStyle(template, block, CUSTOMER_STYLES), block, CUSTOMER_STYLES, options);

  const sections = [];
  groupOrder(blocks, CUSTOMER_GROUPS).forEach((group) => {
    const node = customerGroup(group, { template, org, order, totals, payments, on, cls, restaurantName });
    if (node) sections.push({ group, node });
  });

  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.group}>
          {index ? <ReceiptRule solid /> : null}
          {section.node}
        </Fragment>
      ))}
      <ReceiptRule />
      <div className="receipt-preview__bottom-order">
        <span>НОМЕР ЗАКАЗА</span>
        <b>{getOrderNumber(order)}</b>
      </div>
    </>
  );
}

function getModifierText(modifier) {
  if (typeof modifier === "string") return modifier;
  return modifier?.name || modifier?.title || modifier?.label || "";
}

function itemNotes(item, showModifiers = true, showComments = true) {
  const notes = [];
  if (showModifiers && Array.isArray(item.modifiers)) {
    const modifierText = item.modifiers.map(getModifierText).filter(hasValue).join(", ");
    if (modifierText) notes.push(modifierText);
  }
  if (showComments && (hasValue(item.note) || hasValue(item.comment))) {
    notes.push(item.note || item.comment);
  }
  return notes;
}

function isUrgent(order = {}) {
  const value = String(order.priority || order.urgency || "").toLowerCase();
  return Boolean(order.is_urgent || order.urgent || value.includes("сроч") || value.includes("urgent"));
}

function KitchenItems({ items = [], showModifiers = true, showComments = true, itemClass = "", noteClass = "" }) {
  return (
    <div className="receipt-preview__kitchen-items">
      {items.map((item, index) => {
        const notes = itemNotes(item, showModifiers, showComments);
        return (
          <div className="receipt-preview__kitchen-item" key={item.id || `${itemName(item)}-${index}`}>
            <strong className={itemClass}>{money(itemQuantity(item))} x {itemName(item)}</strong>
            {notes.map((note) => (
              <span className={noteClass} key={note}>- {note}</span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function kitchenGroup(group, ctx) {
  const { order, on, cls } = ctx;
  switch (group) {
    case "head": {
      const rows = [];
      if (on.table) {
        rows.push({ label: "Стол:", value: order.table_number, className: cls("table", { align: false }) });
      }
      if (on.waiter) {
        rows.push({ label: "Официант:", value: order.waiter, className: cls("waiter", { align: false }) });
      }
      if (on.createdAt) {
        rows.push({
          label: "Время:",
          value: formatKitchenDate(order.created_at),
          className: cls("createdAt", { align: false }),
        });
      }
      const visibleRows = rows.filter((row) => hasValue(row.value));
      if (!on.orderNumber && !visibleRows.length) return null;
      return (
        <>
          {on.orderNumber ? (
            <h3 className={`receipt-preview__kitchen-number ${cls("orderNumber")}`}>#{getOrderNumber(order)}</h3>
          ) : null}
          <InfoRows rows={visibleRows} />
        </>
      );
    }

    case "items": {
      const items = Array.isArray(order.items) ? order.items : [];
      if (!on.items || !items.length) return null;
      return (
        <KitchenItems
          items={items}
          showModifiers={on.modifiers}
          showComments={on.itemComments}
          itemClass={cls("items", { align: false })}
          noteClass={cls("modifiers", { align: false })}
        />
      );
    }
    case "note":
      if (!on.orderNote || !hasValue(order.note)) return null;
      return (
        <div className={`receipt-preview__kitchen-comment ${cls("orderNote", { align: false })}`}>
          <b>Комментарий:</b>
          <span>- {order.note}</span>
        </div>
      );
    case "urgent":
      if (!on.priority || !isUrgent(order)) return null;
      return <div className={`receipt-preview__kitchen-urgent ${cls("priority")}`}>! СРОЧНО !</div>;
    default:
      return null;
  }
}

function KitchenReceipt({ template = {}, order }) {
  const blocks = templateBlocks(template, KITCHEN_BLOCKS);
  const on = {};
  blocks.forEach((block) => {
    on[block] = blockEnabled(template, block);
  });
  const cls = (block, options) =>
    blockClass(blockStyle(template, block, KITCHEN_STYLES), block, KITCHEN_STYLES, options);

  const sections = [];
  groupOrder(blocks, KITCHEN_GROUPS).forEach((group) => {
    const node = kitchenGroup(group, { order, on, cls });
    if (node) sections.push({ group, node });
  });

  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.group}>
          {index ? <ReceiptRule /> : null}
          {section.node}
        </Fragment>
      ))}
    </>
  );
}

export default function ReceiptPreview({ type = "customer", template = {}, org, order }) {
  const paperSize = normalizePaperSize(template.paperSize);
  const sample = order || (type === "kitchen" ? kitchenSampleOrder : customerSampleOrder);

  return (
    <div className="receipt-preview-shell" data-receipt-preview-shell>
      <div className="receipt-preview-shell__label">{paperSize} mm preview</div>
      <div
        className={`receipt-preview receipt-preview--${type} receipt-preview--${paperSize}mm`}
        data-paper-size={paperSize}
        data-receipt-type={type}
        data-receipt-component="shared"
        data-receipt-print-root
      >
        {type === "kitchen"
          ? <KitchenReceipt template={template} order={sample} />
          : <CustomerReceipt template={template} org={org} order={sample} />}
      </div>
    </div>
  );
}
