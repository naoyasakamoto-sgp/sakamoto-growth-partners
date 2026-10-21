import { createServer } from "node:http";
import {
  evaluateCandidates,
  inferPaidMonths,
  calculateDeadlineExtension,
  createLedgerEvent
} from "./index.js";

const port = Number(process.env.PORT ?? 8787);

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, {
        ok: true,
        service: "pawnflow-core",
        version: "0.1.0",
        mode: "shadow"
      });
    }

    if (req.method === "POST" && req.url === "/v1/match") {
      const body = await readJson(req);
      return send(
        res,
        200,
        evaluateCandidates(
          body.transaction,
          body.candidates ?? [],
          body.aliasLookup ?? {},
          body.policy
        )
      );
    }

    if (req.method === "POST" && req.url === "/v1/deadline") {
      const body = await readJson(req);
      const paid = inferPaidMonths({
        paymentAmount: body.paymentAmount,
        monthlyInterest: body.monthlyInterest
      });

      if (!paid.exact) {
        return send(res, 200, {
          decision: "REVIEW",
          reason: "PAYMENT_NOT_EXACT_MONTH_MULTIPLE",
          paid
        });
      }

      return send(res, 200, {
        decision: "OK",
        paid,
        deadline: calculateDeadlineExtension({
          previousDeadline: body.previousDeadline,
          paidMonths: paid.wholeMonths,
          ruleVersion: body.ruleVersion ?? "0.1.0"
        })
      });
    }

    if (req.method === "POST" && req.url === "/v1/ledger-events") {
      const body = await readJson(req);
      return send(res, 201, createLedgerEvent(body));
    }

    return send(res, 404, { error: "not_found" });
  } catch (error) {
    return send(res, 400, {
      error: "bad_request",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, () => {
  console.log("PawnFlow Core listening on port " + port);
});
