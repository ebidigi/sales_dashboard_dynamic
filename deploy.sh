#!/bin/bash
# UI更新スクリプト（HTMLファイルをユーザーディレクトリにコピー）

set -e

cd "$(dirname "$0")"

echo "=== UI Deploy Script ==="
echo ""

echo "[1/1] Copying index.html to user directory..."
cp index.html /Users/ebineryota/sales_dashboard_dynamic.html

echo ""
echo "=== Deploy Complete ==="
echo "File copied to: /Users/ebineryota/sales_dashboard_dynamic.html"
echo ""
echo "Refresh your browser (Cmd+Shift+R) to see changes."
