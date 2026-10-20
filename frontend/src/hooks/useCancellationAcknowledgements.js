import { useCallback, useEffect, useState } from "react";
import { cancellationAcknowledgements } from "../api/cancellationAcknowledgements";
import { parseWebInstant } from "../utils/webTime";

const EVENT = "marjon:cancellation-acknowledged";
export function isCancellationAcknowledged(receipts, orderId, eventAt) {
  const receipt = receipts[String(orderId)];
  if (!receipt) return false;
  const event = parseWebInstant(eventAt);
  const read = parseWebInstant(receipt);
  return Boolean(read && (!event || read >= event));
}

export function useCancellationAcknowledgements() {
  const [receipts, setReceipts] = useState({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const apply = ({ order_id, acknowledged_at }) => {
      if (order_id && acknowledged_at) setReceipts(current => {
        if (current[order_id] && parseWebInstant(current[order_id]) >= parseWebInstant(acknowledged_at)) return current;
        return { ...current, [order_id]: acknowledged_at };
      });
    };
    const onAcknowledged = event => apply(event.detail);
    window.addEventListener(EVENT, onAcknowledged);
    cancellationAcknowledgements.list({ signal: controller.signal }).then(({ data }) => {
      if (active && Array.isArray(data)) data.forEach(apply);
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); }); // Read failures must not hide notifications.
    return () => { active = false; controller.abort(); window.removeEventListener(EVENT, onAcknowledged); };
  }, []);
  const acknowledge = useCallback(async (orderId) => {
    const { data } = await cancellationAcknowledgements.acknowledge(orderId);
    if (!data?.order_id || !data?.acknowledged_at) throw new Error("Invalid acknowledgement");
    window.dispatchEvent(new CustomEvent(EVENT, { detail: data }));
  }, []);
  return { receipts, acknowledge, loaded };
}
