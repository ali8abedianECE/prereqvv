#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRV_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DATA_DIR=""
OUT_DIR="$SRV_DIR/tmp-grades"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DATA_DIR="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

if [[ -z "${DATA_DIR}" ]]; then
  echo "Usage: $0 --dir /path/to/ubc-pair-grade-data [--out /tmp/outdir]"
  exit 2
fi

mkdir -p "$OUT_DIR"

JAVA_SRC="$SRV_DIR/src/grades/ImportGrades.java"
JAVA_PKG_DIR="$SRV_DIR/src"
JAVA_OUT="$SRV_DIR/build/java"

if [[ ! -f "$JAVA_SRC" ]]; then
  echo "error: file not found: $JAVA_SRC"
  exit 2
fi

mkdir -p "$JAVA_OUT"
javac -d "$JAVA_OUT" "$JAVA_SRC"

java -cp "$JAVA_OUT" grades.ImportGrades --dir "$DATA_DIR" --out "$OUT_DIR"

DB_FILE="${DB_FILE:-$SRV_DIR/prereqs.db}"
echo "DB_FILE: $DB_FILE"

sqlite3 "$DB_FILE" <<'SQL'
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS grades_sections(
  campus   TEXT,
  subject  TEXT,
  course   TEXT,
  section  TEXT,
  year     INTEGER,
  session  TEXT,
  average  REAL
);
CREATE TABLE IF NOT EXISTS grades_course_avg(
  campus   TEXT,
  subject  TEXT,
  course   TEXT,
  avg      REAL,
  samples  INTEGER
);
DELETE FROM grades_sections;
DELETE FROM grades_course_avg;
SQL

sqlite3 "$DB_FILE" <<SQL
.mode csv
.import '$OUT_DIR/grades_sections_import.csv' grades_sections
.import '$OUT_DIR/grades_course_avg_import.csv' grades_course_avg
CREATE INDEX IF NOT EXISTS idx_gs_key ON grades_sections(campus,subject,course,section,year,session);
CREATE INDEX IF NOT EXISTS idx_gca_key ON grades_course_avg(campus,subject,course);
SQL

echo "Import complete."
