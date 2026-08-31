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
  return errors;
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
