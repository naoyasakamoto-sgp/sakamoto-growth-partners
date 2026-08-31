# SGP Homepage Redesign

## 内容
- `index.html`: トップページ本体
- `styles.css`: デザイン一式
- `script.js`: モバイルメニュー・スクロールアニメーション
- `news/news-data.mjs`: NEWS記事の単一データソース
- `scripts/generate-news.mjs`: NEWS一覧・記事・トップ最新3件・sitemap・RSSの生成
- `scripts/check-site.mjs`: NEWSのHTML・SEO・Schema・内部リンク検証

## NEWSの更新

NEWSは `news/news-data.mjs` をSource of Truthとして管理します。記事追加後に以下を実行すると、`/news/`、各記事、トップページの最新3件、`sitemap.xml`、`news/feed.xml`が更新されます。

```powershell
npm run build
npm run check
```

生成済みHTMLを直接編集せず、記事本文・日付・カテゴリ・関連リンクはデータファイルで更新してください。

公開URL:

- `/news/`
- `/news/{slug}/`
- `/news/feed.xml`

## デザイン方針
- 直前のビジュアル案をベースに、ダークアジュール × ターコイズ × 白背景で構成
- 守を固めるため、料金目安・支援の流れ・相談しやすさ・誤情報のない強み表現を追加
- 実績数字は入れず、「代表個人としての経験を含む」と明記
- ダッシュボードは実績ではなく「イメージ」と明記

## 反映する場合
既存サイトのトップページとして使う場合は、`index.html` / `styles.css` / `script.js` を同じディレクトリに配置してください。

## Codex用指示文
以下をCodexに貼り付けてください。

---
現在の `https://sakamoto-growth-partners.com/` のトップページを、添付の `index.html` `styles.css` `script.js` の内容をベースに全面リデザインしてください。
要件:
1. 既存サイトの会社情報・メールアドレス・代表名・設立日・事業内容は維持する。
2. デザインはダークアジュール、ターコイズ、白背景を基調にし、ファーストビューは高級感のあるBtoBサイトにする。
3. 「Web集客・業務改善・AI活用で、売上と生産性を一緒に上げていきます。」をメインコピーにする。
4. 誤認リスクのある実績数字は入れない。
5. 「会社設立前の代表者個人としての経験を含みます。守秘義務に配慮し、内容を一部抽象化しています。」という注記を残す。
6. ダッシュボードや数値表示は実績ではなく「イメージ」と明記する。
7. 料金は「目安」として表示し、税別・内容により変動する注記を入れる。
8. モバイル表示でナビゲーション・カード・CTAが崩れないようにする。
9. LighthouseでSEO・アクセシビリティ・パフォーマンスを大きく落とさない。
10. 本番反映前に、メールリンクとCTAのリンク先を確認する。
---

## 画像アセットについて

既存公開ページから以下を取得し、`assets/` に格納しています。

- SGPロゴ：`assets/sgp-wordmark.webp`
- SGPロゴ縦版：`assets/sgp-stack.webp`
- 仙台拠点写真：`assets/sendai-office.webp`

代表顔写真は、公開ページ上で確認できなかったため未同梱です。代表写真を追加する場合は、`assets/founder-naoya-sakamoto.webp` などの名前で配置し、`#founder` セクションの画像パスを差し替えてください。
