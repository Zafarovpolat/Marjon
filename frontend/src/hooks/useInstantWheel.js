import { useLayoutEffect } from "react";

// Эксперимент «точное колесо»: ?wheel=instant в адресе страницы.
//
// По умолчанию колесо отдаётся браузеру, и Chrome проигрывает каждый щелчок
// как анимацию ~100 мс с затуханием. На коротком списке (19 строк = диапазон
// 577 px ≈ 6 щелчков) последний щелчок упирается в конец и анимация
// обрывается на середине — визуально это читается как «в конце прокрутка
// замедляется». С флагом колесо двигает контейнер ровно на свою дельту без
// анимации: все щелчки одинаковые, обрывать нечего.
//
// Флаг, а не замена поведения: плавность против точности — вкусовой выбор
// владельца, поэтому он сравнивает на своих данных, а не верит на слово.
export function isInstantWheelRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("wheel") === "instant";
}

export default function useInstantWheel(targetRef, enabled) {
  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return undefined;

    const onWheel = (event) => {
      // Ctrl+колесо — масштаб страницы, Shift+колесо и deltaX — горизонталь:
      // всё это остаётся нативным, перехватываем только вертикаль.
      if (event.ctrlKey || event.shiftKey || event.deltaX) return;
      const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (!step) return;
      const before = target.scrollTop;
      const max = target.scrollHeight - target.clientHeight;
      const next = Math.max(0, Math.min(max, before + step));
      // На границе списка событие не гасим: пусть браузер сам решает, что
      // дальше (сейчас страница не скроллится, так что это no-op).
      if (next === before) return;
      event.preventDefault();
      target.scrollTop = next;
    };

    target.addEventListener("wheel", onWheel, { passive: false });
    return () => target.removeEventListener("wheel", onWheel);
  }, [targetRef, enabled]);
}
