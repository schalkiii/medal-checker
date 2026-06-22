#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════╗"
echo "║   PT勋章扫描器 — 质量检查流水线     ║"
echo "╚══════════════════════════════════════╝"
echo ""

MODE="${1:-check}"

case "$MODE" in
  check)
    echo "▶ 运行完整检查..."
    node scripts/check.js
    ;;
  fix)
    echo "▶ ESLint 自动修复 + 完整检查..."
    node scripts/lint-fix.js
    ;;
  watch)
    echo "▶ 启动文件监控模式..."
    node scripts/watch.js
    ;;
  *)
    echo "用法: ./check.sh [check|fix|watch]"
    echo "  check  - 运行完整检查 (默认)"
    echo "  fix    - ESLint 自动修复 + 完整检查"
    echo "  watch  - 文件监控模式，修改后自动运行 fix"
    exit 1
    ;;
esac