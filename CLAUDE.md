# Sales Dashboard Dynamic

営業KPIダッシュボードプロジェクト。Google Apps Script (GAS) でスプレッドシートのデータを取得し、HTMLダッシュボードで可視化する。

## プロジェクト構成

```
sales_dashboard_dynamic/
├── index.html          # ダッシュボードUI（Chart.js使用）
├── deploy.sh           # UI更新スクリプト
├── gas/
│   └── Code.js         # GAS APIコード（参照用）
```

## デプロイ方法

### UI変更時（推奨）
```bash
./deploy.sh
```
これで `index.html` が `/Users/ebineryota/sales_dashboard_dynamic.html` にコピーされる。

### ブラウザで確認
```
file:///Users/ebineryota/sales_dashboard_dynamic.html
```

## 主な編集ファイル

- **UI/グラフ変更**: `index.html` を編集 → `./deploy.sh` を実行
- **API変更**: GASエディタで直接編集・デプロイ（ブラウザで操作）

## API情報

- **API URL**: `https://script.google.com/macros/s/AKfycbz1ZDCczUFxuSL0mjHq_VTFotjst_vZssGJPIizQ3XALil5ekqq7-SJkjPcqBFyN2V28g/exec`
- **データソース**: スプレッドシート「月次ビュー」シート

## グラフ構成

1. **担当者カード** - 個人別の進捗（プログレスバー）
2. **案件別 架電進捗 vs アポ進捗** - 案件ごとの比較棒グラフ
3. **案件別 架電進捗率ランキング** - 案件の横棒グラフ
4. **案件別 アポ進捗率ランキング** - 案件の横棒グラフ

## 注意事項

- UI変更後は `./deploy.sh` を実行
- ブラウザキャッシュが残る場合は `Cmd+Shift+R` でハードリロード
