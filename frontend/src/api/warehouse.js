import { api } from "./client";

const READ_PATHS = Object.freeze({
  incoming: "/warehouse/purchases",
  transfer: "/warehouse/transfers",
});

export const warehouseService = Object.freeze({
  list(section) {
    const path = READ_PATHS[section];
    if (!path) throw new TypeError(`Unsupported warehouse read section: ${section}`);
    return api.get(path);
  },
});

export { READ_PATHS };
