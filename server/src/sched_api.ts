import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";

/**
 * SCHEDULER API
 *
 * Tables this expects (as created by your import script):
 * - sched_terms(id TEXT PRIMARY KEY, title TEXT, campus TEXT, start_date TEXT, end_date TEXT)
 * - sched_offerings(id INTEGER PRIMARY KEY, term_id TEXT, subject TEXT, course TEXT, section TEXT,
 *       component TEXT, title TEXT, status TEXT, capacity INTEGER, seats_available INTEGER,
 *       waitlist_total INTEGER, delivery_mode TEXT, campus TEXT, notes TEXT)
 * - sched_instructors(id INTEGER PRIMARY KEY, name TEXT, norm TEXT)
 * - sched_offering_instructors(offering_id INTEGER, instructor_id INTEGER, PRIMARY KEY(offering_id,instructor_id))
 * - sched_meetings(id INTEGER PRIMARY KEY, offering_id INTEGER, days_mask INTEGER,
 *       start_min INTEGER, end_min INTEGER, start_date TEXT, end_date TEXT,
 *       location_text TEXT, building TEXT, room TEXT)
 */

function toBase(subject: string, course: string) {
    return `${String(subject || "").toUpperCase().trim()} ${String(course || "")
        .toUpperCase()
        .trim()}`;
}

function parseBaseLike(q: string): { subject?: string; course?: string } {
    // Accept "CPEN 211", "cpen211", "CPEN-211", etc.
    const s = (q || "").toUpperCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
    const m = s.match(/^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)?$/);
    if (!m) return {};
    const subject = m[1];
    const course = m[2] || undefined;
    return { subject, course };
}

