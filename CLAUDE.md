# Sales Dashboard Dynamic

営業KPIダッシュボード。GAS API経由でTurso DBのデータを取得し、HTMLダッシュボードで可視化する。
概要・分析タブも案件管理タブも全てTurso DB（performance_rawdata, targets, deals等）がデータソース。

## プロジェクト構成

```
sales_dashboard_dynamic/
├── index.html          # ダッシュボードHTML構造
├── style.css           # CSS
├── app.js              # JavaScript
├── deploy.sh           # UI更新スクリプト（3ファイルコピー）
├── gas/
│   └── Code.js         # GAS APIコード（参照用、GASエディタへ手動コピー）
```

## デプロイ方法

### UI変更時
```bash
./deploy.sh
```
index.html, style.css, app.js を `/Users/ebineryota/` にコピーする。

### GAS変更時
1. GASエディタを開く
2. `gas/Code.js` の内容をコピー＆ペースト
3. **デプロイ → デプロイを管理 → 鉛筆アイコン → バージョン「新バージョン」→ デプロイ**
   - ※「新しいデプロイ」だとURLが変わるので注意

### ブラウザで確認
```
file:///Users/ebineryota/sales_dashboard_dynamic.html
```

## API URL

- **GAS Web App**: `https://script.google.com/macros/s/AKfycbwG_1cvgfnnNuK9PuhmXJOSeBuS8kFzJbf-R1p0qvySu0BW8GYKJKCKzHJ4Ny11FtkV/exec`
- ※「新しいデプロイ」をするとURLが変わるので注意。「デプロイを管理」から既存デプロイを更新すること。

## データソース

### スプレッドシート（月次同期機能でのみ使用）
- **ID**: `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM`
- **シート**: 月次ビュー, 実績rawdata, 目論見入力, マスタ
- ※ダッシュボードAPI（monthly/rawdata）はTurso経由に移行済み。スプレッドシートはsyncMonthlyView()でのみ使用

### Turso DB（全タブ共通データソース）
- **URL**: `https://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io`
- **テーブル**:
  - `deals` — 案件データ（amount単一カラム、フェーズで受注/パイプライン分類）
  - `members` — 担当者マスタ
  - `projects` — 案件（架電）マスタ
  - `targets` — 月次目標（担当者×案件×月）
  - `settings` — KV設定（`sales_target_YYYY-MM`で月別売上目標を保存）
  - `performance_rawdata` — 実績rawdata（架電数、PR数、アポ数等）
  - `member_name_aliases` — member_nameの揺れを正規化するマッピング
- **GAS APIタイプ**: `monthly`, `rawdata`, `pipeline_v2`, `deals`, `members`, `projects`, `sales_targets`
- **GAS POSTタイプ**: `deal_upsert`, `deal_delete`, `sales_targets_save`

## 機能構成

### 概要タブ
- 売上目標カード、標準進捗トグル（前日/本日/明日）
- 担当者カード（進捗バー + 乖離表示）
- 案件別・個人別グラフ（架電 vs アポ進捗、ランキング）

### 分析タブ
- フィルター（案件・担当者・期間）
- 数値KPI、率指標
- 日次推移グラフ（前月比較機能付き）

### 案件管理タブ
- **目標対進捗**（上部）: 月別サマリーカード + テーブル（Q単位表示: 3-6月, 7-9月...）
- **受注案件**（中段）: フェーズ「受注」の案件一覧。金額積み上げが売上実績
- **パイプライン**（下段）: 未受注案件（提案前/提案済み/見積もり提出済み/保留）。金額×確度=見込
- 全案件に対して追加・編集・削除フォーム

### 設定タブ
- 月別売上目標の設定（Q単位で表示、settingsテーブルに保存）

## 案件フェーズと分類

| フェーズ | 分類 | 表示セクション |
|---------|------|---------------|
| 受注 | 売上実績 | 受注案件 |
| 提案前 / 提案済み / 見積もり提出済み / 保留 | パイプライン | パイプライン |
| 失注 | 除外 | 非表示 |

## deals テーブル主要カラム

`id, deal_name, company_name, owner, project_name, phase, deal_type, amount, probability, expected_start_date, next_action, action_deadline, memo`

- `amount`: 金額（単一、Max/Minなし）
- `probability`: 確度（0.0〜1.0）
- `action_deadline`: 次アクション日

## 注意事項

- UI変更後は `./deploy.sh` を実行
- ブラウザキャッシュ: `Cmd+Shift+R` でハードリロード
- キャッシュクリア: `localStorage.clear(); location.reload();`
- Turso DBマイグレーション: `/Users/ebineryota/code/all_staff_analysis/turso/` にスクリプトあり
