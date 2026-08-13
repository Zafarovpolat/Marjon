const RATE_URLS = Object.freeze({
  USD: "https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/",
  RUB: "https://cbu.uz/ru/arkhiv-kursov-valyut/json/RUB/",
  KZT: "https://cbu.uz/ru/arkhiv-kursov-valyut/json/KZT/",
  KGS: "https://cbu.uz/ru/arkhiv-kursov-valyut/json/KGS/",
});

export const exchangeRatesService = Object.freeze({
  async get(currency, { signal } = {}) {
    const url = RATE_URLS[currency];
    if (!url) throw new TypeError(`Unsupported exchange-rate currency: ${currency}`);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Exchange-rate request failed: ${response.status}`);
    return response.json();
  },
});

export { RATE_URLS };
