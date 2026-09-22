import { createHash, randomUUID } from "node:crypto";

export const LedgerEventType = Object.freeze({
  PAYMENT_POSTED: "PAYMENT_POSTED",
  PAYMENT_REVERSED: "PAYMENT_REVERSED",
  DEADLINE_EXTENDED: "DEADLINE_EXTENDED",
  MATCH_REVIEWED: "MATCH_REVIEWED"
});

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + stableJson(value[key]))
      .join(",") + "}";
  }
  return JSON.stringify(value);
}

export function createLedgerEvent({
  type,
  occurredAt = new Date(),
  organizationId,
  storeId,
  contractId = null,
  customerId = null,
  transactionId = null,
  amount = null,
  ruleVersion = "0.1.0",
  actorType = "SYSTEM",
  actorId = null,
  source = "PAWNFLOW_CORE",
  payload = {}
}) {
  if (!Object.values(LedgerEventType).includes(type)) {
    throw new TypeError("unsupported ledger event type: " + type);
  }
  if (!organizationId || !storeId) {
    throw new TypeError("organizationId and storeId are required");
  }

  const canonicalPayload = {
    type,
    organizationId,
    storeId,
    contractId,
    customerId,
    transactionId,
    amount,
    ruleVersion,
    actorType,
    actorId,
    source,
    payload
  };

  return Object.freeze({
    eventId: randomUUID(),
    eventType: type,
    occurredAt: new Date(occurredAt).toISOString(),
    organizationId,
    storeId,
    contractId,
    customerId,
    transactionId,
    amount,
    ruleVersion,
    actorType,
    actorId,
    source,
    payload,
    payloadHash: createHash("sha256")
      .update(stableJson(canonicalPayload))
      .digest("hex")
  });
}
