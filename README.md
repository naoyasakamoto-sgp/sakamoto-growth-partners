# SGP Homepage / News / Case Study

合同会社SGPの静的コーポレートサイトです。既存のHTML/CSS/JavaScript構成を維持しながら、NEWSとCase Studyを営業資産として運用できるようにしています。

## 主な構成

- `index.html`: トップページ
- `styles.css`: 既存デザイン
- `script.js`: モバイルメニュー・スクロールアニメーション
- `analytics.js`: GA4/GTM互換のイベント送信層。Measurement IDはハードコードしない
- `news/news-data.mjs`: 既存NEWSのSource of Truth
- `news/news-extra-data.mjs`: Case Study等の拡張NEWSデータ
- `scripts/generate-news.mjs`: NEWS一覧・記事・トップ最新3件・sitemap・RSS・Case Study導線の生成
- `scripts/check-site.mjs`: 既存NEWS/SEO/内部リンク検証
- `scripts/check-case-studies.mjs`: Case Study/SEO/Analytics/CTA/Contact検証
- `case-studies/`: 開発事例
- `content/case-studies/`: MDX互換のコンテンツ契約とschema
- `contact/`: Case Study起点の問い合わせ導線
- `docs/analytics.md`: GA4イベント・カスタムディメンション仕様

## 公開URL

- `/news/`
- `/news/{slug}/`
- `/case-studies/`
- `/case-studies/my-jazz-day/`
- `/contact/`

## Build / Check

```bash
npm run build
npm run check
npm test
```

`npm run build` はNEWS一覧・RSS・sitemap・トップページの最新NEWSを再生成します。`MY JAZZ DAY` のNEWSは `renderMode: "custom"` のため、専用の静的記事を保持しつつ一覧・RSS・sitemapにはSource of Truthから参加します。

## Case Study #001 — MY JAZZ DAY

`仙台えらぶ！` で開発した、897の演奏枠・50会場の公開情報から、普段の音楽嗜好、当日の気分、利用可能時間、開始エリア、歩行量、新しい音との距離を使って一日の鑑賞プランを組み立てるプロダクトを開発事例化しています。

2026-09-02 00:23 JSTのデータスナップショットを表示し、主催者の公式サービスではないことを明示しています。

### MDXについて

現行サイトは依存関係を増やさない静的HTML構成です。そのためMDXランタイム/コンパイラは追加せず、`content/case-studies/my-jazz-day.mdx` と `content/case-studies/schema.mjs` を将来のCMS/Next.js移行にも使えるContent Contractとして追加しています。公開HTMLは現在の静的アーキテクチャに合わせてコミットします。

## Analytics

`analytics.js` はイベント名・パラメータを統一します。GA4 Measurement IDはリポジトリ上で推測・新規発行せず、本番側の既存設定に接続してください。

主なイベント:

- `case_study_view`
- `case_study_product_click`
- `case_study_contact_click`
- `news_view`
- `news_case_study_click`
- `news_contact_click`
- `contact_submit`

詳細は `docs/analytics.md` を参照してください。

## デザイン方針

- 既存のダークアジュール × ターコイズ × 白背景を維持
- Case Studyは editorial / technical / restrained / premium を重視
- 実画面、数字、図解、余白を主役にする
- 誤認リスクのある「公式」「公認」「提携」「世界初」等は使用しない
- Case Studyの897/50はデータスナップショット日時とセットで扱う
- 代表者個人の経験とSGP法人実績は混同しない

## 画像アセット

既存:

- `assets/sgp-wordmark.webp`
- `assets/sgp-stack.webp`
- `assets/sendai-office.webp`

MY JAZZ DAY Case Study:

- `assets/case-studies/my-jazz-day/hero-mobile.webp`
- `assets/case-studies/my-jazz-day/why-festival.webp`
- `assets/case-studies/my-jazz-day/pwa-navigator.webp`
- `assets/case-studies/my-jazz-day/jazz-map.webp`
- `assets/case-studies/my-jazz-day/question-taste.webp`
- `assets/case-studies/my-jazz-day/question-time-area.webp`
- `assets/case-studies/my-jazz-day/area-options.webp`
- `assets/case-studies/my-jazz-day/area-options-more.webp`
- `assets/case-studies/my-jazz-day/discovery-submit.webp`
- `assets/case-studies/my-jazz-day/og-my-jazz-day.webp`

## Definition of Done

- build success
- check/test success
- mobile/desktopで横スクロールやCTA崩れがない
- canonical/metadata/JSON-LD/sitemapを確認
- Analyticsのイベント名・パラメータを確認
- Case Study → Product / Contact、NEWS → Case Study の内部リンクを確認
- 既存ページの回帰を確認
