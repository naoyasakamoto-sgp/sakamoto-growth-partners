# Case Study / Lead Analytics Specification

## Principle

`analytics.js` sends no GA4 Measurement ID by itself. It writes structured events to `dataLayer` and, when an existing `gtag` is available, forwards the same event to GA4. This prevents hard-coding an unknown production Measurement ID.

## SGP website events

- `case_study_view`: `case_id`, `case_slug`, `case_title`
- `case_study_product_click`: `case_id`, `case_slug`, `destination`, `cta_location`
- `case_study_contact_click`: `case_id`, `case_slug`, `cta_location`, `intent`
- `case_study_related_click`: `case_id`, `target_case_id`
- `news_view`: `news_slug`, `category`
- `news_case_study_click`: `news_slug`, `case_id`
- `news_contact_click`: `news_slug`, `case_id`
- `contact_submit`: `lead_source`, `lead_case`, `lead_intent`

## GA4 custom dimensions to create after deployment

Check Admin > Data display > Custom definitions first and do not create duplicates.

Recommended event-scoped dimensions:

- `case_id`
- `case_slug`
- `cta_location`
- `lead_source`
- `lead_case`
- `lead_intent`

## Sendai Erabu product events

Keep existing names where already deployed. Target model:

- `navigator_start`
- `navigator_answer`
- `navigator_complete`
- `recommendation_generated`
- `recommendation_saved`
- `recommendation_regenerated`
- `map_open`
- `venue_open`
- `experience_feedback`

Do not send a person's full Taste Profile or PII to GA4. Browser-local Taste Profile storage remains the default. Aggregated categories, context, place IDs, result counts, rating categories and reason codes are acceptable when they cannot identify a person.
