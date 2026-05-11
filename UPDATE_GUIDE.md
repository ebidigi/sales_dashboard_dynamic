# 営業KPIダッシュボード 更新手順ガイド

このダッシュボードの修正・デプロイ手順をまとめたものです。

---

## 1. 初回セットアップ

### 1-1. GitHub招待の承諾
1. GitHubの通知またはメールから招待を承諾
2. 招待URL: https://github.com/ebidigi/sales_dashboard_dynamic/invitations

### 1-2. リポジトリのクローン
```bash
git clone https://github.com/ebidigi/sales_dashboard_dynamic.git
cd sales_dashboard_dynamic
```

### 1-3. 必要なアクセス権の確認
作業前に以下のアクセス権が付与されているか確認してください。
- **GitHub**: `ebidigi/sales_dashboard_dynamic` への書き込み権限（招待承諾済みであればOK）
- **Google Apps Script**: 後述のGAS Web Appプロジェクトの編集権限
- **Turso DB**: 直接の操作は基本不要（GAS経由でアクセス）

---

## 2. プロジェクト構成

```
sales_dashboard_dynamic/
├── index.html          # ダッシュボードHTML構造
├── style.css           # スタイル
├── app.js              # フロントエンドJS（API呼び出し・描画）
├── logo.png            # ロゴ画像
├── deploy.sh           # UI更新スクリプト（4ファイルをローカルにコピー）
├── gas/
│   ├── Code.js         # GAS APIコード（手動でGASエディタにコピペ）
│   └── appsscript.json # GASマニフェスト（カレンダーAPIスコープ等）
├── CLAUDE.md           # 開発者向けプロジェクト概要
└── README.md           # 初期ドキュメント
```

---

## 3. 修正の種類別 — 更新フロー

ダッシュボードの更新は **「UI側」** と **「GAS側」** で手順が異なります。

### 3-A. UI（HTML / CSS / JS）を修正したとき

1. `index.html` / `style.css` / `app.js` を編集
2. ローカル動作確認用に `deploy.sh` を実行
   ```bash
   ./deploy.sh
   ```
   ※スクリプトは `/Users/ebineryota/` にファイルをコピーします。**堺さん環境では `deploy.sh` 内の `DEST_DIR` を自分のホームディレクトリに書き換えてください**（このファイルはコミットしないこと）。
3. ブラウザで開いて確認
   ```
   file:///Users/<your-username>/sales_dashboard_dynamic.html
   ```
4. 強制リロード: `Cmd + Shift + R`
5. キャッシュトラブル時:
   ```js
   localStorage.clear(); location.reload();
   ```
6. 問題なければ Git にコミット → プッシュ（後述）

### 3-B. GAS API（`gas/Code.js`）を修正したとき

GASはローカルファイル＝GASエディタの自動同期がないため **手動コピペ＋手動デプロイ** が必要です。

1. `gas/Code.js` をローカルで編集
2. GASエディタを開く
   - スプレッドシート `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM` → **拡張機能 > Apps Script**
3. `Code.js` の内容を **全コピペで貼り付け**（差分マージではなく全置換）
4. デプロイ手順
   - **デプロイ → デプロイを管理 → 鉛筆アイコン → バージョン「新バージョン」→ デプロイ**
   - ⚠️ **「新しいデプロイ」は絶対に押さない**。URLが変わるとフロントエンドの `app.js` 内のAPI URLとの整合が崩れる
5. 動作確認: ブラウザでダッシュボードをハードリロードし、APIレスポンスを確認
6. 問題なければ Git にコミット → プッシュ

#### GAS API URL（変更しないこと）
```
https://script.google.com/macros/s/AKfycbwG_1cvgfnnNuK9PuhmXJOSeBuS8kFzJbf-R1p0qvySu0BW8GYKJKCKzHJ4Ny11FtkV/exec
```

