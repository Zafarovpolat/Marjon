import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./ru.json";
import uz from "./uz.json";
import en from "./en.json";

const savedLang = localStorage.getItem("marjon_lang") || "ru";

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

// <html lang> должен совпадать с выбранным языком: от него зависят переносы,
// озвучка скринридером и подсветка орфографии в полях ввода.
if (typeof document !== "undefined") {
  document.documentElement.lang = savedLang;
}

export default i18n;
