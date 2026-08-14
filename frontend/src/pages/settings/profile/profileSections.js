// Конфигурация раздела «Настройки» профиля компании: данные без логики.
// Список навигационных секций и пустая форма вынесены как чистые константы,
// значения перенесены байт-в-байт из SettingsProfilePage.

export const profileSections = [
  { key: "basic", label: "Основные данные", icon: "bi-file-earmark-text" },
  { key: "main", label: "Основные настройки", icon: "bi-sliders" },
  { key: "receipt", label: "Настройки для чека", icon: "bi-receipt" },
  { key: "cashier", label: "Настройки кассира", icon: "bi-person" },
  { key: "online", label: "Настройки для онлайн меню", icon: "bi-list" },
  { key: "other", label: "Другие настройки", icon: "bi-three-dots" },
  { key: "discounts", label: "Скидки", icon: "bi-percent" },
  { key: "profile", label: "Настройка профиля", icon: "bi-person-gear" },
  { key: "constructor", label: "Чек конструктор", icon: "bi-ticket-perforated" },
  { key: "import", label: "Импорт", icon: "bi-box-arrow-in-down" },
  { key: "telegram", label: "Telegram бот настройки", icon: "bi-chat-left" },
  { key: "legacy", label: "Старая версия", icon: "bi-arrow-counterclockwise" },
];

export const emptyForm = {
  name: "",
  phone: "",
  address: "",
  inn: "",
  currency: "UZS",
  companyLogo: "",
  profileLogo: "",
};
