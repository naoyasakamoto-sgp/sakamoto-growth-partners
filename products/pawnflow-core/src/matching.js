import { normalizeMoney, normalizePayerName } from "./normalize.js";

export const DEFAULT_MATCH_POLICY = Object.freeze({
  autoThreshold: 0.98,
  reviewThreshold: 0.8,
  minimumGapForAuto: 0.05
});

function dateDistanceScore(transactionDate, deadline) {
  if (!transactionDate || !deadline) return 0;
  const tx = new Date(transactionDate);
  const dl = new Date(deadline);
  if (Number.isNaN(tx.valueOf()) || Number.isNaN(dl.valueOf())) return 0;

  const days = Math.abs(dl - tx) / 86400000;
  if (days <= 3) return 1;
  if (days <= 7) return 0.8;
  if (days <= 14) return 0.5;
  if (days <= 31) return 0.2;
  return 0;
}

export function scoreCandidate(transaction, contract, aliases = []) {
  const amount = normalizeMoney(transaction.amount);
  const expected = normalizeMoney(contract.expectedInterest ?? contract.monthlyInterest ?? 0);
  const payer = normalizePayerName(transaction.payerName);
  const primaryName = normalizePayerName(contract.customerKana ?? contract.customerName);
  const normalizedAliases = aliases.map(normalizePayerName).filter(Boolean);

  const amountExact = expected > 0 && amount === expected;
  const nameExact = Boolean(payer && primaryName && payer === primaryName);
  const aliasExact = Boolean(payer && normalizedAliases.includes(payer));
  const historyExact = Boolean(
    payer &&
    contract.previouslyApprovedPayer &&
    normalizePayerName(contract.previouslyApprovedPayer) === payer
  );

  const identityScore = Math.max(nameExact ? 1 : 0, aliasExact ? 1 : 0, historyExact ? 1 : 0);
  const deadlineScore = dateDistanceScore(transaction.transactionDate, contract.nextDeadline);

  const total =
    0.5 * (amountExact ? 1 : 0) +
    0.35 * identityScore +
    0.1 * deadlineScore +
    0.05 * (historyExact ? 1 : 0);

  const reasonCodes = [];
  if (amountExact) reasonCodes.push("AMOUNT_EXACT");
  if (nameExact) reasonCodes.push("NAME_EXACT");
  if (aliasExact) reasonCodes.push("ALIAS_EXACT");
  if (deadlineScore >= 0.8) reasonCodes.push("DEADLINE_NEAR");
  if (historyExact) reasonCodes.push("HISTORY_EXACT");

  return {
    contractId: String(contract.contractId),
    score: Number(total.toFixed(4)),
    amountExact,
    identityExact: identityScore === 1,
    components: {
      amountScore: amountExact ? 1 : 0,
      nameScore: nameExact ? 1 : 0,
      aliasScore: aliasExact ? 1 : 0,
      deadlineScore,
      historyScore: historyExact ? 1 : 0
    },
    reasonCodes
  };
}

export function evaluateCandidates(transaction, candidates, aliasLookup = {}, policy = DEFAULT_MATCH_POLICY) {
  const ranked = candidates
    .map((contract) =>
      scoreCandidate(
        transaction,
        contract,
        aliasLookup[String(contract.customerId)] ?? []
      )
    )
    .sort((a, b) => b.score - a.score);

  const first = ranked[0];
  const second = ranked[1];

  if (!first) return { decision: "REJECT", selected: null, ranked: [] };

  const gap = second ? first.score - second.score : first.score;
  const safeForAuto =
    first.score >= policy.autoThreshold &&
    gap >= policy.minimumGapForAuto &&
    first.amountExact &&
    first.identityExact;

  if (safeForAuto) return { decision: "AUTO", selected: first, ranked };
  if (first.score >= policy.reviewThreshold) return { decision: "REVIEW", selected: first, ranked };
  return { decision: "REJECT", selected: first, ranked };
}
