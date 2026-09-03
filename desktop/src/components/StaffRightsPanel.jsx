import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { auth } from '../shared/api'
import { t } from '../shared/i18n'
import { toast } from './Toast'

// Права, которые кассир-менеджер вправе переключать сотрудникам.
// can_manage_staff / can_manage_warehouse СЮДА НЕ входят — их выдаёт только
// владелец в веб-админке (анти-эскалация: «менеджер» не плодит «менеджеров»).
const EDITABLE_PERMS = [
  'can_change_order_type', 'can_view_finance', 'can_approve_attendance',
  'can_view_closed_orders', 'can_view_stop_list', 'can_edit_stop_list',
  'can_close_bill', 'can_takeaway_at_table', 'can_delete_dishes',
  'can_manage_orders', 'can_cash_ops',
]

const asItems = (raw) => (Array.isArray(raw) ? raw : raw?.items || [])
// Владельца/админа права не трогаем — их карточка вне зоны кассира-менеджера.
const isAdminRow = (u) => (u.role_slugs || [u.role_slug]).some((s) => s === 'owner' || s === 'admin')

/**
 * StaffRightsPanel — редактор прав кассиров из режима разработчика.
 * Встраивается в рабочее пространство DeveloperPanel (без своей модалки).
 * Тумблеры can_* для выбранного сотрудника; сохраняем слиянием поверх
 * существующих permissions, чтобы не затирать неотредактированные ключи.
 */
export default function StaffRightsPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)  // null | user-объект
  const [perms, setPerms] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    auth.users()
      .then((d) => setUsers(asItems(d).filter((u) => !isAdminRow(u))))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  function startEdit(u) {
    const src = (u.permissions && typeof u.permissions === 'object') ? u.permissions : {}
    setPerms(Object.fromEntries(EDITABLE_PERMS.map((k) => [k, src[k] === true])))
    setSelected(u)
  }

  async function save() {
    // Слияние поверх исходных прав: не затираем ключи вне EDITABLE_PERMS
    // (в т.ч. административные — их кассир-менеджер и не видит).
    const base = (selected.permissions && typeof selected.permissions === 'object') ? selected.permissions : {}
    const payload = { permissions: { ...base, ...perms } }
    setSaving(true)
    try {
      await auth.updateUser(selected.id, payload)
      toast(t('saved'), 'ok')
      setSelected(null)
      load()
    } catch (e) {
      toast(e?.response?.data?.detail || t('save_failed'), 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="dev-screen">
      <div className="dev-screen__head">
        {selected && (
          <button className="icon-btn" onClick={() => setSelected(null)}><ArrowLeft size={22} /></button>
        )}
        <h3><ShieldCheck size={20} /> {selected ? (selected.name || t('staff')) : t('dev_rights')}</h3>
      </div>

      {selected ? (
        <section className="settings-section">
          {EDITABLE_PERMS.map((k) => (
            <div className="settings-row" key={k}>
              <label>{t('perm_' + k)}</label>
              <button type="button" className={`toggle ${perms[k] ? 'toggle--on' : ''}`}
                onClick={() => setPerms((p) => ({ ...p, [k]: !p[k] }))}>
                <span className="toggle__dot" />
              </button>
            </div>
          ))}
          <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn--primary settings-save" onClick={save} disabled={saving}>
              {saving ? t('loading') : t('save')}
            </button>
          </div>
        </section>
      ) : loading ? (
        <div className="kitchen-empty"><div className="spinner" /><p>{t('loading')}</p></div>
      ) : (
        <>
          <p className="settings-hint">{t('rights_select')}</p>
          <section className="settings-section">
            {users.length === 0 && <p className="settings-hint">{t('emp_empty')}</p>}
            {users.map((u) => (
              <div className="settings-row" key={u.id}>
                <span>
                  {u.name || '—'}
                  {' · '}<span style={{ color: 'var(--color-text-muted)' }}>{t.role(u.role_slug)}</span>
                </span>
                <button className="btn btn--sm" onClick={() => startEdit(u)}>{t('edit')}</button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
