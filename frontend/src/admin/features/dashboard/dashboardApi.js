import { adminApi } from "../../api";

let pendingOrganizationTotal = null;

function readPageTotal(response) {
  const total = response?.data?.total;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new TypeError("Invalid Organization page total");
  }
  return total;
}

function requestOrganizationTotal() {
  if (pendingOrganizationTotal) return pendingOrganizationTotal;

  const request = adminApi
    .get("/organizations", { params: { page: 1, size: 1 } })
    .then(readPageTotal);

  pendingOrganizationTotal = request;
  request.then(
    () => { if (pendingOrganizationTotal === request) pendingOrganizationTotal = null; },
    () => { if (pendingOrganizationTotal === request) pendingOrganizationTotal = null; },
  );
  return request;
}

export const dashboardApi = {
  getOrganizationTotal: requestOrganizationTotal,
};
