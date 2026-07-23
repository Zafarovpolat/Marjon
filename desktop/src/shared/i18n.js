// Простая локализация RU/UZ. Смена языка применяется перезагрузкой окна (см. настройки).
const DICT = {
  ru: {
    enter: 'Войти', support: 'Служба поддержки', change_org: 'Сменить организацию',
    choose_employee: 'Выберите сотрудника', enter_pin: 'Введите PIN', check: 'Проверка...',
    settings: 'Настройки', switch_mode: 'Сменить режим', logout: 'Выйти',
    all: 'Все', locations: 'Локации', overview: 'Обзор',
    stoplist: 'Стоп-лист', finance: 'Финансы', reports: 'Отчёты', history: 'История', queue: 'Очередь',
    mode_cashier: 'Касса', mode_kitchen: 'Кухня', mode_waiter: 'Официант', mode_manager: 'Менеджер',
    dine_in: 'В зале', takeaway: 'С собой', delivery: 'Доставка',
    pay: 'Оплата', add: 'Добавить', save: 'Сохранить', back: 'Назад', cancel: 'Отмена',
    new_order: 'Новый заказ', order_ready: 'Заказ готов, отдать', to_kitchen: 'Отправить на кухню',
    free: 'Свободен', busy: 'Занят', ready: 'Готов', tables: 'Столы',
    branch: 'Филиал', staff: 'Сотрудник', loading: 'Загрузка...', no_orders: 'Нет активных заказов',
    search_dish: 'Поиск блюда…', order: 'Заказ', total: 'Итого', comment: 'Комментарий',
    qty: 'Количество', price_per: 'Цена за порцию, сум',
  },
  uz: {
    enter: 'Kirish', support: 'Qo‘llab-quvvatlash', change_org: 'Tashkilotni almashtirish',
    choose_employee: 'Xodimni tanlang', enter_pin: 'PIN kiriting', check: 'Tekshirilmoqda...',
    settings: 'Sozlamalar', switch_mode: 'Rejimni almashtirish', logout: 'Chiqish',
    all: 'Hammasi', locations: 'Joylar', overview: 'Umumiy',
    stoplist: 'Stop-ro‘yxat', finance: 'Moliya', reports: 'Hisobotlar', history: 'Tarix', queue: 'Navbat',
    mode_cashier: 'Kassa', mode_kitchen: 'Oshxona', mode_waiter: 'Ofitsiant', mode_manager: 'Menejer',
    dine_in: 'Zalda', takeaway: 'O‘zi bilan', delivery: 'Yetkazish',
    pay: 'To‘lov', add: 'Qo‘shish', save: 'Saqlash', back: 'Orqaga', cancel: 'Bekor',
    new_order: 'Yangi buyurtma', order_ready: 'Buyurtma tayyor', to_kitchen: 'Oshxonaga yuborish',
    free: 'Bo‘sh', busy: 'Band', ready: 'Tayyor', tables: 'Stollar',
    branch: 'Filial', staff: 'Xodim', loading: 'Yuklanmoqda...', no_orders: 'Faol buyurtmalar yo‘q',
    search_dish: 'Taom qidirish…', order: 'Buyurtma', total: 'Jami', comment: 'Izoh',
    qty: 'Miqdor', price_per: 'Porsiya narxi, so‘m',
  },
}

export function lang() {
  return localStorage.getItem('marjon_lang') === 'uz' ? 'uz' : 'ru'
}
export function t(key) {
  const l = lang()
  return (DICT[l] && DICT[l][key]) || DICT.ru[key] || key
}
