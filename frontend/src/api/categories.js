import { api } from "./client";
import { normalizeApiError } from "./errors";

function isNormalizedApiError(error) {
  return Boolean(
    error
    && typeof error === "object"
    && typeof error.kind === "string"
    && Object.prototype.hasOwnProperty.call(error, "status")
    && Object.prototype.hasOwnProperty.call(error, "isNetworkError")
    && Object.prototype.hasOwnProperty.call(error, "isTimeout")
    && Object.prototype.hasOwnProperty.call(error, "isAborted"),
  );
}

export async function getCategories() {
  try {
    return await api.get("/inventory/categories");
  } catch (error) {
    if (isNormalizedApiError(error)) throw error;
    throw normalizeApiError(error);
  }
}
