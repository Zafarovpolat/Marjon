import { api } from "./client";

export const cancellationAcknowledgements = {
  list(config) { return api.get("/reports/cancelled/acknowledgements", config); },
  acknowledge(orderId) { return api.post(`/reports/cancelled/${encodeURIComponent(orderId)}/acknowledge`); },
};
