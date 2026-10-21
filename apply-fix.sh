#!/usr/bin/env bash
# Jalankan dari ROOT proyek (folder yang berisi package.json)
set -e

FILES=(
  src/pages/admin/TaskAssignmentPage.tsx
  src/pages/admin/CalendarPage.tsx
  src/pages/DashboardPage.tsx
  src/pages/teknisi/TeknisiTasksPage.tsx
  src/pages/review/ReviewPage.tsx
  src/pages/ReportsPage.tsx
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "SKIP (tidak ditemukan): $f"; continue; fi
  sed -i 's/technician(\*)/technician:profiles!technician_id(*)/g' "$f"
  echo "OK: $f"
done

mkdir -p supabase/migrations
cp "$(dirname "$0")/20261021000000_fix_calibration_results_unique.sql" supabase/migrations/
echo "Migration disalin ke supabase/migrations/"

echo
echo "Hasil perubahan:"
grep -rn "technician:profiles" src | sed 's/^/  /'
echo
echo "Berikutnya:"
echo "  1. Jalankan isi file migration di Supabase > SQL Editor"
echo "  2. git add -A && git commit -m 'fix: relasi technician dan unique result per task' && git push"
