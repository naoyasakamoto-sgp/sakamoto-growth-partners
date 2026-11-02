# SGP Taste Adaptive Web — implementation and publication gate
Status: **copy approved (A–G) / source assets verified / Chrome QA passed / staged Taste route**  
Branch: feat/taste-adaptive-experience-20261102  
Date: 2026-11-02

## Scope completed in this branch

- A noindex, approved-copy editorial exhibition at /taste-lab/, linked through an owner-approved Taste label from the existing homepage.
- Strict, versioned AI JSON importer, including fenced JSON handling and input length/type/value restrictions.
- Existing ERABU domain seed identification (erabu-ai-taste-seed@1); the 12 location/experience axes are not deceptively converted into Web UX preferences.
- New SGP Web experience schema (sgp-web-taste@1) with four interest scores, five experience settings, and explicit/inferred/unknown provenance.
- Human confirmation / manual editing, explicit save choice, export, deletion, and default experience restoration.
- Deterministic artifact reordering and layout variations. All exhibits remain accessible.
- Semantic links to the real ERABU product and real MY JAZZ DAY case study.
- Conceptual diagrams clearly marked CONCEPT (not presented as verified implementation evidence).
- Test suites: taste/engine.test.mjs and taste/preflight.test.mjs.

## Experience and privacy invariants

1. The initial homepage is useful with zero AI access and zero Taste data.
2. Never make the user's AI account, chat contents, credentials, history, or identifying data a condition for viewing SGP.
3. The external AI only produces JSON; it cannot create published SGP copy, scripts, styles, or arbitrary HTML.
4. Reject unknown keys at the top level and in the Web profile. Never use HTML injection sinks with imported data.
5. Browser-local by default; persistence requires the user's own opt-in. No analytics events may contain Taste values or the raw AI output.
6. A personal preference is not a current task or an accessibility requirement; explicit focus and reduced-motion controls have priority.
7. The product company must curate meaningful artifacts and visual designs; the algorithm only selects curated pieces.
8. Respect the user's instruction: DO NOT publish text not individually approved. Even short UI labels and error copy must pass review.
9. Maintain direct access to official corporate information, accessibility, and contact regardless of Taste.
10. Do not merge a preview into the public site until release gates are signed off.

## Approval worklist

Existing reviewed text in taste-lab/index.html and taste-lab/app.mjs is **owner-approved A–G on 2026-11-02 (no revisions requested)**. Any new or changed text remains **unapproved until separately confirmed**. 
No generated or invented promotional copy may be reused automatically.
A copy approval review must include:
- Page title and description, visible headings, navigation, buttons, error messages and prompts.
- Alt texts, ARIA labels, accessible instructions, privacy disclosures and consent text.
- Any labels for conceptual graphics and real product representations.
- Prompts delivered to the visitor's AI. 
- External provider names and their links.

The existing official logo /assets/sgp-wordmark-v2.webp is reused without modification. 
Existing ERABU and MY JAZZ DAY names and URLs are referenced as site assets, not fabricated case studies.
Only real approved case assets may be represented as evidence. 
Concept graphics must remain marked as conceptual, or be replaced with evidence-backed material.

## MVP acceptance criteria

- Successful import of valid Web JSON and graceful rejection of malformed, malicious, or oversized JSON.
- ERABU seed is recognized but not silently transformed into SGP Web Taste.
- Unknown vs low-interest remains distinct; omitted fields never invent a preference.
- Confirmation is required before applying imported values; explicit choice required before saving.
- Reset and delete remove the saved profile and restore the shared default site.
- Identical Taste and focus result in identical order and composition.
- Explicit focus overrides inferred interests and never removes any exhibit.
- Works on desktop, touch mobile and keyboard-only navigation; reduced-motion supported.
- Zero external network calls containing visitor Taste; no automatic external AI access.
- Existing /, /brand/, /contact/ and legacy SEO URLs unaffected.
- Copy approval A–G is recorded in taste/copy-review.json. All changes to user-facing text after this snapshot require a new owner review; linking /taste-lab/ or replacing / additionally requires visual QA and approved real content evidence.
- Synthetic unit tests run through npm run test:taste, and existing checks through npm test where feasible.
- Visual testing at widths 320, 390, 768, 1280, and 1565 with actual browser prior to publishing.
- Real ERABU captures and source-backed system details replace any placeholder conceptual diagrams.

