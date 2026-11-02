# SGP Product Studio — Corporate site redesign

Date: 2026-11-03  
Owner decision: **SGP is a technology company that plans, develops and operates its own products. ERABU is the flagship. Engineering is a secondary business.**

## Brand principles

- Let authentic software demonstrate product thinking, design and engineering.
- Keep the authorized SGP horizontal logo; keep ERABU's cream/green product palette inside its own displays.
- Do not imply a large team, multiple fictitious divisions, investment scale, users, revenue or undisclosed clients.
- Remove slogans that suggest a grand corporate mission from the homepage, not because earlier ideas were necessarily false but because they distract from what a small owner-led company actually builds.
- Purpose/MVV legacy content remains at its original URLs for pre-existing links and SEO; it is not a homepage marketing pillar or a mandatory first-run message.
- Keep actual company information factual: 合同会社SGP, founded 2026, product planning/development/operations and software/AI engineering.
- Engineering is a **business label**, not a claim that a legally separate subsidiary, large team or established department exists.

## Information architecture

- `/`: editorial ERABU-first homepage; short Company facts.
- `/products/`: actual current product catalog (ERABU; MY JAZZ DAY shown as developed work, not falsely as an independent paid flagship).
- `/products/erabu/`: ERABU monograph, live screen, three scopes, verified source map, MY JAZZ DAY.
- `/engineering/`: service areas; clearly separated SGP product work vs founder's prior engineering experience.
- `/contact/`: unchanged lead capture.
- Older `/brand/`, `/mvv/`, `/career/`, `/case-studies/` and service pages remain accessible at original canonical URLs.

The homepage keeps legacy in-page fragment IDs (`#products`, `#works`, `#technology`, `#about`, `#company`, `#founder`, `#services`, `#industries`, `#pricing`, `#faq`) to avoid breaking old external links. Deprecated fragment anchors are compatibility targets, not claims that obsolete content still exists.

## Actual evidence used

- `assets/sgp-wordmark-v2.webp`: existing official corporate wordmark.
- `assets/erabu/source/erabu-live-home-20261102.jpg`: actual deployed ERABU website captured 2026-11-02; avoid misrepresenting as a real-time embedded demo.
- `assets/erabu/source/sendai-ekimae-erabu-map.svg`: ERABU source project editorial map, shown at natural aspect ratio.
- `assets/case-studies/my-jazz-day/hero-mobile.webp` and `jazz-map.webp`: existing corporate case media.
- `https://sendai-erabu.jp/`: actual live product; separate domain.
- Existing engineering profile at `/career/`. Distinct from SGP corporate contracts.

## Experience, design and accessibility

- Product Monograph + Engineering Studio: asymmetrical editorial composition rather than the repeated generic two-card layout.
- The photographed product UI is an actual screenshot in an intrinsic-ratio `img`, never an `object-fit:cover` background. Clicking it opens the unmodified full image.
- Three tabs offer visibly different informational content: Experience (real editorial map / 3-choice explanation), Technology (clearly labeled conceptual Decision OS), Development (real MY JAZZ DAY case). Not another Taste-based reordering experiment.
- The tab interface follows WAI-ARIA tab semantics with Left/Right/Home/End keyboard support and hidden inactive panels.
- Responsive design for 320, 390, 768, 1280 and 1565px; screenshot QA mandatory; prefers-reduced-motion honored.
- New site does not ask for AI accounts, browser history, location or Taste profiles.
- SGP and ERABU logos and media remain original. No invented photos, metrics or fictitious technical screenshots.

## Text governance

The owner's prior prohibition on new unapproved brand slogans remains a design constraint. This rebuild uses the owner's new concrete formulation and existing public product terminology/factual corporate descriptions. Do not auto-generate promotional copy at runtime. Do not introduce synthetic user metrics, social proof or made-up strategic claims. If future new promotional wording is wanted, it requires its own owner review.

## Release gates

1. `npm run build`, `npm run check`, `npm run test:taste`, `npm run test:browser`.
2. Every new route has exactly one H1, correct canonical/OG/schema and links resolving to actual files.
3. `/taste-lab/` and the retired Taste runtime stay excluded and HTTP 404 in production.
4. ERABU original image assets are included in deploy artifact; no crop or stretched display.
5. Existing contact, company information, legacy career/case-study paths continue to return 200.
6. GitHub Pages production smoke checks the new routes after every deployment.

No code should change ERABU's own live application. Only SGP corporate site is modified.
