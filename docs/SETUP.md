# セットアップガイド

## 前提条件

- Google アカウント
- 対象スプレッドシートへのアクセス権限
- モダンブラウザ（Chrome推奨）

---

## 1. Google Apps Script のセットアップ

### 方法A: スプレッドシートから直接（推奨）

1. スプレッドシートを開く
   ```
   https://docs.google.com/spreadsheets/d/1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM
   ```

2. メニューから **拡張機能 > Apps Script** を選択

3. エディタが開いたら、既存コードを削除し `gas/Code.js` の内容をペースト

4. **プロジェクトの設定**（歯車アイコン）を開き、以下を確認:
   - タイムゾーン: `(GMT+09:00) 日本標準時 – 東京`

5. **デプロイ > 新しいデプロイ** をクリック

6. 設定:
   - **種類を選択**: ウェブアプリ
   - **説明**: `営業KPIダッシュボード API`
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 全員

7. **デプロイ** をクリック

8. 初回は承認が必要:
   - 「アクセスを承認」をクリック
   - Googleアカウントを選択
   - 「詳細」をクリック
   - 「（安全ではないページ）に移動」をクリック
   - 「許可」をクリック

9. 表示されたURLをコピー（これがAPI URL）

### 方法B: clasp CLI を使用

```bash
# 1. clasp インストール
npm install -g @google/clasp

# 2. Google認証
clasp login

# 3. Apps Script API を有効化
# https://script.google.com/home/usersettings でAPIをONにする

# 4. プロジェクトを作成
cd /path/to/sales_dashboard_dynamic/gas
clasp create --type webapp --parentId 1YjOXBP9cGnMmLpCCO-rRC2tVe25_LZbijaRldl2ZiSM

# 5. コードをプッシュ
clasp push

# 6. デプロイ
clasp deploy --description "営業KPIダッシュボード API"

# 7. デプロイURLを確認
clasp deployments
```

---

## 2. ダッシュボードの設定

### API URLの更新

`index.html` の `DEFAULT_API_URL` を更新:

```javascript
const DEFAULT_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

### ローカルで実行

```bash
# 直接ブラウザで開く
open index.html

# または簡易HTTPサーバーを使用
python3 -m http.server 8000
# http://localhost:8000 にアクセス
```

---

## 3. 動作確認

### API テスト

ブラウザで API URL にアクセスし、JSONが返ることを確認:

```bash
curl "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

期待されるレスポンス:
```json
{
  "metadata": { ... },
  "summary": { ... },
  "members": [ ... ]
}
```

### ダッシュボード確認

1. `index.html` をブラウザで開く
2. ローディング後、データが表示されることを確認
3. フィルターボタンをクリックして動作確認
4. 「更新」ボタンでデータ再取得を確認

---

## トラブルシューティング

### エラー: "Cannot read properties of null"

**原因**: スプレッドシートIDが正しくない、またはシート名が存在しない

**解決**:
1. `gas/Code.js` の `SPREADSHEET_ID` を確認
2. シート名「月次ビュー」が存在するか確認

### エラー: CORS エラー

**原因**: GAS Web App の設定が不正

**解決**:
1. アクセスできるユーザーが「全員」になっているか確認
2. 再デプロイを実行

### データが表示されない

**原因**: API URLが古い、またはLocalStorageに古いURLがキャッシュされている

**解決**:
```javascript
// ブラウザのコンソールで実行
localStorage.removeItem('gasApiUrl');
location.reload();
```

### フィルターが効かない

**原因**: データの案件名/担当者名に特殊文字が含まれている

**解決**: 最新のコードでは対応済み。HTMLファイルを最新版に更新。

---

## GAS 再デプロイ手順

コード修正後は再デプロイが必要:

### 方法A: GUIから

1. Apps Script エディタを開く
2. **デプロイ > デプロイを管理**
3. 鉛筆アイコンをクリック
4. **バージョン**: 新バージョン を選択
5. **デプロイ** をクリック

### 方法B: claspから

```bash
clasp push
clasp deploy --description "更新内容のメモ"
```

**注意**: 新しいデプロイを作成するとURLが変わる場合があります。既存デプロイを更新する場合は「デプロイを管理」から行ってください。
