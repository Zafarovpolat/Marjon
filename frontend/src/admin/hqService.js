import { adminApi } from "./api";

const SECTION_PATHS = Object.freeze({
  products: "/products",
  categories: "/categories",
  orders: "/orders",
  units: "/units",
  departments: "/departments",
  sources: "/sources",
  storeVersions: "/store-versions",
  imageBackgrounds: "/image-backgrounds",
  languages: "/languages",
});

function sectionPath(sectionKey) {
  const path = SECTION_PATHS[sectionKey];
  if (!path) throw new TypeError(`Unsupported HQ service section: ${sectionKey}`);
  return path;
}

export const hqService = {
  listSection(sectionKey, params = { size: 100 }, config = {}) {
    return adminApi.get(sectionPath(sectionKey), { params, ...config });
  },
  listProducts(params = { size: 100 }, config = {}) {
    return adminApi.get("/products", { params, ...config });
  },
  listCategories(params = { size: 100 }) {
    return adminApi.get("/categories", { params });
  },
  listUnits(params = { size: 100 }) {
    return adminApi.get("/units", { params });
  },
  listSources(params = { size: 100 }) {
    return adminApi.get("/sources", { params });
  },
  listOrders(params = { size: 100 }) {
    return adminApi.get("/orders", { params });
  },
  listCountries(params = { size: 100 }) {
    return adminApi.get("/countries", { params });
  },
  listRegions(params = { size: 100 }) {
    return adminApi.get("/regions", { params });
  },
  listDistricts(params = { size: 100 }) {
    return adminApi.get("/districts", { params });
  },
  listImageBackgrounds(params = { size: 100 }) {
    return adminApi.get("/image-backgrounds", { params });
  },
};
