# SGP AI査定 v0.1

## Product thesis
相場検索ではなく、質屋・買取店・リユース事業者の「いくらまでなら仕入れてよいか」を標準化するDecision Engine。

v0.1は外部相場APIに依存せず、顧客が保有する過去取引CSVを使う。

## Decision pipeline
1. 商品特定: category / brand / model / condition
2. 比較成約抽出: category 0.14 + brand 0.24 + exact model 0.46 + token similarity
3. 状態補正: S 1.05 / A 1.00 / B 0.92 / C 0.82 / D 0.68 / JUNK 0.45
4. 鮮度補正: 365日half-lifeの指数減衰
5. 外れ値除去: MAD
6. 統計: weighted median / mean / P25 / P75
7. 信頼度: 件数 / 完全型番一致率 / 直近比率 / 価格分散
8. 仕入上限: 売却予想 - 手数料 - 送料 - 検品 - 目標粗利 - リスク引当 - 在庫コスト
9. BUY / REVIEW / PASS

## CSV
最低限 sale_price。推奨列:
- sold_at
- category
- brand
- model
- name
- condition
- acquisition_price
- sale_price
- days_to_sell

## Production data model
- tenants
- users
- products
- transaction_imports
- transactions
- appraisal_requests
- appraisal_results
- appraisal_comparables
- pricing_policies
- external_market_observations
- audit_logs

全テーブルはtenant_idで分離。顧客間データ共有はデフォルト禁止。匿名・集計学習を行う場合のみ契約で明示的opt-in。

## API
- POST /v1/imports/transactions
- POST /v1/products/identify
- POST /v1/appraisals
- GET /v1/appraisals/:id
- POST /v1/appraisals/:id/approve
- GET/PUT /v1/pricing-policy
- POST /v1/integrations/:provider/connect

## Vision v0.2
画像AIは候補生成のみ。
image -> structured candidates -> human confirmation -> deterministic pricing engine

抽出候補:
- category
- brand
- model candidates
- JAN/GTIN candidate
- visible damage flags
- accessories
- per-field confidence
- needs_human_review

真贋と最終買取価格をVisionモデル単独で確定しない。

## External market adapters
外部データは契約・API規約で許可されたものだけ使う。
- eBay Browse: 現在出品の探索・画像検索の補助
- connected seller transaction APIs: 接続した販売者自身の成約実績
- Yahoo!ショッピング: 対応する商品/ストア用途
- オークファン: 今回回答のとおり顧客向けプロダクト組込には利用しない

現在出品価格と実売価格は別の信号として保存し、混同しない。

## Safety gates
- 比較成約3件未満: provisional / REVIEW
- 5件以上を推奨
- confidence < 55: REVIEW
- exact-model share < 30%: 型番依存カテゴリではREVIEW
- IQR/median > 0.55: REVIEW
- 真贋懸念 / serial mismatch / severe damage: manager approval
- algorithm_version と pricing-policy snapshot を査定結果へ保存

## Pilot evaluation
1店舗・過去50〜100件でbacktest。

KPI:
- 実売価格MAPE
- 推奨仕入上限で目標粗利を割ったfalse BUY率
- 本来買えた案件を見送るfalse PASS率
- 査定時間
- 人間override率
- confidence calibration

Paid pilot gate案:
- exact model casesの70%以上で実売±12%
- false BUY <=10%
- median decision time <=90秒
- 査定担当のuseful評価 >=70%

## Commercial packaging
- PoC: データ監査 + 1カテゴリ + 50〜500件 + 精度レポート
- 本番: auth / tenant DB / CSV定期取込 / Vision / approval / audit
- 拡張: POS / LINE / marketplace adapter

価格はAPI原価ではなく、査定時間削減・教育コスト・高値掴み削減・粗利改善に紐づけて提案する。

## Branch scope
このブランチはブラウザだけで動くv0.1。実顧客データを入れる前にPII除去と契約条件を確認する。
