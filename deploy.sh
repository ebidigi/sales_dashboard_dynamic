#!/bin/bash
# UI更新スクリプト（HTML/CSS/JSファイルをユーザーディレクトリにコピー）

set -e

cd "$(dirname "$0")"

DEST_DIR="/Users/ebineryota"

echo "=== UI Deploy Script ==="
echo ""

echo "[1/3] Copying index.html..."
cp index.html "$DEST_DIR/sales_dashboard_dynamic.html"

echo "[2/3] Copying style.css..."
cp style.css "$DEST_DIR/style.css"

echo "[3/3] Copying app.js..."
cp app.js "$DEST_DIR/app.js"

echo ""
echo "=== Deploy Complete ==="
echo "Files copied to: $DEST_DIR/"
echo "  - sales_dashboard_dynamic.html"
echo "  - style.css"
echo "  - app.js"
echo ""
echo "Refresh your browser (Cmd+Shift+R) to see changes."
