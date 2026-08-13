import { api } from "./client";

const RESOURCE_PATHS = Object.freeze({
  clients: "/crm/counterparties",
  places: "/halls",
  paymentMethods: "/finance/payment-types",
  units: "/units",
  printers: "/printers",
});

function resourcePath(resource) {
  const path = RESOURCE_PATHS[resource];
  if (!path) throw new TypeError(`Unknown settings resource: ${resource}`);
  return path;
}

export const settingsService = Object.freeze({
  listResource(resource) {
    return api.get(resourcePath(resource));
  },
  createResource(resource, payload) {
    return api.post(resourcePath(resource), payload);
  },
  updateResource(resource, id, payload) {
    return api.patch(`${resourcePath(resource)}/${id}`, payload);
  },
  deleteResource(resource, id) {
    return api.delete(`${resourcePath(resource)}/${id}`);
  },
  getCompanyProfile() {
    return api.get("/companies/me");
  },
  updateCompanyProfile(payload) {
    return api.patch("/companies/me", payload);
  },
  listBranches() {
    return api.get("/companies/me/branches");
  },
  listDashboardPlaces() {
    return api.get("/settings/places");
  },
  getBillingBalance() {
    return api.get("/billing/balance");
  },
  createSupportTicket(payload) {
    return api.post("/support/tickets", payload);
  },
});

export { RESOURCE_PATHS };
