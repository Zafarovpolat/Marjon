const SENSITIVE_NAMES = new Set([
  "pin",
  "pin_code",
  "pincode",
  "passcode",
  "password",
  "current_password",
  "new_password",
  "old_password",
  "confirm_password",
  "password_confirmation",
  "credential",
  "credentials",
  "secret",
  "client_secret",
  "access_token",
  "refresh_token",
  "authorization",
  "proxy_authorization",
  "api_key",
  "otp",
  "one_time_password",
]);
const SENSITIVE_LABEL = "(?:pin(?:[_-]?code)?|pincode|passcode|password|(?:current|new|old|confirm)[_-]?password|password[_-]?confirmation|credential(?:s)?|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|otp|one[_-]?time[_-]?password)";
const BEARER_VALUE = /\bBearer\s+[^\s,;]+/gi;
const NAMED_SECRET_VALUE = new RegExp(`\\b(${SENSITIVE_LABEL})\\b\\s*[:=]\\s*([^\\s,;]+)`, "gi");
const TECHNICAL_ERROR_CODE = /^[A-Z][A-Z0-9_.-]{0,127}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSensitiveName(value) {
  return String(value || "")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[^a-z\d]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeControlKey(value) {
  return String(value || "").replace(/[^a-z\d]+/gi, "").toLowerCase();
}

function validationLocations(value) {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key]) => ["loc", "path", "field"].includes(normalizeControlKey(key)))
    .map(([, location]) => location);
}

function validationLocationParts(value) {
  return validationLocations(value).flatMap((location) => (
    Array.isArray(location) ? location.flat(Infinity) : [location]
  ));
}

function isSensitiveKey(value) {
  const normalized = normalizeSensitiveName(value);
  if (!normalized) return false;
  return [...SENSITIVE_NAMES].some((name) => (
    normalized === name
    || normalized.startsWith(`${name}_`)
    || normalized.endsWith(`_${name}`)
    || normalized.includes(`_${name}_`)
  ));
}

function sanitizeText(value) {
  return String(value)
    .replace(BEARER_VALUE, "Bearer [REDACTED]")
    .replace(NAMED_SECRET_VALUE, "$1=[REDACTED]");
}

function sanitizeErrorCode(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const code = value.trim();
  const sanitized = sanitizeText(code);
  if (sanitized !== code) return sanitized;
  return TECHNICAL_ERROR_CODE.test(code) ? code : null;
}

function sanitizeDetails(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetails(item, seen));
  }

  const hasSensitiveLocation = validationLocationParts(value).some((part) => isSensitiveKey(part));
  return Object.entries(value).reduce((output, [key, item]) => {
    const isValidationInput = normalizeControlKey(key) === "input";
    if (!isSensitiveKey(key) && !(hasSensitiveLocation && isValidationInput)) {
      output[key] = sanitizeDetails(item, seen);
    }
    return output;
  }, {});
}

function firstMessage(data) {
  const candidates = [data?.detail, data?.message, data?.error, data?.error?.message];
  const message = candidates.find((value) => typeof value === "string" && value.trim());
  return message ? sanitizeText(message.trim()) : "";
}

function validationItems(data) {
  if (Array.isArray(data?.detail)) return data.detail;
  if (Array.isArray(data?.errors)) return data.errors;
  return [];
}

function normalizeFieldPath(location) {
  const parts = Array.isArray(location) ? location : [location];
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "body")
    .map(String)
    .join(".");
}

function normalizeFieldErrors(data) {
  const fieldErrors = {};

  validationItems(data).forEach((item) => {
    if (!isRecord(item)) return;
    const locations = validationLocations(item);
    const field = normalizeFieldPath(locations[0]);
    if (validationLocationParts(item).some((part) => isSensitiveKey(part))) return;
    const message = typeof item.msg === "string" ? item.msg : item.message;
    if (field && typeof message === "string" && message.trim()) {
      fieldErrors[field] = sanitizeText(message.trim());
    }
  });

  if (isRecord(data?.errors)) {
    Object.entries(data.errors).forEach(([field, value]) => {
      if (isSensitiveKey(field)) return;
      const message = Array.isArray(value) ? value.find((item) => typeof item === "string") : value;
      if (typeof message === "string" && message.trim()) {
        fieldErrors[field] = sanitizeText(message.trim());
      }
    });
  }

  return fieldErrors;
}

function errorKind(status, { isTimeout, isNetworkError, isAborted }) {
  if (isAborted) return "aborted";
  if (isTimeout) return "timeout";
  if (isNetworkError) return "network";
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "server";
  if (status) return "http";
  return "unknown";
}

function fallbackMessage(kind, status) {
  if (kind === "network") return "Network request failed.";
  if (kind === "timeout") return "Request timed out.";
  if (kind === "aborted") return "Request was aborted.";
  if (status) return `API request failed with status ${status}.`;
  return "Unexpected API error.";
}

function detailsFromData(data) {
  if (Array.isArray(data?.detail) || isRecord(data?.detail)) return data.detail;
  if (data?.errors !== undefined) return data.errors;
  if (isRecord(data?.error)) return data.error;
  return null;
}

export function normalizeApiError(error) {
  const statusValue = Number(error?.response?.status ?? error?.status);
  const status = Number.isInteger(statusValue) && statusValue > 0 ? statusValue : null;
  const data = error?.response?.data ?? error?.data;
  const rawCode = typeof data?.code === "string"
    ? data.code
    : typeof data?.error_code === "string"
      ? data.error_code
      : typeof error?.code === "string"
        ? error.code
        : null;
  const code = sanitizeErrorCode(rawCode);
  const isAborted = Boolean(
    error?.isAborted
    || error?.__CANCEL__ === true
    || error?.name === "AbortError"
    || error?.name === "CanceledError"
    || rawCode === "ABORTED"
    || rawCode === "ERR_CANCELED",
  );
  const isTimeout = Boolean(
    error?.isTimeout
    || rawCode === "TIMEOUT"
    || rawCode === "ECONNABORTED"
    || rawCode === "ETIMEDOUT"
    || /timeout/i.test(String(error?.message || "")),
  );
  const isNetworkError = Boolean(
    !status
    && !isTimeout
    && !isAborted
    && (error?.isNetworkError || rawCode === "NETWORK_ERROR" || rawCode === "ERR_NETWORK" || error?.request),
  );
  const kind = errorKind(status, { isTimeout, isNetworkError, isAborted });
  const backendMessage = firstMessage(data);

  return {
    kind,
    status,
    code,
    message: backendMessage || fallbackMessage(kind, status),
    details: sanitizeDetails(detailsFromData(data)),
    fieldErrors: normalizeFieldErrors(data),
    isNetworkError,
    isTimeout,
    isAborted,
    isUnauthorized: status === 401,
    isForbidden: status === 403,
    isNotFound: status === 404,
    isConflict: status === 409,
    isValidationError: status === 422,
    isRateLimited: status === 429,
    isServerError: Boolean(status && status >= 500 && status <= 599),
  };
}
