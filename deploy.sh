#!/bin/bash
# UI更新スクリプト（HTML/CSS/JSファイルをユーザーディレクトリにコピー）

set -e

cd "$(dirname "$0")"

DEST_DIR="/Users/ebineryota"

echo "=== UI Deploy Script ==="
echo ""

echo "[1/4] Copying index.html..."
cp index.html "$DEST_DIR/sales_dashboard_dynamic.html"

echo "[2/4] Copying style.css..."
cp style.css "$DEST_DIR/style.css"

echo "[3/4] Copying app.js..."
cp app.js "$DEST_DIR/app.js"

echo "[4/4] Copying logo.png..."
cp logo.png "$DEST_DIR/logo.png"

echo ""
echo "=== Deploy Complete ==="
echo "Files copied to: $DEST_DIR/"
echo "  - sales_dashboard_dynamic.html"
echo "  - style.css"
echo "  - app.js"
echo "  - logo.png"
echo ""
echo "Refresh your browser (Cmd+Shift+R) to see changes."
