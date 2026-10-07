# 鶴亀屋グループ通信 LINE定期配信

LINE公式アカウント（Messaging API）から「鶴亀屋グループ通信」を定期配信するための管理サービスです。

## Safe default

- 配信曜日: 月〜金
- 配信時刻: 11:45 Asia/Tokyo
- 配信前承認: 必須
- Channel Access Token / Channel Secret / 配信先が揃わない限り送信しない
- 同一日付の送信済みdraftは再送しない
- Webhook署名をHMAC-SHA256で検証

## 管理画面

管理画面で以下を行えます。

1. 当日の本文入力
2. 下書き保存
3. 完成メッセージのプレビュー
4. 承認
5. 今すぐ送信
6. 当日スキップ
7. 曜日・時刻・承認必須の設定
8. Webhookで捕捉したgroup/user/roomから配信先を選択

## 必須環境変数

Webサービス:

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `DATA_DIR=/data`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_CRON_SECRET`
- `LINE_TARGET_ID` は任意（通常はWebhook捕捉→管理画面選択）

cron runner:

- `LINE_BOT_URL`
- `LINE_CRON_SECRET`

## LINE Developers

Webhook URL:

`https://tsurukame-line-bot.up.railway.app/api/line/webhook`

Webhookを有効化し、グループ配信する場合はLINE公式アカウントを対象グループへ参加させます。
グループ内でイベントが発生すると `groupId` を安全に保存し、管理画面から配信先として選択できます。

## Scheduler

Railway cron runnerは5分おきに `POST /api/line/cron` を呼びます。
実際に送信するかどうかはWebサービス側でJSTの曜日・設定時刻・承認状態・送信済み状態を判定します。

## Persistence

SQLiteはRailway Volumeの `/data/line_bot.sqlite3` に保存します。
