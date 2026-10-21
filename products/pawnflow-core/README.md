# PawnFlow Core Alpha

PawnFlow is SGP's first Vertical AI product candidate for pawn-shop operations.

The Alpha keeps the Design Partner's current Google Sheets workflow as the **System of Record** while extracting reusable logic into a common product core.

## Architecture

Bank CSV -> Google Drive / Sheets -> Apps Script -> PawnFlow Core API -> Sheets UI / client LLM

### Responsibilities

**Google Sheets / Apps Script**
- data entry and operator UI
- CSV import orchestration
- scheduled jobs
- review queue

**PawnFlow Core**
- deterministic payment matching
- deadline rules
- append-only ledger event creation
- reusable API contract

**Client LLM**
- explanation
- candidate summaries
- daily reports
- management commentary

The LLM is not authoritative for financial calculations or ledger writes.

## Design Partner #1

Staging workbook: `PawnFlow_AI_Alpha_DP01_2026-09-23`

Existing tabs retained:
- `契約台帳_KPI`
- `入金履歴_KPI`
- `名寄せマスター`
- `KPIダッシュボード`

PawnFlow tabs added:
- `PF_Config`
- `PF_BankTransactions`
- `PF_PaymentMatches`
- `PF_LedgerEvents`
- `PF_Exceptions`
- `PF_SchemaMap`

The workbook timezone is normalized to `Asia/Tokyo`.

## Safety model

1. Alpha starts in Shadow Mode.
2. Automatic posting requires a conservative confidence threshold.
3. Ambiguous matches go to human review.
4. Ledger events are append-only.
5. Reversals create new events instead of overwriting history.
6. PII sent to LLMs should be minimized.
7. Business dates are interpreted in JST.

## HTTP API

- `GET /health`
- `POST /v1/match`
- `POST /v1/deadline`
- `POST /v1/ledger-events`

## Run

```bash
cd products/pawnflow-core
npm test
npm start
```

Default port: `8787`.

## Google Apps Script

`integrations/google-apps-script/Code.gs` contains the initial Sheets bridge.

Set Script Property:

```
PAWNFLOW_API_BASE_URL=https://your-pawnflow-core.example.com
```

Then run `pawnflowHealthCheck()` and, after verification, `pawnflowShadowMatchPending()`.

## Productization gate

The next migration begins after:
- 3-5 pawn shops reproduce the same workflow
- zero erroneous auto-posts in the pilot
- matching candidate coverage >95%
- material reduction in daily reconciliation work
- common workflow >=80%
