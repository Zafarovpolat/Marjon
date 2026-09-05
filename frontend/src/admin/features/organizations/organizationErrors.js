const MAX_PUBLIC_ERROR_LENGTH = 240;

function boundedMessage(value) {
  if (typeof value !== "string") return "";
  const message = value.trim();
  return message && message.length <= MAX_PUBLIC_ERROR_LENGTH ? message : "";
}

function detailMessage(detail) {
  const direct = boundedMessage(detail);
  if (direct) return direct;
  if (!Array.isArray(detail)) return "";

  const messages = detail
    .map((item) => boundedMessage(item?.msg))
    .filter(Boolean);
  return boundedMessage([...new Set(messages)].join("; "));
}

export function organizationErrorMessage(error, fallback) {
  if (error?.name === "ApiContractError" || String(error?.code || "").startsWith("INVALID_")) {
    return fallback;
  }
  return detailMessage(error?.detail) || boundedMessage(error?.message) || fallback;
}
