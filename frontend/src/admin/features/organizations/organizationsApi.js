import { adminApi } from "../../api";

const ORGANIZATIONS_PATH = "/organizations";
const ORGANIZATION_STATUSES_PATH = "/organization-statuses";
const COUNTRIES_PATH = "/countries";
const REGIONS_PATH = "/regions";
const DISTRICTS_PATH = "/districts";

function resourcePath(basePath, resourceId, label) {
  const normalizedId = String(resourceId ?? "").trim();
  if (!normalizedId) throw new TypeError(`${label} is required`);
  return `${basePath}/${encodeURIComponent(normalizedId)}`;
}

function listConfig(params, config) {
  return { ...config, params: { ...params } };
}

export const organizationsApi = {
  listOrganizations(params = { page: 1, size: 20 }, config = {}) {
    return adminApi.get(ORGANIZATIONS_PATH, listConfig(params, config));
  },

  createOrganization(payload, config = {}) {
    return adminApi.post(ORGANIZATIONS_PATH, payload, config);
  },

  updateOrganization(organizationId, payload, config = {}) {
    return adminApi.patch(resourcePath(ORGANIZATIONS_PATH, organizationId, "organizationId"), payload, config);
  },

  archiveOrganization(organizationId, config = {}) {
    return adminApi.delete(resourcePath(ORGANIZATIONS_PATH, organizationId, "organizationId"), config);
  },

  listOrganizationStatuses(params = { page: 1, size: 20, sort: "sort" }, config = {}) {
    return adminApi.get(ORGANIZATION_STATUSES_PATH, listConfig(params, config));
  },

  listCountries(params = { page: 1, size: 200 }, config = {}) {
    return adminApi.get(COUNTRIES_PATH, listConfig(params, config));
  },

  listRegions(params = { page: 1, size: 200 }, config = {}) {
    return adminApi.get(REGIONS_PATH, listConfig(params, config));
  },

  listDistricts(params = { page: 1, size: 200 }, config = {}) {
    return adminApi.get(DISTRICTS_PATH, listConfig(params, config));
  },

  createOrganizationStatus(payload, config = {}) {
    return adminApi.post(ORGANIZATION_STATUSES_PATH, payload, config);
  },

  updateOrganizationStatus(statusId, payload, config = {}) {
    return adminApi.patch(resourcePath(ORGANIZATION_STATUSES_PATH, statusId, "statusId"), payload, config);
  },

  deleteOrganizationStatus(statusId, config = {}) {
    return adminApi.delete(resourcePath(ORGANIZATION_STATUSES_PATH, statusId, "statusId"), config);
  },
};
