"use strict";

var rateLimitStore = new Map();
var RATE_LIMIT_WINDOW_MS = 60 * 1000;
var RATE_LIMIT_MAX = 6;
var ALLOWED_INTERESTS = new Set([
  "ai",
  "business-improvement",
  "web-marketing",
  "system-development",
  "meo-line",
  "other",
]);
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CURRENT_METHODS = new Set([
  "紙",
  "Excel / スプレッドシート",
  "LINE / メール",
  "既存システム",
  "複数の方法を併用",
  "その他",
]);
var STAKEHOLDERS = new Set([
  "経営者",
  "店長・管理者",
  "現場スタッフ",
  "事務担当",
  "外部業者",
  "その他",
]);
var PAIN_POINTS = new Set([
  "作業に時間がかかる",
  "転記作業が多い",
  "ミス・確認漏れが起きる",
  "情報がバラバラになっている",
  "特定の人しか分からない",
  "集計・報告が大変",
  "状況をリアルタイムで把握できない",
  "その他",
]);
var FREQUENCIES = new Set([
  "1日に何度も",
  "毎日",
  "週に数回",
  "月に数回",
  "不定期",
]);

function response(statusCode, body, headers) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      headers || {},
    ),
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLength || 2000);
}

function sanitizeList(values, allowedValues, maxItems) {
  var unique = [];
  (values || []).forEach(function (value) {
    var sanitized = sanitize(value, 100);
    if (
      allowedValues.has(sanitized) &&
      unique.indexOf(sanitized) < 0 &&
      unique.length < maxItems
    )
      unique.push(sanitized);
  });
  return unique;
}

function isAjax(event) {
  var headers = event.headers || {};
  return (
    sanitize(
      headers["x-requested-with"] || headers["X-Requested-With"],
      100,
    ).toLowerCase() === "xmlhttprequest" ||
    sanitize(headers.accept, 200).indexOf("application/json") >= 0
  );
}

function clientIp(event) {
  var headers = event.headers || {};
  return sanitize(
    headers["x-nf-client-connection-ip"] ||
      headers["x-forwarded-for"] ||
      "unknown",
    100,
  )
    .split(",")[0]
    .trim();
}