#### appsscript.json を変更した場合
カレンダーAPIなどのスコープ追加が必要なケースでは `appsscript.json` も忘れずに更新してください（GASエディタ「プロジェクトの設定 → appsscript.json をエディタで表示」を有効化）。

---

## 4. データソース概要

### Turso DB（メインデータソース）
- URL: `https://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io`
- 主要テーブル
  - `deals` — 案件データ
  - `members` — 担当者マスタ
  - `projects` — 案件（架電）マスタ
  - `targets` — 月次目標
  - `settings` — KV形式の設定値（`sales_target_YYYY-MM` 等）
  - `performance_rawdata` — 実績rawdata
  - `member_name_aliases` — 担当者名の揺れ正規化

### スプレッドシート（一部機能のみ）
- ID: `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM`
- 用途: `syncMonthlyView()`（月次同期機能）のみ
- ダッシュボード本体のデータはTursoから取得

### GAS APIタイプ一覧（参考）
| タイプ | 内容 |
|--------|------|
| `monthly` | 月次ビュー（targets + performance_rawdata + deals） |
| `rawdata` | 実績rawdata集計 |
| `pipeline_v2` | パイプライン案件 + 月別集計 |
| `deals` / `members` / `projects` | CRUD用 |
| `sales_targets` / `sales_targets_save` | 月別売上目標 |

---

## 5. Git運用フロー

### 5-1. 作業前
```bash
git checkout main
git pull origin main
```

### 5-2. ブランチを切る（推奨）
```bash
git checkout -b fix/<内容を表すshortname>
```

### 5-3. コミット
```bash
git add <修正したファイル>
git commit -m "<種別>: <修正内容>"
```

コミットメッセージ例:
- `fix: 受注金額の集計バグ修正`
- `feat: パイプラインに見込み合計カードを追加`
- `refactor: app.jsの担当者カード描画ロジック整理`

### 5-4. プッシュ → PR作成
```bash
git push -u origin fix/<branchname>
```
GitHub上で Pull Request を作成し、ebineryota（江比根）にレビュー依頼。

### 5-5. 直接mainにpushする場合
小規模修正やhotfixの場合のみ。事前に共有してから。
```bash
git push origin main
```

---

## 6. よくあるトラブル

| 症状 | 対処 |
|------|------|
| 修正したのにブラウザに反映されない | `Cmd + Shift + R` でハードリロード／`localStorage.clear()` |
| API応答が空 / 古い | GASエディタで該当タイプの関数を直接実行し、ログを確認 |
| GAS再デプロイ後にAPIが404になる | 「新しいデプロイ」を押してURLが変わっていないか確認。新URLになった場合は `app.js` のAPI URLを差し戻すか、新URLに更新してフロントも修正 |
| Turso接続エラー | GASプロパティに登録されている `TURSO_AUTH_TOKEN` の期限切れを確認 |
| 担当者名がダッシュボード上で重複・抜けする | Turso `member_name_aliases` テーブルにエイリアスを追加 |

---

## 7. 重要な注意事項

- **「新しいデプロイ」を押さない**: GAS URLが変わるとフロントエンドが壊れます。常に「デプロイを管理」から既存デプロイを更新。
- **`deploy.sh` の `DEST_DIR` は環境依存**: 自分のホームディレクトリに合わせて書き換える。書き換えたものはコミットしない（`.gitignore` で除外するか、各自ローカル管理）。
- **本番Turso DBに直接書き込まない**: 検証時はGAS経由でテスト用エンドポイントを通すこと。
- **コミット前に**: スプレッドシートID、トークン、API URLなど機密情報がdiffに混ざっていないか確認。
- **CLAUDE.md / このファイル（UPDATE_GUIDE.md）の更新**: 仕様変更・運用変更があればドキュメントも合わせて更新してください。

---

## 8. 連絡先

- **オーナー**: ebineryota (r.ebine@digi-man.com)
- **リポジトリ**: https://github.com/ebidigi/sales_dashboard_dynamic
- **質問**: PRコメント or Slackで気軽にどうぞ
