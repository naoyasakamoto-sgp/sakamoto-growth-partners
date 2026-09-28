# SGP SEO Topic Map — 2026-09-29

## Objective

SGPの検索上の中心テーマを「仙台・宮城の中小企業IT支援」に置き、その中で最も商談意図が強い
「仙台の社外IT担当 / IT顧問」を `/services/it-adviser/` の単一Pillar URLへ集約する。

同一キーワードを複数URLで奪い合うのではなく、検索意図ごとに1つの主URLを決め、
実務ガイド・業種別LPからPillarへ内部リンクする。

## URL ownership

| URL | Primary intent | Role |
| --- | --- | --- |
| `/` | 仙台 中小企業 IT支援 / 合同会社SGP | Corporate hub |
| `/services/it-adviser/` | 仙台 社外IT担当 / 仙台 IT顧問 | Commercial pillar |
| `/guides/sendai-outsourced-it-guide/` | 社外IT担当とは / 宮城 社外IT担当 | Informational entry |
| `/guides/it-adviser-pricing/` | IT顧問 料金 / 社外IT担当 費用 | Price consideration |
| `/guides/hire-vs-outsource-it/` | IT担当 採用 外注 | Alternative comparison |
| `/guides/no-it-staff-checklist/` | IT担当者がいない / 中小企業 IT管理 | Problem awareness |
| `/guides/it-adviser-vs-consulting/` | IT顧問とは / ITコンサル 違い | Category education |
| `/guides/choose-it-support-sendai/` | 仙台 IT支援会社 選び方 | Vendor consideration |
| `/guides/excel-line-paper-workflow/` | Excel 業務改善 / LINE 案件管理 | Pain-point search |
| `/guides/sendai-construction-dx/` | 仙台 建設 DX / 設備工事 業務効率化 | Vertical informational |
| `/guides/small-business-generative-ai/` | 中小企業 生成AI導入 / 仙台 AI活用 | AI informational |
| `/guides/why-it-adviser-10000-yen/` | 社外IT担当 1万円 / IT顧問 安い | Price objection |
| `/industries/construction/` | 仙台 建設・設備工事 IT/DX | Vertical commercial |
| `/industries/electrical/` | 仙台 電気工事 業務効率化 | Vertical commercial |
| `/industries/exterior/` | 仙台 外構 DX / 顧客管理 | Vertical commercial |
| `/industries/hvac/` | 仙台 空調設備 IT / 業務改善 | Vertical commercial |
| `/industries/remodeling/` | 仙台 リフォーム DX / IT支援 | Vertical commercial |

## Internal-link model

```
                           /
                           |
               /services/it-adviser/
                    (commercial pillar)
                   /        |        \
             guides      industries   cases
             /  |  \       / |  \      |
     price / hire / FAQ  trade LPs   evidence
             \  |  /       \ |  /
               -----> pillar <-----
```

Rules:

1. 「仙台 社外IT担当」「仙台 IT顧問」の最終CV先は原則 `/services/it-adviser/`。
2. 実務ガイドは情報検索を満たした上でPillarへ自然に送る。
3. 業種LPは業種固有の課題を扱い、一般論はガイドへリンクする。
4. トップページは会社全体の「IT支援・業務改善」を担当し、社外IT担当のExact-Match titleを持たせない。
5. 同じPrimary intentの新規URLを増やす前に、この表を更新する。
6. 実績値・顧客名・成果値は公開許諾と検証がない限り記載しない。

## Content quality / E-E-A-T backlog

P0:
- 公開許諾が取れた法人Case Studyを1件追加する。
- Search Consoleで `/services/it-adviser/` のquery / impressions / CTR / average positionを週次確認する。
- 「仙台 社外IT担当」「仙台 IT顧問」でトップとPillarのカニバリが残っていないか確認する。

P1:
- 各ガイドに実際の画面・チェックリスト・テンプレート等の一次情報を追加する。
- 既存顧客の匿名化事例を、Before / Intervention / After / Measurementで蓄積する。
- 建設・設備工事系LPの問い合わせデータを見て、電気・空調・外構の優先順位を更新する。

P2:
- AI Overviews / LLM検索で引用されやすいよう、定義、比較表、FAQ、短い結論を継続整備する。
- 被リンク目的の調査データや地域一次データを公開する。

## Measurement

Primary:
- Organic clicks to `/services/it-adviser/`
- Organic leads with `source` / `intent`
- Non-brand impressions for 社外IT担当 / IT顧問 / IT担当不在 / 業種DX clusters

Secondary:
- Guide -> Pillar click-through rate
- Pillar -> free consultation conversion rate
- Indexed guide / industry URLs
- Queries where multiple SGP URLs appear for the same intent

SEOの成果判定は順位単体ではなく、非指名流入 → Pillar到達 → 問い合わせまでで見る。
