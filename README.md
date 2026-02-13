# 稼働報酬チーム営業KPI確認シート

DigiManブランドの営業KPIダッシュボード。Google スプレッドシートの「月次ビュー」データをリアルタイムで可視化します。

## 概要

スプレッドシートの月次ビューデータを取得し、担当者別の架電進捗・アポ進捗を確認できるBIツール風ダッシュボードです。

## 機能

- **KPIサマリー表示**: 標準進捗、架電進捗、アポ進捗、進捗差分
- **進捗分析**: 全体状況、達成/未達人数、トップパフォーマー、要フォロー者
- **フィルタリング**: 案件別・担当者別でデータ絞り込み
- **担当者カード**: 個人別の詳細進捗（架電数、アポ数、転換率）
- **グラフ表示**:
  - 架電進捗 vs アポ進捗（標準進捗ライン付き）
  - 架電進捗率ランキング
  - アポ進捗率ランキング

## 技術構成

```
sales_dashboard_dynamic/
├── index.html          # メインダッシュボード（HTML/CSS/JavaScript）
├── gas/
│   ├── Code.js         # Google Apps Script APIコード
│   └── appsscript.json # GAS設定ファイル
└── README.md           # このファイル
```

### フロントエンド
- **HTML/CSS/JavaScript**: シングルファイル構成
- **Chart.js**: グラフ描画ライブラリ
- **chartjs-plugin-annotation**: 標準進捗ライン表示用

### バックエンド
- **Google Apps Script**: スプレッドシートデータをJSON APIとして提供
- **Web App**: 匿名アクセス可能なHTTP GET API

## 接続情報

### スプレッドシート
- **Spreadsheet ID**: `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM`
- **シート名**: `月次ビュー`

### GAS Web App API
- **URL**: `https://script.google.com/macros/s/AKfycbz1ZDCczUFxuSL0mjHq_VTFotjst_vZssGJPIizQ3XALil5ekqq7-SJkjPcqBFyN2V28g/exec`
- **メソッド**: GET
- **レスポンス**: JSON

## セットアップ手順

### 1. Google Apps Script のデプロイ

1. Google スプレッドシートを開く
2. **拡張機能 > Apps Script** を選択
3. `gas/Code.js` の内容をエディタにコピー&ペースト
4. **デプロイ > 新しいデプロイ**
5. 種類: **ウェブアプリ** を選択
6. 設定:
   - 説明: 任意
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
7. **デプロイ** をクリック
8. 生成されたURLをコピー

### 2. ダッシュボードの設定

1. `index.html` を開く
2. `DEFAULT_API_URL` を新しいデプロイURLに更新（必要な場合）
3. ブラウザで `index.html` を開く

### 3. clasp を使ったデプロイ（オプション）

```bash
# clasp インストール
npm install -g @google/clasp

# ログイン
clasp login

# プロジェクト作成（スプレッドシートに紐付け）
clasp create --type webapp --parentId <SPREADSHEET_ID>

# コードをプッシュ
clasp push

# デプロイ
clasp deploy
```

## API レスポンス形式

```json
{
  "metadata": {
    "lastUpdated": "2026-02-13T06:00:00.000Z",
    "sheetName": "月次ビュー",
    "standardProgress": 50,
    "elapsedDays": 10,
    "totalDays": 20,
    "backTarget": 1.5
  },
  "summary": {
    "totalSales": 0,
    "extendedTotalSales": 0,
    "totalCalls": 1500,
    "targetCalls": 3000,
    "totalAppointments": 30,
    "targetAppointments": 60,
    "callProgressRate": 50,
    "appointmentProgressRate": 50
  },
  "members": [
    {
      "name": "担当者名",
      "fullName": "@担当者名/English Name",
      "project": "案件名",
      "callPace": 100,
      "appointmentPace": 100,
      "sales": 0,
      "targetCalls": 300,
      "actualCalls": 150,
      "callProgress": 50,
      "targetAppointments": 6,
      "actualAppointments": 3,
      "appointmentProgress": 50,
      "actualPR": 0,
      "callsPerHourTarget": 20,
      "callsPerHourActual": 18,
      "callToAppointmentTarget": 2,
      "callToAppointmentActual": 2,
      "callToAnswer": 30,
      "answerToAppointment": 6.67,
      "workHoursTarget": 15,
      "workHoursActual": 8.3
    }
  ]
}
```

## デザイン

### DigiMan ブランドカラー
- **Primary Blue**: `#1A56DB`
- **Dark Navy**: `#0F2444`
- **Logo Gray**: `#5A6A7A`
- **Success**: `#10B981`
- **Warning**: `#F59E0B`
- **Danger**: `#EF4444`

### 進捗判定基準
- **順調（緑）**: 進捗率 >= 標準進捗
- **要注意（黄）**: 進捗率 >= 標準進捗 × 0.8
- **遅延（赤）**: 進捗率 < 標準進捗 × 0.8

## 注意事項

- GASのデプロイURLは再デプロイ時に変更される場合があります
- スプレッドシートの構造変更時はGASコードの修正が必要です
- APIは匿名アクセス可能なため、機密データには注意してください

## 更新履歴

- 2026-02-13: 初版作成
  - 基本ダッシュボード機能実装
  - DigiManブランドデザイン適用
  - 案件別・担当者別フィルター機能追加
  - 担当者名に案件名表示（同名者区別用）
