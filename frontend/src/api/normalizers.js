export class ApiContractError extends Error {
  constructor(message, { code, field } = {}) {
    super(message);
    this.name = "ApiContractError";
    this.code = code || "INVALID_API_RESPONSE";
    this.field = field || null;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, contractName) {
  if (!isRecord(value)) {
    throw new ApiContractError(`Invalid ${contractName} response.`, {
      code: `INVALID_${contractName.toUpperCase()}_RESPONSE`,
    });
  }
  return value;
}

function requireNonEmptyString(value, field, contractName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiContractError(`Invalid ${contractName} response: ${field} is required.`, {
      code: `INVALID_${contractName.toUpperCase()}_RESPONSE`,
      field,
    });
  }
  return value;
}

export function normalizeTokenResponse(response, { requireRefreshToken = false } = {}) {
  const data = requireRecord(response, "token");
  const accessToken = requireNonEmptyString(data.access_token, "access_token", "token");
  let refreshToken = "";

  if (data.refresh_token !== undefined && data.refresh_token !== null && data.refresh_token !== "") {
    refreshToken = requireNonEmptyString(data.refresh_token, "refresh_token", "token");
  } else if (requireRefreshToken) {
    requireNonEmptyString(data.refresh_token, "refresh_token", "token");
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: typeof data.token_type === "string" && data.token_type.trim() ? data.token_type : "bearer",
  };
}

function normalizeRoleSlugs(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(values.filter((role) => typeof role === "string" && role.trim()).map((role) => role.trim()))];
}

export function normalizeProfileResponse(response) {
  const data = requireRecord(response, "profile");
  return {
    id: data.id ?? null,
    email: data.email ?? null,
    name: data.name ?? null,
    phone: data.phone ?? null,
    is_active: data.is_active === true,
    is_superadmin: data.is_superadmin === true,
    company_id: data.company_id ?? null,
    role_slugs: normalizeRoleSlugs(data.role_slugs),
  };
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function requireInteger(value, { field, minimum }) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || !Number.isInteger(value)
    || value < minimum
  ) {
    throw new ApiContractError(`Invalid paginated list response: ${field} must be an integer.`, {
      code: "INVALID_PAGINATED_LIST_RESPONSE",
      field,
    });
  }
  return value;
}

function optionalPositiveInteger(data, field) {
  if (!Object.prototype.hasOwnProperty.call(data, field)) return null;
  return requireInteger(data[field], { field, minimum: 1 });
}

function normalizedPage(items, raw, metadata = {}) {
  const total = nonNegativeNumber(metadata.total, items.length);
  const page = positiveNumber(metadata.page, 1);
  const size = nonNegativeNumber(metadata.size, items.length);
  const computedPages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  const pages = nonNegativeNumber(metadata.pages, computedPages);

  return { items, total, page, size, pages, raw };
}

export function normalizePaginatedList(response) {
  if (response instanceof Error) throw response;
  if (Array.isArray(response)) return normalizedPage(response, response);

  const data = requireRecord(response, "paginated_list");
  if (Object.prototype.hasOwnProperty.call(data, "items")) {
    if (!Array.isArray(data.items)) {
      throw new ApiContractError("Invalid paginated list response: items must be an array.", {
        code: "INVALID_PAGINATED_LIST_RESPONSE",
        field: "items",
      });
    }
    return normalizedPage(data.items, response, data);
  }

  if (Object.prototype.hasOwnProperty.call(data, "results")) {
    if (!Array.isArray(data.results)) {
      throw new ApiContractError("Invalid paginated list response: results must be an array.", {
        code: "INVALID_PAGINATED_LIST_RESPONSE",
        field: "results",
      });
    }
    const total = requireInteger(data.count, { field: "count", minimum: 0 });
    return {
      items: data.results,
      total,
      page: optionalPositiveInteger(data, "page"),
      size: optionalPositiveInteger(data, "size"),
      pages: optionalPositiveInteger(data, "pages"),
      raw: response,
    };
  }

  throw new ApiContractError("Invalid paginated list response: no supported list field.", {
    code: "INVALID_PAGINATED_LIST_RESPONSE",
  });
}
