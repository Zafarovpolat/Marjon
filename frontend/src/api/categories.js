import { catalogService } from "./catalog";
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

export async function getCategories(config) {
  try {
    return await catalogService.listCategories(config);
  } catch (error) {
    if (isNormalizedApiError(error)) throw error;
    throw normalizeApiError(error);
  }
}
