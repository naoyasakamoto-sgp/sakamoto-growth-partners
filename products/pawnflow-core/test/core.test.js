import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePayerName,
  evaluateCandidates,
  inferPaidMonths,
  calculateDeadlineExtension,
  createLedgerEvent,
  LedgerEventType
} from "../src/index.js";

test("normalizes payer names", () => {
  assert.equal(normalizePayerName(" ﾔﾏﾀﾞ　ﾀﾛｳ "), "ヤマダタロウ");
});

test("auto match requires exact amount and strong identity", () => {
  const tx = {
    amount: 3000,
    payerName: "ｻｸﾗｲ ｸﾐｺ",
    transactionDate: "2026-09-22"
  };

  const candidates = [
    {
      contractId: "7",
      customerId: "C7",
      customerKana: "サクライクミコ",
      monthlyInterest: 3000,
      nextDeadline: "2026-09-23"
    },
    {
      contractId: "8",
      customerId: "C8",
      customerKana: "サトウヨシエ",
      monthlyInterest: 3000,
      nextDeadline: "2026-09-23"
    }
  ];

  const result = evaluateCandidates(tx, candidates);
  assert.equal(result.decision, "AUTO");
  assert.equal(result.selected.contractId, "7");
});

test("unknown payer never auto-matches on amount alone", () => {
  const tx = {
    amount: 3000,
    payerName: "UNKNOWN",
    transactionDate: "2026-09-22"
  };

  const candidates = [
    {
      contractId: "7",
      customerId: "C7",
      customerKana: "サクライクミコ",
      monthlyInterest: 3000,
      nextDeadline: "2026-09-23"
    }
  ];

  const result = evaluateCandidates(tx, candidates);
  assert.notEqual(result.decision, "AUTO");
});

test("infers exact paid months", () => {
  assert.deepEqual(
    inferPaidMonths({ paymentAmount: 18000, monthlyInterest: 9000 }),
    { wholeMonths: 2, remainder: 0, exact: true }
  );
});

test("deadline extension preserves end-of-month semantics", () => {
  const result = calculateDeadlineExtension({
    previousDeadline: "2026-01-31T00:00:00Z",
    paidMonths: 1
  });
  assert.equal(result.newDeadline, "2026-02-28");
});

test("ledger event contains a stable payload hash", () => {
  const event = createLedgerEvent({
    type: LedgerEventType.PAYMENT_POSTED,
    organizationId: "DP01",
    storeId: "STORE01",
    contractId: "7",
    transactionId: "TX1",
    amount: 3000
  });

  assert.equal(event.eventType, "PAYMENT_POSTED");
  assert.equal(event.payloadHash.length, 64);
});