export default function createSchedRouter(db: Database) {
    const r = Router();

    /* ------------------------ GET /terms ------------------------ */
    r.get("/terms", (_req: Request, res: Response) => {
        try {
            const rows = db
                .prepare(
                    `SELECT id, title, campus, start_date, end_date
           FROM sched_terms
           ORDER BY id DESC`
                )
                .all();
            res.json(rows);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* ------------------------ GET /search ----------------------- */
    // Returns [{ base: "CPEN 211", sections: 7 }, ...]
    r.get("/search", (req: Request, res: Response) => {
        const term_id = String(req.query.term_id || "").trim();
        const q = String(req.query.q || "").trim();

        if (!term_id || !q) return res.json([]);

        const { subject, course } = parseBaseLike(q);
        try {
            if (subject && course) {
                // Exact course match
                const row = db
                    .prepare(
                        `SELECT COUNT(DISTINCT section) AS sections
             FROM sched_offerings
             WHERE term_id = ? AND subject = ? AND course = ?`
                    )
                    .get(term_id, subject, course) as { sections?: number } | undefined;

                return res.json([{ base: toBase(subject, course), sections: row?.sections ?? 0 }]);
            }

            if (subject && !course) {
                // All courses for this subject
                const rows = db
                    .prepare(
                        `SELECT subject || ' ' || course AS base, COUNT(DISTINCT section) AS sections
             FROM sched_offerings
             WHERE term_id = ? AND subject = ?
             GROUP BY subject, course
             ORDER BY course ASC
             LIMIT 100`
                    )
                    .all(term_id, subject);
                return res.json(rows);
            }

            // Fallback: fuzzy search over subject or subject+course
            const sNorm = q.toUpperCase().replace(/\s+/g, "");
            const rows = db
                .prepare(
                    `SELECT subject || ' ' || course AS base, COUNT(DISTINCT section) AS sections
           FROM sched_offerings
           WHERE term_id = ?
             AND (
               subject LIKE ? OR
               subject || course LIKE ? OR
               subject || ' ' || course LIKE ?
             )
           GROUP BY subject, course
           ORDER BY subject ASC, course ASC
           LIMIT 50`
                )
                .all(term_id, `%${q.toUpperCase()}%`, `%${sNorm}%`, `%${q.toUpperCase()}%`);
            return res.json(rows);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* ---------------------- GET /offerings ---------------------- */
    // Params:
    //  - term_id (required)
    //  - subject & course OR base="CPEN 211"
    //  - include=meetings,instructors (optional)
    //  - only_open=1 (optional)
    r.get("/offerings", (req: Request, res: Response) => {
        const term_id = String(req.query.term_id || "").trim();
        let subject = String(req.query.subject || "").toUpperCase().trim();
        let course = String(req.query.course || "").toUpperCase().trim();

        const base = String(req.query.base || "").trim();
        if ((!subject || !course) && base) {
            const parsed = parseBaseLike(base);
            if (parsed.subject) subject = parsed.subject;
            if (parsed.course) course = parsed.course || "";
        }

        if (!term_id || !subject || !course) {
            return res.status(400).json({ error: "term_id, subject and course (or base) are required" });
        }

        const includeRaw = String(req.query.include || "").toLowerCase();
        const includeMeetings = includeRaw.includes("meetings");
        const includeInstr = includeRaw.includes("instructors");
        const onlyOpen = String(req.query.only_open || "") === "1";

        try {
            const rows = db
                .prepare(
                    `SELECT id, term_id, subject, course, section, component, title, status,
                  capacity, seats_available, waitlist_total, delivery_mode, campus, notes
           FROM sched_offerings
           WHERE term_id = ? AND subject = ? AND course = ?
           ${onlyOpen ? "AND (LOWER(COALESCE(status,'')) LIKE '%open%')" : ""}
           ORDER BY
             CASE component
               WHEN 'LEC' THEN 0
               WHEN 'LAB' THEN 1
               WHEN 'TUT' THEN 2
               ELSE 3
             END,
             section COLLATE NOCASE ASC`
                )
                .all(term_id, subject, course) as any[];

            // Attach base now; we’ll fill meetings/instructors below if requested
            const offerings = rows.map((r) => ({ ...r, base: toBase(r.subject, r.course) }));

            if (!offerings.length) return res.json([]);

            const ids = offerings.map((o) => o.id);
            const placeholders = ids.map(() => "?").join(",");

            if (includeMeetings) {
                const mrows = db
                    .prepare(
                        `SELECT id, offering_id, days_mask, start_min, end_min,
                    start_date, end_date, location_text, building, room
             FROM sched_meetings
             WHERE offering_id IN (${placeholders})
             ORDER BY start_min ASC`
                    )
                    .all(...ids) as any[];

                const byOff: Record<number, any[]> = {};
                for (const m of mrows) {
                    (byOff[m.offering_id] = byOff[m.offering_id] || []).push(m);
                }
                for (const o of offerings) o.meetings = byOff[o.id] || [];
            }

            if (includeInstr) {
                const irows = db
                    .prepare(
                        `SELECT oi.offering_id, i.name, i.norm
             FROM sched_offering_instructors oi
             JOIN sched_instructors i ON i.id = oi.instructor_id
             WHERE oi.offering_id IN (${placeholders})
             ORDER BY i.name COLLATE NOCASE ASC`
                    )
                    .all(...ids) as Array<{ offering_id: number; name: string; norm: string }>;

                const byOff: Record<number, Array<{ name: string; norm: string }>> = {};
                for (const ir of irows) {
                    (byOff[ir.offering_id] = byOff[ir.offering_id] || []).push({ name: ir.name, norm: ir.norm });
                }
                for (const o of offerings) o.instructors = byOff[o.id] || [];
            }

            res.json(offerings);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* ------------------- (optional) /by_base -------------------- */
    // Convenience: /api/sched/offerings_by_base?term_id=2025W1&base=CPEN%20211&include=...
    r.get("/offerings_by_base", (req: Request, res: Response) => {
        req.query.subject = "";
        req.query.course = "";
        // Delegate to /offerings handler – we rely on the "base" parsing there
        r.handle(req, res, () => void 0);
    });

    return r;
}
