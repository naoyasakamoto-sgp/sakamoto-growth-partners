# ERABU Exhibition evidence — SGP Taste Adaptive Web

Sources were inspected in `naoyasakamoto-sgp/sendai-erabu` on 2026-11-02. No generated or fictional product screenshot is presented as real. Source path and blob SHA are recorded so each exhibit can be audited.

| SGP display | Real source | GitHub source blob SHA | Treatment |
| --- | --- | --- | --- |
| `assets/erabu/source/erabu-live-home-20261102.jpg` | Actual public `https://sendai-erabu.jp/` homepage captured by headless Chrome on 2026-11-02 (browser navigation resolved to the live query form) | `ceeaa1c5c0f6cf764d3d4779d98cbb89b2e8749e` | Real live UI screenshot, from GitHub Actions validation run `41426452657`; not a fabricated interface. |
| `assets/erabu/source/sendai-erabu-main.svg` | `sendai-erabu/public/assets/svg/logo/sendai-erabu-main.svg` | `f4d848e60ddb99e9b78b60d5e007b7805406eca2` | Official source product branding, copied intact. |
| `assets/erabu/source/sendai-ekimae-erabu-map.svg` | `sendai-erabu/public/assets/images/special/sendai-ekimae-erabu-map.svg` | `d87efa45e9a470afa313d420b2e28c6dee45f600` | Existing editorial street-walk concept map, **actual ERABU project asset**, not a claim to be a street survey. |
| `assets/case-studies/my-jazz-day/hero-mobile.webp` | Existing SGP case-study media in SGP repository | Existing SGP asset | Existing real project artwork. |
| `ERABU / System` | `sendai-erabu/src/components/erabu/ErabuScopeHome.tsx` | Live source link in preview | UI layer, verified source. |
| `ERABU / System` | `sendai-erabu/src/lib/cities/decision-engine.ts` | Live source link in preview | Decision/ranking engine, verified source. |
| `ERABU / System` | `sendai-erabu/src/lib/cities/registry.ts` | Live source link in preview | City data registry, verified source. |
| `ERABU / System` | `sendai-erabu/docs/erabu-live-platform.md` | Live source link in preview | Cloudflare platform description, verified source. |

## Meaning of the remaining CONCEPT indicator

The four-layer system visualization is an **interpretive layout** of verified UI, decision, data and infrastructure sources, not a screenshot of actual deployed infrastructure or a complete dependency graph. It deliberately retains the owner's approved `CONCEPT` label and explanation.

The design/process exhibit now displays the *actual original editorial map*, removing a fabricated sheet-of-paper mock illustration and the claim that the artwork is not a real project asset. The map itself is a documented conceptual street map; it must not be sold as a geographically authoritative navigation map.

The live product card displays a real screenshot captured from the deployed ERABU homepage and links to the public product. It is **not** a working embedded app and the photograph is a dated snapshot; the destination link opens the current live version. The official source logo is preserved in the asset catalog but the actual UI screenshot now leads the exhibit.

## Release constraint

No new marketing text was added to the preview. It reuses labels approved in the owner's A–G decision, and removed two inaccurate or obsolete placeholder labels. The approved-copy CI snapshot must reflect exact text removed and unchanged strings reused. Any new wording is a separate approval request. Do not merge just because the media comes from a repository; the preview still needs actual visual and interaction QA.
