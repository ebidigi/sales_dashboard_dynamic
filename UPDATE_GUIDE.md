# 営業KPIダッシュボード 更新手順ガイド（Claude Code版）

このダッシュボードを **Claude Code** から修正・デプロイする手順をまとめたものです。

> 前提: Claude Code（CLIまたはVS Code拡張）がインストール済みであること。
> 未インストールの場合: https://claude.com/claude-code

---

## 1. 初回セットアップ

### 1-1. GitHub招待の承諾
1. GitHubの通知またはメールから招待を承諾
2. 招待URL: https://github.com/ebidigi/sales_dashboard_dynamic/invitations

### 1-2. リポジトリのクローン
任意のディレクトリで実行:
```bash
git clone https://github.com/ebidigi/sales_dashboard_dynamic.git
cd sales_dashboard_dynamic
```

### 1-3. Claude Codeの起動
```bash
claude
```
リポジトリ直下で起動すると **`CLAUDE.md` が自動的にプロジェクトコンテキストとして読み込まれる** ので、データソース・デプロイ方法・案件管理ロジックなどを毎回説明する必要はありません。

### 1-4. 必要なアクセス権の確認
- **GitHub**: `ebidigi/sales_dashboard_dynamic` への書き込み権限（招待承諾済みでOK）
- **Google Apps Script**: GAS Web Appプロジェクトの編集権限（ebineryotaに依頼）
- **Turso DB**: 直接操作は不要（GAS経由でアクセス）

---

## 2. プロジェクト構成（Claude Codeに読ませる主要ファイル）

```
sales_dashboard_dynamic/
├── index.html          # ダッシュボードHTML構造
├── style.css           # スタイル
├── app.js              # フロントエンドJS（API呼び出し・描画）
├── logo.png            # ロゴ画像
├── deploy.sh           # UI更新スクリプト（4ファイルをローカルにコピー）
├── gas/
│   ├── Code.js         # GAS APIコード（GASエディタへ手動コピー）
│   └── appsscript.json # GASマニフェスト（スコープ等）
├── CLAUDE.md           # ★ Claude Codeが自動で読み込むコンテキスト
├── UPDATE_GUIDE.md     # このファイル
└── README.md
```

---

## 3. Claude Codeでの基本的な進め方

### 3-1. 「やりたいこと」を日本語で伝える
コード位置を自分で探す必要はありません。例:
- 「受注金額の合計が間違ってるので調査して直して」
- 「分析タブに前月比較トグルを追加したい」
- 「`getMonthlyViewData()` のキャッシュ時間を5分に変更して」

Claude Codeが該当ファイルを検索 → 編集 → 差分を提示します。

### 3-2. 大きな変更は Plan モードを使う
複雑な変更は **Shift+Tab で Plan モード** に入り、実装プランを先に立てさせてから承認するのが安全です。

### 3-3. 動作確認まで含めて依頼する
> 「app.jsを直して、deploy.shを実行して、ブラウザで確認できるようにして」
> 「コミットメッセージは `fix: 〜〜` で、コミットしてpushまでして」

このように **「どこまでやるか」を最初に伝える** とスムーズです。

### 3-4. コンテキストをリセットしたいとき
別タスクに移る前に `/clear` でコンテキストをクリアすると精度が上がります。

---

## 4. 修正の種類別 — 更新フロー

### 4-A. UI（HTML / CSS / JS）を修正したいとき

Claude Codeへの依頼例:
> 「担当者カードの架電進捗バーの色を、80%以上で緑になるよう変更して。修正したら deploy.sh を実行して」

Claude Codeが行うこと:
1. `app.js` / `style.css` の該当箇所を検索・編集
2. `./deploy.sh` を実行（`/Users/ebineryota/` にファイルがコピーされる）
3. 差分を提示

確認手順:
1. ブラウザで `file:///Users/<your-username>/sales_dashboard_dynamic.html` を開く
2. **`Cmd + Shift + R`** でハードリロード
3. キャッシュトラブル時はコンソールで:
   ```js
   localStorage.clear(); location.reload();
   ```

#### ⚠️ `deploy.sh` のパスについて
`deploy.sh` 内の `DEST_DIR="/Users/ebineryota"` は江比根のホームを指しています。
堺さん環境では Claude Code に以下を依頼してください:
> 「deploy.sh の DEST_DIR を自分のホームディレクトリに書き換えて。ただしこの変更はコミットしないで」

または、ローカルだけ別パスにする運用（`.gitignore` で除外、または `git update-index --skip-worktree deploy.sh`）も可能です。

### 4-B. GAS API（`gas/Code.js`）を修正したいとき

GAS側は **ブラウザのGASエディタにしかデプロイできない** ため、Claude Codeで自動化できる範囲には限界があります。手順:

1. **コード修正をClaude Codeに依頼**
   > 「gas/Code.js の `getMonthlyViewData()` で、キャッシュキーに月パラメータを含めるようにして」
