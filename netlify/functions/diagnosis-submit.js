"use strict";

const SITE_URL = "https://sakamoto-growth-partners.com";
const MAX_FIELD_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 6;
const rateLimitStore = new Map();

const requiredFields = [
  "company_name",
  "name",
  "employee_range",
  "challenge_detail",
  "email",
  "contact_method",
  "privacy_agreed"
];

const allowedFields = [
  "form-name",
  "source",
  "status",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "first_source",
  "first_medium",
  "first_campaign",
  "referrer",
  "landing_page",
  "service_interest",
  "submission_id",
  "company_name",
  "name",
  "position",
  "prefecture",
  "industry",
  "industry_other",
  "employee_range",
  "issues",
  "president_tasks",
  "challenge_detail",
  "email",
  "phone",
  "contact_method",
  "message",
  "privacy_agreed"
];

function response(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function redirect(location) {
  return {
    statusCode: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store"
    },
    body: ""
  };
}

function wantsJson(event) {
  const headers = event.headers || {};
  const requestedWith = headers["x-requested-with"] || headers["X-Requested-With"] || "";
  const accept = headers.accept || headers.Accept || "";
  return requestedWith.toLowerCase() === "xmlhttprequest" || accept.includes("application/json");
}

function decodeBody(event) {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

function getClientKey(event) {
  const headers = event.headers || {};
  return (
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    headers["x-forwarded-for"] ||
    "unknown"
  )
    .split(",")[0]
    .trim();
}

function rateLimited(key) {
  const now = Date.now();
  const current = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  current.count += 1;
  rateLimitStore.set(key, current);
  return current.count > RATE_LIMIT_MAX;
}

function validate(params) {
  const errors = [];
  for (const field of requiredFields) {
    if (!cleanValue(params.get(field))) errors.push({ field, message: "required" });
  }

  const email = cleanValue(params.get("email"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "invalid_email" });
  }

  const issues = params.getAll("issues").map(cleanValue).filter(Boolean);
  if (issues.length < 1) errors.push({ field: "issues", message: "required" });

  if (cleanValue(params.get("industry")) === "その他" && !cleanValue(params.get("industry_other"))) {
    errors.push({ field: "industry_other", message: "required" });
  }

  if (cleanValue(params.get("privacy_agreed")) !== "同意する") {
    errors.push({ field: "privacy_agreed", message: "required" });
  }

  return errors;
}

function buildNetlifyPayload(params) {
  const payload = new URLSearchParams();
  payload.set("form-name", "diagnosis");
  payload.set("source", cleanValue(params.get("source")) || "diagnosis_lp");
  payload.set("status", cleanValue(params.get("status")) || "new");

  for (const field of allowedFields) {
    if (field === "form-name" || field === "source" || field === "status") continue;
    const values = params.getAll(field);
    for (const value of values) {
      const cleaned = cleanValue(value);
      if (cleaned) payload.append(field, cleaned);
    }
  }

  return payload;
}

exports.handler = async function handler(event) {
  const json = wantsJson(event);

  if (event.httpMethod !== "POST") {
    return response(405, { success: false, error: "method_not_allowed" }, { Allow: "POST" });
  }

  if (rateLimited(getClientKey(event))) {
    return response(429, { success: false, error: "rate_limited" });
  }

  const params = new URLSearchParams(decodeBody(event));

  if (cleanValue(params.get("bot-field"))) {
    return json ? response(200, { success: true, spam: true }) : redirect("/diagnosis/thanks/");
  }

  const errors = validate(params);
  if (errors.length > 0) {
    return response(400, { success: false, error: "validation_failed", errors });
  }

  const payload = buildNetlifyPayload(params);

  try {
    const submitResponse = await fetch(`${SITE_URL}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload.toString()
    });

    if (!submitResponse.ok) {
      return response(500, { success: false, error: "lead_save_failed" });
    }
  } catch (error) {
    return response(500, { success: false, error: "lead_save_failed" });
  }

  return json ? response(200, { success: true }) : redirect("/diagnosis/thanks/");
};
