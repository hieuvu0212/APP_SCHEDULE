#!/usr/bin/env bash
# Kiểm tra ranh giới: core/ phải là hàm thuần, không được phụ thuộc React/Dexie.
# Vỡ ranh giới này là mất khả năng test nhanh và mất tính di động sang Cloud DB.
set -uo pipefail
HITS=$(grep -rEn "from ['\"](react|react-dom|dexie|dexie-react-hooks)" src/core/ 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "❌ VỠ RANH GIỚI — core/ đang import React hoặc Dexie:"
  echo "$HITS"
  exit 1
fi
echo "✅ core/ vẫn thuần khiết (không import React/Dexie)"