## ERABU handoff boundary

Current ERABU source includes:
- src/lib/taste/types.ts: 12 axes and contexts.
- src/lib/taste/ai-seed.ts: erabu-ai-taste-seed@1 import/prompt.
- src/lib/taste/profile.ts: browser-local Taste Passport with declared/learned separation.
- src/app/me/taste-passport/page.tsx: optional taste editing route.

This branch does not modify ERABU and does not automatically write to its localStorage. 
Cross-origin read/write is not available. A future handoff must require explicit user-initiated export/import or a consented, audited bridge.

## Known limitations

- Verified 2026-11-02 live ERABU homepage screenshot, original source map, official logo asset and source-linked architecture are present. The high-level system architecture drawing remains explicitly marked CONCEPT, not an exact deployed topology.
- Real headless Chrome QA has passed at 320, 390, 768, 1280 and 1565px, covering images, overflow, focus/keyboard, reduced-motion, import, consent, reset and no third-party requests containing Taste. No external Netlify preview deploy was needed.
- The approved Taste label is linked from the existing homepage in desktop and mobile navigation. The adaptive page is still noindex; the existing SEO/services homepage remains unchanged otherwise.
- Import is handoff via copy/paste or a local file; no connected AI account is accessed.
- It is a prototype, not a commercial generalized SaaS or production-grade account system.

## Recorded decision (2026-11-02 JST)

The site owner explicitly approved **all** seven groups in the in-chat review, with **no corrections**:

- A: header and hero / 11 items
- B: Taste user interface / 30 items
- C: exhibits and footer / 23 items
- D: states and errors / 28 items
- E: accessibility / 14 items
- F: external-AI prompt / 9 items
- G: names and technical vocabulary / 13 items

The JSON manifest is the approved-copy source of truth. The exact current HTML text, accessible labels, AI prompt paragraphs, JS status and error messages, editor labels and placeholders are now enforced through `taste/preflight.test.mjs` so an accidental new phrase fails CI.

The previously approved string "プレビュー / 未承認文言" was intentionally removed after it became factually false. Other existing visible labels retain the approved versions.

**The A–G decision alone authorized only copy.** The owner's later request to complete remaining implementation triggered source-asset verification, real-browser QA and the staged opt-in Taste navigation. No approval is inferred for a wholesale replacement of `/` or cross-origin auto-import.

## Staged launch acceptance (2026-11-02)

- Copy: approved A–G, recorded in taste/copy-review.json, guarded by snapshots.
- Media: verified ERABU live screenshot captured with headless Chrome, source copied SVG map and official product logo; see docs/taste-evidence.md.
- Browser: 5 viewport sizes passed; screenshots uploaded by GitHub Actions.
- Interaction: invalid JSON, AI import, consent, deterministic ranking, focus override, optional storage, reset/delete, keyboard and reduced motion all passed.
- Privacy: browser-request audit found no external requests during the Taste flow. External AI providers are links opened only on user action.
- Launch shape: keep / with its SEO anchors and service links. Publish /taste-lab/ as noindex, linked as Taste in desktop and mobile navigation.
- Out of scope: replacing / entirely, direct connector-based AI memory extraction, production Taste Passport bridge, full authenticated account product, claims about conceptual system art as deployed screenshots.

This is a functioning opt-in demonstration, not a claim to be an adaptive default for every visitor. Any later promotion to the root homepage needs its own content and SEO design review.