2. **GASエディタにコピペ**（手動）
   - スプレッドシート `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM` → **拡張機能 > Apps Script**
   - `Code.js` の中身を **全コピペで全置換**
3. **デプロイ**（手動・最重要）
   - **デプロイ → デプロイを管理 → 鉛筆アイコン → バージョン「新バージョン」→ デプロイ**
   - ⚠️ **「新しいデプロイ」は絶対に押さない**（URLが変わってフロント全壊）
4. **動作確認**: ダッシュボードをハードリロードしてAPI動作をチェック
5. **Git commit & push** をClaude Codeに依頼

#### 固定値（変更しない）
- GAS Web App URL:
  ```
  https://script.google.com/macros/s/AKfycbwG_1cvgfnnNuK9PuhmXJOSeBuS8kFzJbf-R1p0qvySu0BW8GYKJKCKzHJ4Ny11FtkV/exec
  ```

#### `appsscript.json` を変更した場合
カレンダーAPI等のスコープ追加は **GASエディタ「プロジェクトの設定 → appsscript.json をエディタで表示」** をONにしないと反映されません。

---

## 5. データソース概要（Claude Codeに作業させる前に把握しておく）

### Turso DB（メインデータソース）
- URL: `https://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io`
- 主要テーブル
  - `deals` — 案件データ（`amount`単一カラム、フェーズで受注/PL分類）
  - `members` / `projects` — マスタ
  - `targets` — 月次目標（担当者×案件×月）
  - `settings` — KV設定（`sales_target_YYYY-MM` 等）
  - `performance_rawdata` — 実績rawdata
  - `member_name_aliases` — 担当者名揺れ正規化

### スプレッドシート（限定用途）
- ID: `1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM`
- `syncMonthlyView()`（月次同期）でのみ使用

### GAS APIタイプ
| タイプ | 内容 |
|--------|------|
| `monthly` | 月次ビュー（targets + performance_rawdata + deals） |
| `rawdata` | 実績rawdata集計 |
| `pipeline_v2` | パイプライン案件 + 月別集計 |
| `deals` / `members` / `projects` | CRUD |
| `sales_targets` / `sales_targets_save` | 月別売上目標 |

---

## 6. Git運用（Claude Codeに任せられる）

### 6-1. 作業前に最新化
Claude Codeに依頼:
> 「main を pull して最新化して、ブランチ `fix/xxx` を切って」

または手動で:
```bash
git checkout main && git pull origin main && git checkout -b fix/xxx
```

### 6-2. コミット & プッシュ
作業後に:
> 「変更内容を確認してコミットして、origin にpushして。コミットメッセージは適切な日本語で」

Claude Codeが `git status` / `git diff` を確認 → 適切なメッセージで commit → push まで実行します。

### 6-3. PR作成
> 「Pull Request を作って。レビュアーは ebidigi を指定して」

`gh pr create` を Claude Code が実行します（要 `gh` CLI ログイン）。

### 6-4. コミットメッセージ規約
| 種別 | 用途 |
|------|------|
| `fix:` | バグ修正 |
| `feat:` | 新機能 |
| `refactor:` | 機能変更なしのリファクタ |
| `docs:` | ドキュメント |
| `chore:` | 設定・雑務 |

---

## 7. よくあるトラブル

| 症状 | 対処 |
|------|------|
| 修正したのにブラウザに反映されない | `./deploy.sh` を実行したか確認 → `Cmd + Shift + R` → `localStorage.clear()` |
| GAS再デプロイ後にAPIが404 | 「新しいデプロイ」を押してURLが変わっていないか確認 |
| API応答が空 / 古い | GASエディタで該当タイプの関数を直接実行し、ログ確認 |
| Turso接続エラー | GASプロパティの `TURSO_AUTH_TOKEN` 期限切れを確認 |
| 担当者名が重複・抜けする | Turso `member_name_aliases` テーブルにエイリアス追加 |
| Claude Codeが古い情報で動く | `/clear` でコンテキストをリセット |

---

## 8. 重要な注意事項

- **「新しいデプロイ」を押さない**: GAS URLが変わるとフロント全壊。常に「デプロイを管理」から既存デプロイを更新。
- **`deploy.sh` の `DEST_DIR` は環境依存**: 各自のホームに書き換える。コミットしない。
- **本番Turso DBへの直書きはしない**: 必ずGAS経由。
- **コミット前**: トークン・APIキー等の機密がdiffに混ざってないか確認（Claude Codeに `git diff --staged` を見せて確認させると確実）。
- **`CLAUDE.md` の更新**: 仕様や運用が変わったら **必ず `CLAUDE.md` も更新** してください。次回以降のClaude Codeセッションが古い前提で動くと事故につながります。
- **このファイル（`UPDATE_GUIDE.md`）の更新**: 運用変更があれば合わせて改訂。

---

## 9. 連絡先

- **オーナー**: ebineryota (r.ebine@digi-man.com)
- **リポジトリ**: https://github.com/ebidigi/sales_dashboard_dynamic
- **質問**: PRコメント or Slackでどうぞ
