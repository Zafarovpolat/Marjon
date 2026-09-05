import { useEffect, useMemo, useState } from "react";
import ReceiptPreview from "../../components/receipt/ReceiptPreview";
import ReceiptSectionEditor from "../../components/receipt/ReceiptSectionEditor";
import { useOrg } from "../../context/OrgContext";
import {
  CUSTOMER_BLOCK_LABELS,
  CUSTOMER_STYLE_BLOCKS,
  buildCustomerTemplate,
  getCustomerTemplate,
  saveCustomerTemplate,
  testPrintReceipt,
} from "../../api/receipt";
import { isAbortError } from "../../hooks/useAsyncSafety";
import { moveBlock } from "./receiptBlockOrder";

export default function ReceiptSettingsPage() {
  const { org } = useOrg();
  const defaults = useMemo(() => buildCustomerTemplate(org), [org]);
  const [template, setTemplate] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    getCustomerTemplate(org, { signal: controller.signal })
      .then(({ template: loaded }) => {
        if (!active) return;
        setTemplate({
          ...defaults,
          ...loaded,
          enabled: { ...defaults.enabled, ...loaded.enabled },
          blockStyles: { ...defaults.blockStyles, ...loaded.blockStyles },
          positions: { ...defaults.positions, ...loaded.positions },
        });
        setMessage("");
      })
      .catch((requestError) => {
        if (active && !isAbortError(requestError)) setError("Не удалось загрузить серверный шаблон чека. Показан локальный черновик по умолчанию.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; controller.abort(); };
  }, [defaults, org]);

  function patchTemplate(patch) {
    setTemplate((current) => ({ ...current, ...patch }));
  }

  function toggleBlock(block) {
    setTemplate((current) => ({
      ...current,
      enabled: { ...current.enabled, [block]: !current.enabled?.[block] },
    }));
  }

  function move(block, direction) {
    setTemplate((current) => ({ ...current, blocks: moveBlock(current.blocks, block, direction) }));
  }

  function changeBlockStyle(block, patch) {
    setTemplate((current) => ({
      ...current,
      blockStyles: {
        ...(current.blockStyles || {}),
        [block]: {
          ...(current.blockStyles?.[block] || {}),
          ...patch,
        },
      },
    }));
  }

  function handleReset() {
    setTemplate(JSON.parse(JSON.stringify(defaults)));
    setError("");
    setMessage("Шаблон сброшен к стандартному виду. Нажмите «Сохранить», чтобы применить.");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveCustomerTemplate(template);
      setMessage("Шаблон чека сохранён на сервере.");
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить шаблон чека на сервере. Изменения остались только в текущем черновике.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    setPrinting(true);
    setError("");
    setMessage("");
    const result = await testPrintReceipt(template);
    setPrinting(false);
    if (result.ok) {
      setMessage("Тестовая печать отправлена.");
    } else {
      setError(result.detail);
    }
  }

  return (
    <section className="receipt-page">
      <div className="receipt-page__actions">
        <button type="button" className="receipt-page__btn" onClick={handleReset} disabled={saving || printing}>
          Сбросить
        </button>
        <button type="button" className="receipt-page__btn" onClick={handleTestPrint} disabled={saving || printing}>
          {printing ? "Печать..." : "Тест печати"}
        </button>
        <button
          type="button"
          className="receipt-page__btn receipt-page__btn--primary"
          onClick={handleSave}
          disabled={loading || saving || printing}
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {message ? <div className="message message-success">{message}</div> : null}
      {error ? <div className="message message-error">{error}</div> : null}

      <div className="receipt-layout">
        <div className="receipt-settings card card-pad">
          <div className="receipt-panel-title">
            <h3>Параметры</h3>
            {loading ? <span>Загрузка...</span> : null}
          </div>

          <div className="receipt-control-grid">
            <label className="receipt-field">
              <span>Размер бумаги</span>
              <select value={template.paperSize} onChange={(event) => patchTemplate({ paperSize: event.target.value })}>
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </label>
            <label className="receipt-field">
              <span>Название</span>
              <input value={template.restaurantName || ""} onChange={(event) => patchTemplate({ restaurantName: event.target.value })} />
            </label>
            <label className="receipt-field">
              <span>Адрес</span>
              <input value={template.address || ""} onChange={(event) => patchTemplate({ address: event.target.value })} />
            </label>
            <label className="receipt-field">
              <span>Телефон</span>
              <input value={template.phone || ""} onChange={(event) => patchTemplate({ phone: event.target.value })} />
            </label>
          </div>

          <label className="receipt-field">
            <span>Текст благодарности</span>
            <input value={template.thankYouText || ""} onChange={(event) => patchTemplate({ thankYouText: event.target.value })} />
          </label>
          <label className="receipt-field">
            <span>Нижний текст</span>
            <textarea rows="3" value={template.footerText || ""} onChange={(event) => patchTemplate({ footerText: event.target.value })} />
          </label>
          <label className="receipt-field">
            <span>Ссылка QR</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={template.qrUrl || ""}
              onChange={(event) => patchTemplate({ qrUrl: event.target.value })}
            />
            <small>Печатается как QR-код на чеке. Включите блок «QR» ниже.</small>
          </label>

          <div className="receipt-panel-title">
            <h3>Блоки чека</h3>
            <span>Порядок и видимость</span>
          </div>
          <ReceiptSectionEditor
            blocks={template.blocks}
            enabled={template.enabled}
            labels={CUSTOMER_BLOCK_LABELS}
            blockStyles={template.blockStyles}
            styleBlocks={CUSTOMER_STYLE_BLOCKS}
            onToggle={toggleBlock}
            onMove={move}
            onStyleChange={changeBlockStyle}
          />
        </div>

        <aside className="receipt-preview-sticky">
          <ReceiptPreview type="customer" template={template} org={org} onTemplateChange={patchTemplate} />
        </aside>
      </div>
    </section>
  );
}
