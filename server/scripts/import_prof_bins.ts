// server/scripts/import_prof_bins.ts
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

const DB_FILE = "/Users/mohammadaliabedian/IdeaProjects/prereqvv/server/prereqs.db";
const INPUT   = "/Users/mohammadaliabedian/IdeaProjects/UBCPRV/professor_courses_V2";

/* ---------- helpers ---------- */
function normName(s: string) {
    return (s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[^a-z\s]/g, "")
        .replace(/\s+/g, " ");
}

// accept <50, 50-59, 90+, allow stray spaces or % at end
function isBinHeader(h: string) {
    const cleaned = h.trim().replace(/\s*%$/, "").replace(/\s+/g, "");
    return /^(<\d+|\d+-\d+|\d+\+)$/.test(cleaned);
}
function cleanLabel(h: string) {
    return h.trim().replace(/\s*%$/, "");
}
function toInt(s: string | undefined) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.floor(n) : 0;
}
// case-insensitive get
function getCI(rec: Record<string,string>, ...keys: string[]) {
    for (const k of keys) {
        for (const kk of Object.keys(rec)) {
            if (kk.toLowerCase() === k.toLowerCase()) return rec[kk];
        }
    }
    return "";
}
// recursive file listing
function listCsvFiles(root: string): string[] {
    const out: string[] = [];
    function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile() && e.name.toLowerCase().endsWith(".csv")) out.push(p);
        }
    }
    walk(root);
    return out;
}

/* ---------- db ---------- */
const db = new Database(DB_FILE);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = wal");

// ensure table exists
db.exec(`
CREATE TABLE IF NOT EXISTS prof_course_grade_bins (
  campus          TEXT NOT NULL,
  subject         TEXT NOT NULL,
  course          TEXT NOT NULL,
  section         TEXT NOT NULL,
  year            INTEGER NOT NULL,
  session         TEXT NOT NULL,
  instructor_norm TEXT NOT NULL,
  bin_label       TEXT NOT NULL,
  count           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campus,subject,course,section,year,session,instructor_norm,bin_label)
);
CREATE INDEX IF NOT EXISTS idx_prof_bins_instr
  ON prof_course_grade_bins (instructor_norm);
`);

const ins = db.prepare(`
  INSERT INTO prof_course_grade_bins(
    campus,subject,course,section,year,session,instructor_norm,bin_label,count
  ) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(campus,subject,course,section,year,session,instructor_norm,bin_label)
  DO UPDATE SET count = excluded.count
`);

function importFile(fp: string) {
    const text = fs.readFileSync(fp, "utf-8");
    const rows = parse(text, { columns: true, skip_empty_lines: true }) as Record<string,string>[];

    let rowInserts = 0;
    db.transaction(() => {
        for (const r of rows) {
            const campus  = getCI(r, "Campus", "campus").trim();
            const year    = toInt(getCI(r, "Year", "year"));
            const session = getCI(r, "Session", "session").trim();
            const subject = getCI(r, "Subject", "subject").trim().toUpperCase();
            const course  = getCI(r, "Course", "course").trim().toUpperCase();
            const section = getCI(r, "Section", "section").trim().toUpperCase();
            const prof    = (getCI(r, "Professor", "professor") || getCI(r, "Instructor", "instructor")).trim();

            if (!campus || !year || !session || !subject || !course || !section || !prof) continue;

            const instructor_norm = normName(prof);

            let anyBins = 0;
            for (const [key, val] of Object.entries(r)) {
                if (!isBinHeader(key)) continue;
                const count = toInt(val);
                if (count <= 0) continue;
                ins.run(campus, subject, course, section, year, session, instructor_norm, cleanLabel(key), count);
                anyBins++;
                rowInserts++;
            }
            // if no explicit bins on this row, nothing to insert; skip silently
        }
    })();

    return rowInserts;
}

function main() {
    if (!fs.existsSync(INPUT)) {
        console.error("No CSV directory:", INPUT);
        process.exit(1);
    }
    const files = listCsvFiles(INPUT);
    if (!files.length) {
        console.warn("No CSV files found under:", INPUT);
        return;
    }

    console.log("DB:", path.resolve(DB_FILE));
    console.log("INPUT:", path.resolve(INPUT));
    console.log("CSV files:", files.length);

    let total = 0;
    for (const f of files) {
        const n = importFile(f);
        console.log(`Imported ${path.relative(INPUT, f)}  (+${n} bin rows)`);
        total += n;
    }
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM prof_course_grade_bins`).get() as { c: number };
    console.log("Done. Current table rows:", c, "(+ just added:", total, ")");
}
main();
