#!/usr/bin/env bash
set -euo pipefail

# ---------- CONFIG (override via env or flags) ----------
CSV_IN_DEFAULT="${CSV_IN:-$HOME/Downloads/combined_courses_with_prereqs.csv}"
CSV_OUT_DEFAULT="${CSV_OUT:-$HOME/Downloads/extracted_prereqs.csv}"
DB_FILE_DEFAULT="${DB_FILE:-$(pwd)/server/prereqs.db}"

usage() {
  echo "Usage: $0 [-i INPUT_CSV] [-o OUTPUT_CSV] [-d DB_FILE]"
  echo "Defaults:"
  echo "  INPUT_CSV:  $CSV_IN_DEFAULT"
  echo "  OUTPUT_CSV: $CSV_OUT_DEFAULT"
  echo "  DB_FILE:    $DB_FILE_DEFAULT"
}

CSV_IN="$CSV_IN_DEFAULT"
CSV_OUT="$CSV_OUT_DEFAULT"
DB_FILE="$DB_FILE_DEFAULT"

while getopts ":i:o:d:h" opt; do
  case $opt in
    i) CSV_IN="$OPTARG" ;;
    o) CSV_OUT="$OPTARG" ;;
    d) DB_FILE="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Invalid option -$OPTARG"; usage; exit 2 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTRACT_DIR="$ROOT_DIR"
SERVER_DIR="$ROOT_DIR/==-"

VENV_DIR="$EXTRACT_DIR/.venv"
PY="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

banner() {
  echo
  echo "============================================================"
  echo "$*"
  echo "============================================================"
}

# ---------- CHECK INPUT ----------
if [[ ! -f "$CSV_IN" ]]; then
  echo "Input CSV not found: $CSV_IN"
  exit 1
fi

# ---------- PYTHON VENV SETUP ----------
banner "Setting up Python venv"
mkdir -p "$EXTRACT_DIR"
if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi
"$PIP" install --upgrade pip wheel >/dev/null
"$PIP" install pandas >/dev/null

# ---------- RUN EXTRACTOR ----------
banner "Running extractor on: $CSV_IN"
cd "$EXTRACT_DIR"
"$PY" extractor_v2.py "$CSV_IN" -o "$CSV_OUT"

# ---------- RUN TESTS (if present) ----------
if [[ -f "$EXTRACT_DIR/test_extractor_v2.py" ]]; then
  banner "Unit tests"
  "$PY" -m unittest -q || { echo "Unit tests failed"; exit 1; }
fi

if [[ -f "$EXTRACT_DIR/integration_smoke_test.py" ]]; then
  banner "Integration smoke test"
  "$PY" integration_smoke_test.py || { echo "Integration test failed"; exit 1; }
fi

if [[ -f "$EXTRACT_DIR/validate_output.py" ]]; then
  banner "Validating output CSV"
  "$PY" validate_output.py "$CSV_OUT"
fi

if [[ -d "$SERVER_DIR" ]]; then
  banner "Importing CSV into SQLite via server script"
  cd "$SERVER_DIR"
  # install deps only if needed
  if [[ ! -d node_modules ]]; then
    echo "Installing server dependencies…"
    npm install
  fi
  CSV_FILE="$CSV_OUT" DB_FILE="$DB_FILE" npm run import
  echo
  echo "✔ Import complete -> DB: $DB_FILE"
  echo
  echo "To run the API:    DB_FILE=\"$DB_FILE\" npm run dev"
else
  echo
  echo "Server folder not found at $SERVER_DIR — skipping DB import."
fi

banner "ALL DONE"
echo "Output CSV : $CSV_OUT"
echo "DB File    : $DB_FILE"