function isRateLimited(ip) {
  var now = Date.now();
  var entry = rateLimitStore.get(ip);
  if (!entry || now - entry.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function parseBody(body) {
  var values = new URLSearchParams(body || "");
  return {
    formName: sanitize(values.get("form-name"), 50),
    botField: sanitize(values.get("bot-field"), 200),
    source: sanitize(values.get("source"), 80),
    interest: sanitize(values.get("interest"), 80),
    name: sanitize(values.get("name"), 100),
    company: sanitize(values.get("company"), 120),
    email: sanitize(values.get("email"), 254),
    phone: sanitize(values.get("phone"), 30),
    message: sanitize(values.get("message"), 2000),
    privacyAgreed: sanitize(values.get("privacy_agreed"), 20),
    firstSource: sanitize(values.get("first_source"), 200),
    firstMedium: sanitize(values.get("first_medium"), 200),
    firstCampaign: sanitize(values.get("first_campaign"), 200),
    landingPage: sanitize(values.get("landing_page"), 500),
    referrer: sanitize(values.get("referrer"), 500),
    serviceInterest: sanitize(values.get("service_interest"), 100),
    submissionId: sanitize(values.get("submission_id"), 100),
    leadSource: sanitize(values.get("lead_source"), 120),
    leadCase: sanitize(values.get("lead_case"), 120),
    leadIntent: sanitize(values.get("lead_intent"), 120),
    businessImprovement: {
      improvementTarget: sanitize(values.get("improvementTarget"), 1000),
      currentMethods: sanitizeList(
        values.getAll("currentMethods"),
        CURRENT_METHODS,
        6,
      ),
      currentMethodOther: sanitize(
        values.get("currentMethodOther"),
        300,
      ),
      stakeholders: sanitizeList(
        values.getAll("stakeholders"),
        STAKEHOLDERS,
        6,
      ),
      painPoints: sanitizeList(values.getAll("painPoints"), PAIN_POINTS, 8),
      frequency: FREQUENCIES.has(sanitize(values.get("frequency"), 100))
        ? sanitize(values.get("frequency"), 100)
        : "",
      desiredState: sanitize(values.get("desiredState"), 1000),
      currentTools: sanitize(values.get("currentTools"), 1000),
    },
  };
}

function validate(data) {
  var errors = {};
  if (data.formName !== "contact") errors.form = "invalid_form";
  if (!ALLOWED_INTERESTS.has(data.interest)) errors.interest = "required";
  if (!data.name) errors.name = "required";
  if (!data.email || !EMAIL_PATTERN.test(data.email)) errors.email = "invalid";
  if (!data.message) errors.message = "required";
  if (data.privacyAgreed !== "同意する") errors.privacy_agreed = "required";
  if (data.interest === "business-improvement") {
    if (!data.businessImprovement.improvementTarget)
      errors.improvementTarget = "required";
    if (!data.businessImprovement.currentMethods.length)
      errors.currentMethods = "required";
    if (!data.businessImprovement.painPoints.length)
      errors.painPoints = "required";
  }
  return errors;
}

function buildBusinessImprovementSummary(intake) {
  var sections = [
    "【業務改善・DX 事前ヒアリング】",
    "",
    "■ 改善したい業務",
    intake.improvementTarget,
    "",
    "■ 現在の方法",
    intake.currentMethods.join("\n"),
  ];

  if (intake.currentMethodOther && intake.currentMethods.indexOf("その他") >= 0)
    sections.push("その他：" + intake.currentMethodOther);
  if (intake.stakeholders.length)
    sections.push("", "■ 関係者", intake.stakeholders.join("\n"));
  sections.push("", "■ 困っていること", intake.painPoints.join("\n"));
  if (intake.frequency)
    sections.push("", "■ 発生頻度", intake.frequency);
  if (intake.desiredState)
    sections.push("", "■ 理想の状態", intake.desiredState);
  if (intake.currentTools)
    sections.push("", "■ 現在使用中のツール", intake.currentTools);

  return sections.join("\n");
}

function appendBusinessImprovement(payload, intake) {
  payload.set("improvementTarget", intake.improvementTarget);
  payload.set("currentMethods", intake.currentMethods.join("\n"));
  if (intake.currentMethodOther && intake.currentMethods.indexOf("その他") >= 0)
    payload.set("currentMethodOther", intake.currentMethodOther);
  if (intake.stakeholders.length)
    payload.set("stakeholders", intake.stakeholders.join("\n"));
  payload.set("painPoints", intake.painPoints.join("\n"));
  if (intake.frequency) payload.set("frequency", intake.frequency);
  if (intake.desiredState) payload.set("desiredState", intake.desiredState);
  if (intake.currentTools) payload.set("currentTools", intake.currentTools);
  payload.set(
    "business_improvement_intake",
    buildBusinessImprovementSummary(intake),
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST")
    return response(
      405,
      { success: false, error: "method_not_allowed" },
      { Allow: "POST" },
    );
  if (isRateLimited(clientIp(event)))
    return response(429, { success: false, error: "too_many_requests" });

  var data = parseBody(event.body);
  if (data.botField) {
    if (isAjax(event)) return response(200, { success: true });
    return response(303, "", {
      Location: "/contact/thanks/",
      "Content-Type": "text/plain; charset=utf-8",
    });
  }

  var errors = validate(data);
  if (Object.keys(errors).length)
    return response(400, {
      success: false,
      error: "validation_failed",
      fields: errors,
    });

  var payload = new URLSearchParams();
  payload.set("form-name", "contact");
  payload.set("source", data.source || "official_contact");
  payload.set("interest", data.interest);
  payload.set("name", data.name);
  if (data.company) payload.set("company", data.company);
  payload.set("email", data.email);
  if (data.phone) payload.set("phone", data.phone);
  payload.set("message", data.message);
  payload.set("privacy_agreed", data.privacyAgreed);
  if (data.firstSource) payload.set("first_source", data.firstSource);
  if (data.firstMedium) payload.set("first_medium", data.firstMedium);
  if (data.firstCampaign) payload.set("first_campaign", data.firstCampaign);
  if (data.landingPage) payload.set("landing_page", data.landingPage);
  if (data.referrer) payload.set("referrer", data.referrer);
  if (data.serviceInterest) payload.set("service_interest", data.serviceInterest);
  if (data.submissionId) payload.set("submission_id", data.submissionId);
  if (data.leadSource) payload.set("lead_source", data.leadSource);
  if (data.leadCase) payload.set("lead_case", data.leadCase);
  if (data.leadIntent) payload.set("lead_intent", data.leadIntent);
  if (data.interest === "business-improvement")
    appendBusinessImprovement(payload, data.businessImprovement);

  try {
    var netlifyResponse = await fetch("https://sakamoto-growth-partners.com/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });
    if (!netlifyResponse.ok)
      return response(502, { success: false, error: "lead_storage_failed" });
  } catch (_error) {
    return response(502, { success: false, error: "lead_storage_failed" });
  }

  if (isAjax(event)) return response(200, { success: true });
  return response(303, "", {
    Location: "/contact/thanks/",
    "Content-Type": "text/plain; charset=utf-8",
  });
};
