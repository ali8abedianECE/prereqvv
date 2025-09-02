// server/scripts/import_offerings_from_combined_csv.ts
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

/* ========================= CLI ARGS ========================= */
type Args = { csv: string; db: string; dry: boolean; debug: number };
function parseArgs(): Args {
    const a = process.argv.slice(2);
    const out: Args = {
        csv: process.env.CSV_FILE || "",
        db: process.env.DB_FILE || path.resolve("server/prereqs.db"),
        dry: false,
        debug: Number(process.env.DEBUG || 0),
    };
    for (let i = 0; i < a.length; i++) {
        const tok = a[i];
        if (tok === "--dry") out.dry = true;
        else if (tok.startsWith("--debug=")) out.debug = Number(tok.split("=")[1] || "0");
        else if (tok === "--debug") out.debug = 10;
        else if (tok === "--csv") out.csv = a[++i];
        else if (tok === "--db") out.db = a[++i];
    }
    if (!out.csv) {
        console.error("Usage: npx tsx server/scripts/import_offerings_from_combined_csv.ts --csv /path/file.csv --db server/prereqs.db [--dry] [--debug=10]");
        process.exit(2);
    }
    return out;
}
const ARGS = parseArgs();

/* ========================= DB SETUP ========================= */
const db = new Database(ARGS.db);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = wal");

function ensureSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS sched_terms(
                                                  id TEXT PRIMARY KEY,
                                                  title TEXT,
                                                  campus TEXT,
                                                  start_date TEXT,
                                                  end_date TEXT
        );
        CREATE TABLE IF NOT EXISTS sched_offerings(
                                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                      term_id TEXT NOT NULL REFERENCES sched_terms(id) ON DELETE CASCADE,
            subject TEXT NOT NULL,
            course  TEXT NOT NULL,
            section TEXT NOT NULL,
            component TEXT NOT NULL,
            title TEXT,
            status TEXT,
            capacity INTEGER,
            seats_available INTEGER,
            waitlist_total INTEGER,
            delivery_mode TEXT,
            campus TEXT,
            notes TEXT,
            UNIQUE(term_id, subject, course, section, component)
            );
        CREATE TABLE IF NOT EXISTS sched_instructors(
                                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                        name TEXT NOT NULL,
                                                        norm TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS sched_offering_instructors(
                                                                 offering_id INTEGER NOT NULL REFERENCES sched_offerings(id) ON DELETE CASCADE,
            instructor_id INTEGER NOT NULL REFERENCES sched_instructors(id) ON DELETE CASCADE,
            PRIMARY KEY (offering_id, instructor_id)
            );
        CREATE TABLE IF NOT EXISTS sched_meetings(
                                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     offering_id INTEGER NOT NULL REFERENCES sched_offerings(id) ON DELETE CASCADE,
            days_mask INTEGER,
            start_min INTEGER,
            end_min INTEGER,
            start_date TEXT,
            end_date TEXT,
            location_text TEXT,
            building TEXT,
            room TEXT
            );
    `);
}
ensureSchema();

/* ========================= HELPERS ========================= */
const DAYS = { M:1, T:2, W:4, R:8, F:16, S:32, U:64 };
const DAY_WORDS: Record<string, keyof typeof DAYS> = {
    MON:"M", TUE:"T", WED:"W", THU:"R", FRI:"F", SAT:"S", SUN:"U",
    M:"M", T:"T", W:"W", R:"R", F:"F", S:"S", U:"U",
};

function normName(s: string) {
    return (s||"").toLowerCase().replace(/[^a-z\s]/g,"").replace(/\s+/g," ").trim();
}

function parseTermId(raw: string): string {
    const s = (raw||"").trim();
    const m = s.match(/(\d{4}).*(Winter|Summer).*?(1|2)?/i);
    if (m) {
        const year = m[1];
        const season = /winter/i.test(m[2]) ? "W" : "S";
        const term = m[3] || "1";
        return `${year}${season}${term}`;
    }
    const short = s.replace(/\s+/g,"");
    return short || "UNK";
}

/** Accepts:
 *  "PHIL 102 001", "PHIL_V 120-99A", "AMNE_V 151-D08", "PHIL 102 L02", "ARCL_V 140-D1C"
 */
function parseCoursePieces(raw: string): { subject:string, course:string, section:string } | null {
    const s = (raw||"").trim().replace(/\s+/g," ");
    if (!s) return null;
    const campusStrip = s.replace(/^([A-Z]{2,5})_([A-Z])\b/, "$1");
    let m = campusStrip.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)[\s-]([A-Z0-9]{2,4})$/);
    if (m) return { subject: m[1], course: m[2], section: m[3] };
    m = campusStrip.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)(?:\s+([A-Z0-9]{2,4}))?$/);
    if (m) return { subject: m[1], course: m[2], section: (m[3] || "000") };
    return null;
}

function inferComponent(section: string, formatText: string): string {
    const f = (formatText||"").toLowerCase();
    const sec = (section||"").toUpperCase();
    if (/lab/.test(f) || /^L/.test(sec)) return "LAB";
    if (/tutorial|tut/.test(f) || /^T/.test(sec)) return "TUT";
    if (/seminar|sem/.test(f) || /^S/.test(sec)) return "SEM";
    if (/project|studio/.test(f) || /^P/.test(sec)) return "PRJ";
    return "LEC";
}

function normalizeAmPm(s: string) {
    return s
        .replace(/a\.m\./gi, "AM").replace(/p\.m\./gi, "PM")
        .replace(/\bam\b/gi,"AM").replace(/\bpm\b/gi,"PM");
}
function parseAmPmToMinutes(t: string): number | null {
    let s = normalizeAmPm(t.trim());
    const hasAmPm = /(AM|PM)$/i.test(s);
    if (hasAmPm) s = s.replace(/\s*(AM|PM)$/i, (_,x)=>x.toUpperCase());
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = (m[3]||"").toUpperCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (ap === "AM") { if (hh === 12) hh = 0; }
    else if (ap === "PM") { if (hh !== 12) hh += 12; }
    return hh*60 + mm;
}
function parseTimeRange(s: string): {start:number,end:number} | null {
    const x = normalizeAmPm(s);
    const m = x.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)[^\d]+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    if (!m) return null;
    const start = parseAmPmToMinutes(m[1]);
    const end   = parseAmPmToMinutes(m[2]);
    if (start==null || end==null) return null;
    return {start, end};
}
function parseDateRange(s: string): {start:string|null,end:string|null} | null {
    const m = s.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    return { start: m[1], end: m[2] };
}
function parseDays(words: string[]): number {
    let mask = 0;
    for (const w of words) {
        const key = DAY_WORDS[w.toUpperCase()];
        if (key) mask |= DAYS[key];
    }
    return mask;
}

type MeetingParsed = {
    days_mask: number;
    start_min: number;
    end_min: number;
    start_date?: string|null;
    end_date?: string|null;
    location_text?: string|null;
    building?: string|null;
    room?: string|null;
};

function splitMeetingLines(s: string): string[] {
    if (!s) return [];
    return s
        .split(/\r?\n|(\s\|\s)|\s\|\s/g)
        .filter(Boolean)
        .map(t => t.trim())
        .filter(Boolean);
}

function parseSingleLineMeeting(chunk: string): MeetingParsed | null {
    const date = parseDateRange(chunk);
    const tr = parseTimeRange(chunk);
    if (!tr) return null;

    // Extract days by taking words before the first time
    const firstTime = (chunk.match(/\d{1,2}:\d{2}/) || [])[0];
    const pre = firstTime ? chunk.slice(0, chunk.indexOf(firstTime)) : "";
    const dayTokens = pre.replace(/[,|]+/g," ").trim().split(/\s+/).filter(Boolean);
    const days_mask = parseDays(dayTokens);
    if (!days_mask) return null;

    // Location: whatever remains after the end time and not dates
    const after = chunk.slice(chunk.lastIndexOf(tr.end.toString()) + tr.end.toString().length);
    let loc = after;
    if (date) {
        loc = loc.replace(date.start!, "").replace(date.end!, "");
    }
    loc = loc.replace(/[–—-]/g," ").trim();
    let location_text: string | null = loc || null;
    let building: string | null = null;
    let room: string | null = null;
    if (location_text) {
        const bits = location_text.split(/\s+/);
        if (bits.length >= 2) {
            building = bits.slice(0,-1).join(" ");
            room = bits.slice(-1)[0];
        } else {
            building = location_text;
        }
    }

    return {
        days_mask,
        start_min: tr.start,
        end_min: tr.end,
        start_date: date?.start ?? null,
        end_date: date?.end ?? null,
        location_text,
        building,
        room,
    };
}

function parseMeetingsBlock(s: string): MeetingParsed[] {
    const lines = splitMeetingLines(s);
    const out: MeetingParsed[] = [];
    let i = 0;

    function looksLikeDayLine(x: string) {
        const t = x.trim().replace(/[,]+/g," ");
        const parts = t.split(/\s+/);
        return parseDays(parts) > 0;
    }

    while (i < lines.length) {
        const startI = i;
        let buildingLine: string | null = null;
        let dayLine: string | null = null;
        let timeLine: string | null = null;
        let dateLine: string | null = null;

        if (looksLikeDayLine(lines[i])) {
            dayLine = lines[i++];
        } else {
            buildingLine = lines[i++];
            if (i < lines.length && looksLikeDayLine(lines[i])) dayLine = lines[i++];
        }
        if (i < lines.length && /:\d{2}/.test(lines[i])) timeLine = lines[i++];
        if (i < lines.length && /\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}/.test(lines[i])) {
            dateLine = lines[i++];
        }

        if (dayLine && timeLine) {
            const dm = parseDays(dayLine.replace(/[,]+/g," ").split(/\s+/).filter(Boolean));
            const tr = parseTimeRange(timeLine);
            if (dm && tr) {
                let sd: string | null = null, ed: string | null = null;
                if (dateLine) {
                    const dr = parseDateRange(dateLine);
                    if (dr) { sd = dr.start; ed = dr.end; }
                }
                let building: string | null = null, room: string | null = null, location_text: string | null = null;
                if (buildingLine) {
                    location_text = buildingLine;
                    const bits = buildingLine.split(/\s+/);
                    if (bits.length >= 2) {
                        building = bits.slice(0, -1).join(" ");
                        room = bits.slice(-1)[0];
                    } else {
                        building = buildingLine;
                    }
                }
                out.push({
                    days_mask: dm,
                    start_min: tr.start,
                    end_min: tr.end,
                    start_date: sd, end_date: ed,
                    location_text, building, room,
                });
                continue;
            }
        }

        // fallback: try single-line on the chunk we just advanced over
        const chunk = lines.slice(startI, i).join(" ");
        const one = parseSingleLineMeeting(chunk);
        if (one) out.push(one);
        else i = startI + 1; // skip one to avoid infinite loop
    }

    if (out.length === 0) {
        const one = parseSingleLineMeeting(s);
        if (one) out.push(one);
    }
    return out;
}

/* ========================= PREPARED SQL ========================= */
const insTerm = db.prepare(`
    INSERT OR IGNORE INTO sched_terms(id, title, campus, start_date, end_date)
  VALUES(?,?,?,?,?)
`);
const insOffering = db.prepare(`
    INSERT INTO sched_offerings(
        term_id, subject, course, section, component, title, status,
        capacity, seats_available, waitlist_total, delivery_mode, campus, notes
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(term_id, subject, course, section, component) DO UPDATE SET
        title=excluded.title,
                                                                         status=excluded.status,
                                                                         capacity=excluded.capacity,
                                                                         seats_available=excluded.seats_available,
                                                                         waitlist_total=excluded.waitlist_total,
                                                                         delivery_mode=excluded.delivery_mode,
                                                                         campus=excluded.campus,
                                                                         notes=excluded.notes
`);
const selOfferingId = db.prepare(`
    SELECT id FROM sched_offerings
    WHERE term_id=? AND subject=? AND course=? AND section=? AND component=?
`);
const selInstr = db.prepare(`SELECT id FROM sched_instructors WHERE norm = ?`);
const insInstr = db.prepare(`INSERT INTO sched_instructors(name, norm) VALUES(?,?)`);
const linkInstr = db.prepare(`
    INSERT OR IGNORE INTO sched_offering_instructors(offering_id, instructor_id)
  VALUES(?,?)
`);
const delMeetings = db.prepare(`DELETE FROM sched_meetings WHERE offering_id = ?`);
const insMeeting = db.prepare(`
    INSERT INTO sched_meetings(
        offering_id, days_mask, start_min, end_min, start_date, end_date, location_text, building, room
    ) VALUES(?,?,?,?,?,?,?,?,?)
`);

function upsertInstructor(name: string): number | null {
    const nm = (name||"").trim();
    if (!nm || /^tba$/i.test(nm)) return null;
    const norm = normName(nm);
    const got = selInstr.get(norm) as { id:number } | undefined;
    if (got) return got.id;
    const info = insInstr.run(nm, norm);
    return Number(info.lastInsertRowid);
}

/* ========================= IMPORT ========================= */
type CsvRow = Record<string, string>;

function main() {
    const text = fs.readFileSync(ARGS.csv, "utf-8");
    const rows = parse(text, { columns: true, skip_empty_lines: true }) as CsvRow[];
    console.log("Rows:", rows.length);
    const headers = Object.keys(rows[0] || {});
    console.log("Detected headers (first row):", headers.join(" | "));

    let nOffer = 0;
    let nMeet  = 0;

    const txn = db.transaction(() => {
        for (const r of rows) {
            const courseRaw = (r["Course"] || "").trim();
            const pieces = parseCoursePieces(courseRaw);
            if (!pieces) continue;
            const { subject, course, section } = pieces;

            const termRaw = String(r["Academic Period"] || "").trim();
            const term_id = parseTermId(termRaw);
            const term_title = termRaw || term_id;
            const campus = String(r["Campus"] || "").trim() || null;

            if (!ARGS.dry) insTerm.run(term_id, term_title, campus, null, null);

            const component = inferComponent(section, String(r["Instructional Formats"] || ""));
            const title = String(r["Description"] || "").trim() || null;
            const status = String(r["Status"] || "").trim() || null;
            const capacity = Number(r["Total Section Capacity"] || "") || null;
            const seats_available = Number(r["Seats Available"] || "") || null;
            const waitlist_total =
                /wait/i.test(status || "") ? Math.max(1, (capacity ?? 0) - (seats_available ?? 0)) : null;
            const delivery_mode = String(r["Delivery Mode"] || "").trim() || null;
            const notes = String(r["Notes"] || "").trim() || null;

            if (!ARGS.dry) {
                // Upsert offering
                insOffering.run(
                    term_id, subject, course, section, component, title, status,
                    capacity, seats_available, waitlist_total, delivery_mode, campus, notes
                );
                // ALWAYS re-select the row id (do not use lastInsertRowid after UPSERT)
                const row = selOfferingId.get(term_id, subject, course, section, component) as { id:number } | undefined;
                if (!row) throw new Error(`Offering not found after upsert: ${term_id} ${subject} ${course} ${section} ${component}`);
                const offering_id = row.id;

                // instructors
                const instrRaw = String(r["Instructors"] || "").trim();
                if (instrRaw) {
                    for (const token of instrRaw.split(/;|,/)) {
                        const id = upsertInstructor(token);
                        if (id) linkInstr.run(offering_id, id);
                    }
                }

                // meetings
                delMeetings.run(offering_id);
                const parsed = parseMeetingsBlock(String(r["Meeting Patterns"] || ""));
                for (const m of parsed) {
                    insMeeting.run(
                        offering_id,
                        m.days_mask ?? null,
                        m.start_min ?? null,
                        m.end_min ?? null,
                        m.start_date ?? null,
                        m.end_date ?? null,
                        m.location_text ?? null,
                        m.building ?? null,
                        m.room ?? null
                    );
                    nMeet++;
                }
            } else {
                nMeet += parseMeetingsBlock(String(r["Meeting Patterns"] || "")).length;
            }

            nOffer++;
            if (ARGS.debug >= 10 && ARGS.dry && nOffer <= 10) {
                console.log(`[DRY] ${subject} ${course} ${section} @ ${term_id} (${component})`);
            }
        }
    });

    txn();

    console.log("\n=== Import summary ===");
    console.log("CSV: ", ARGS.csv);
    console.log("DB:  ", ARGS.db);
    console.log("Total rows:           ", rows.length);
    console.log(`Offerings imported:   ${nOffer}${ARGS.dry ? " (dry-run)" : ""}`);
    console.log(`Meetings inserted:    ${nMeet}${ARGS.dry ? " (dry-run)" : ""}`);
}

main();
