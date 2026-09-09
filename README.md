# 合同会社SGP 公式サイト

合同会社SGP（Sakamoto Growth Partners）の静的HTMLサイトです。公式ドメインは `https://sakamoto-growth-partners.com/`、配信先はNetlifyの `sgp-sendai` サイトです。

## 開発コマンド

```powershell
npm run build
npm run check
npm test
npm run preview
```

`npm run build` はNEWS、INSIGHTS、トップページの最新コンテンツ、RSS、サイトマップ、共通ナビゲーションを生成します。`npm test` は生成後にSEO、構造化データ、内部リンク、Contact、Case Study、INSIGHTSをまとめて検証します。

## コンテンツ管理

### NEWS

- 通常記事: `news/news-data.mjs`
- 独自レイアウト記事: `news/news-extra-data.mjs`
- 生成処理: `scripts/generate-news.mjs`
- 公開URL: `/news/`、`/news/{slug}/`、`/news/feed.xml`

`renderMode: "custom"` のNEWSは一覧・RSS・サイトマップには含めますが、記事HTMLを再生成しません。

### 実務ノウハウ / INSIGHTS

- 記事・カテゴリ・著者データ: `insights/insights-data.mjs`
- 生成処理: `scripts/generate-insights.mjs`
- 専用CSS/JS: `insights/insights.css`、`insights/insights.js`
- 公開URL: `/insights/`、`/insights/{category}/`、`/insights/{slug}/`

記事は `status: "published"` の場合だけ一覧、カテゴリ、サイトマップ、本番HTMLへ出力されます。下書きは `status: "draft"` に設定します。ROIは実績ではなくモデルケースとして、仮定・計算式・非保証文を必ず明示します。

### 開発事例 / Case Study

- 一覧: `/case-studies/`
- MY JAZZ DAY: `/case-studies/my-jazz-day/`
- データ契約: `case-studies/case-study-data.mjs`
- 素材: `assets/case-studies/my-jazz-day/`

MY JAZZ DAYの数値は `2026-09-02 00:23 JST` 時点の公開情報を整理したデータスナップショットです。`1 MIN` は操作体験の設計目標であり実測実績ではありません。

## 計測

- GA4測定ID: `G-08TBS4LE54`
- Googleタグは各HTMLの `head` に手動設置
- 共通計測: `assets/site-analytics.js`
- LINE CTA: `assets/line-cta-tracking.js`
- 流入属性: `assets/lead-attribution.js`

主なイベント:

- `click_line_cta`
- `cta_click`
- `case_study_view` / `case_study_product_click` / `case_study_contact_click`
- `news_view` / `news_case_study_click` / `news_contact_click`
- `insight_view` / `insight_50_percent` / `insight_90_percent`
- `insight_cta_click` / `insight_related_article_click` / `insight_service_click`
- `diagnosis_click` / `contact_submit` / `generate_lead`

Contactでは `source`、`case`、`intent` を `lead_source`、`lead_case`、`lead_intent` としてNetlify Formsへ引き継ぎます。氏名、会社名、メール、電話番号、相談本文はGA4へ送信しません。

GA4確認手順:

1. GA4の「レポート」から「リアルタイム」を開く。
2. 対象ページを別タブで開き、ページビューを確認する。
3. LINE CTA、Case Study、INSIGHTS、Contactの対象操作を行う。
4. リアルタイムのイベント名とDebugViewでイベント・パラメータを確認する。
5. 管理画面で問い合わせに関する `contact_submit` と必要なCTAイベントをキーイベントに設定する。

## Search Console

DNS認証の登録状態はGoogle Search Console管理画面で確認します。meta認証を使う場合は各ページの `head` に `google-site-verification` を追加し、HTMLファイル認証を使う場合は発行された `googleXXXX.html` をリポジトリ直下へ配置します。認証コードが発行されるまでは仮値を公開しません。

## 本番サイト構成

本番に含める主なパス:

- `/about/`、`/naoya-sakamoto/`、`/services/`、`/faq/`
- `/cases/`、`/case-studies/`、`/contact/`、`/diagnosis/`
- `/senior-family-support/`、`/news/`、`/insights/`
- `assets/`、`netlify/functions/`、`robots.txt`、`sitemap.xml`、`_headers`

## Netlifyデプロイ

GitHubとの自動連携は設定されていません。`npm test` の後、静的ファイルとFunctionsを含むサイトルートをNetlifyへ手動デプロイします。DNS、カスタムドメイン、SSLは変更しません。

公開前確認:

1. `npm test` を成功させる。
2. `sitemap.xml` の全URL、canonical、robots、OGP、JSON-LDを確認する。
3. Draft deployへデプロイし、PC・タブレット・390pxの主要画面、Console、CTA、Contact送信を確認する。
4. 問題がない場合だけproduction deployを実行する。
5. 本番URLのHTTP 200、CSS/JS/画像、画像、フォームFunctionを再確認する。

現在のNetlify site ID: `2a45dabd-9519-466b-a66d-9589261e17a7`

Netlify access tokenなどの認証情報はREADMEやGitに保存しません。
