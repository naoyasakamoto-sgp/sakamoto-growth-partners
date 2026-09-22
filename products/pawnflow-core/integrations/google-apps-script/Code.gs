const PF = Object.freeze({
  CONFIG_SHEET: "PF_Config",
  TRANSACTIONS_SHEET: "PF_BankTransactions",
  MATCHES_SHEET: "PF_PaymentMatches",
  LEDGER_SHEET: "PF_LedgerEvents",
  EXCEPTIONS_SHEET: "PF_Exceptions",
  CONTRACT_SHEET: "契約台帳_KPI",
  ALIAS_SHEET: "名寄せマスター"
});

function pawnflowHealthCheck() {
  const baseUrl = getPawnFlowApiBaseUrl_();
  const response = UrlFetchApp.fetch(baseUrl + "/health", {
    method: "get",
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
  return JSON.parse(response.getContentText());
}

function pawnflowShadowMatchPending() {
  const ss = SpreadsheetApp.getActive();
  const txSheet = ss.getSheetByName(PF.TRANSACTIONS_SHEET);
  if (!txSheet) throw new Error("Missing " + PF.TRANSACTIONS_SHEET);

  const values = txSheet.getDataRange().getValues();
  if (values.length < 2) return { processed: 0 };

  const headers = values[0];
  const index = indexByHeader_(headers);
  const contracts = readContracts_();
  const aliasLookup = readAliasLookup_();

  let processed = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row[index.transaction_id]) continue;
    if (row[index.review_status] && row[index.review_status] !== "PENDING") continue;
    if (row[index.match_status] && row[index.match_status] !== "UNMATCHED") continue;

    const transaction = {
      transactionId: String(row[index.transaction_id]),
      amount: Number(row[index.amount]),
      payerName: String(row[index.payer_name_normalized] || row[index.payer_name_raw] || ""),
      transactionDate: toIsoDate_(row[index.transaction_date])
    };

    const result = postPawnFlow_("/v1/match", {
      transaction,
      candidates: contracts,
      aliasLookup
    });

    writeMatchResult_(transaction, result);
    processed++;
  }

  return { processed };
}

function readContracts_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PF.CONTRACT_SHEET);
  const values = sheet.getDataRange().getValues();
  const h = indexByHeader_(values[0]);

  return values.slice(1)
    .filter(row => row[h["契約NO"]] && row[h["状態"]] === "稼働中")
    .map(row => ({
      contractId: String(row[h["契約NO"]]),
      customerId: String(row[h["契約NO"]]),
      customerName: String(row[h["顧客名"]] || ""),
      customerKana: String(row[h["顧客名カナ（名寄せ）"]] || ""),
      monthlyInterest: Number(row[h["月利"]] || 0),
      nextDeadline: toIsoDate_(row[h["次回期限(暫定)"]])
    }));
}

function readAliasLookup_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PF.ALIAS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};

  // DP01 legacy sheet lacks stable customer_id. Alpha keeps aliases available
  // for review; customer_id mapping is introduced in the next migration step.
  return {};
}

function writeMatchResult_(transaction, result) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PF.MATCHES_SHEET);
  const now = new Date();

  (result.ranked || []).forEach((candidate, i) => {
    sheet.appendRow([
      Utilities.getUuid(),
      transaction.transactionId,
      i + 1,
      candidate.contractId,
      "",
      transaction.amount,
      "",
      candidate.components.amountScore,
      candidate.components.nameScore,
      candidate.components.aliasScore,
      candidate.components.deadlineScore,
      candidate.components.historyScore,
      candidate.score,
      result.decision,
      (candidate.reasonCodes || []).join("|"),
      "",
      "",
      now
    ]);
  });
}

function postPawnFlow_(path, payload) {
  const response = UrlFetchApp.fetch(getPawnFlowApiBaseUrl_() + path, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error("PawnFlow API " + status + ": " + body);
  }

  return JSON.parse(body);
}

function getPawnFlowApiBaseUrl_() {
  const value = PropertiesService.getScriptProperties().getProperty("PAWNFLOW_API_BASE_URL");
  if (!value) throw new Error("Set Script Property PAWNFLOW_API_BASE_URL first");
  return value.replace(/\/$/, "");
}

function indexByHeader_(headers) {
  return headers.reduce((acc, value, i) => {
    acc[String(value)] = i;
    return acc;
  }, {});
}

function toIsoDate_(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd");
}
