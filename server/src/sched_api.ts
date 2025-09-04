// --- server/src/sched_api.ts ---
import { Router, type Request, type Response } from "express";
import Database from "better-sqlite3";

// Use the library's namespace type for an opened DB connection
export type DB = Database.Database;

/**
 * SCHEDULER API
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

// Shared query function so we don't need redirects or r.handle hacks
function fetchOfferings(
    db: DB,
    term_id: string,
    subject: string,
    course: string,
    includeMeetings: boolean,
    includeInstr: boolean,
    onlyOpen: boolean
) {
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

    const offerings = rows.map((r) => ({ ...r, base: toBase(r.subject, r.course) }));
    if (!offerings.length) return [] as any[];

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
        for (const m of mrows) (byOff[m.offering_id] = byOff[m.offering_id] || []).push(m);
        for (const o of offerings) (o as any).meetings = byOff[o.id] || [];
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
        for (const ir of irows) (byOff[ir.offering_id] = byOff[ir.offering_id] || []).push({ name: ir.name, norm: ir.norm });
        for (const o of offerings) (o as any).instructors = byOff[o.id] || [];
    }

    return offerings;
}

export default function createSchedRouter(db: DB) {
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
    r.get("/search", (req: Request, res: Response) => {
        const term_id = String(req.query.term_id || "").trim();
        const q = String(req.query.q || "").trim();
        if (!term_id || !q) return res.json([]);

        const { subject, course } = parseBaseLike(q);
        try {
            if (subject && course) {
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
            const offerings = fetchOfferings(db, term_id, subject, course, includeMeetings, includeInstr, onlyOpen);
            res.json(offerings);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* --------------- GET /offerings_by_base (no redirect) --------------- */
    r.get("/offerings_by_base", (req: Request, res: Response) => {
        const term_id = String(req.query.term_id || "").trim();
        const base = String(req.query.base || "").trim();
        if (!term_id || !base) return res.status(400).json({ error: "term_id and base are required" });

        const includeRaw = String(req.query.include || "").toLowerCase();
        const includeMeetings = includeRaw.includes("meetings");
        const includeInstr = includeRaw.includes("instructors");
        const onlyOpen = String(req.query.only_open || "") === "1";

        const { subject, course } = parseBaseLike(base);
        if (!subject || !course) return res.json([]);

        try {
            const offerings = fetchOfferings(db, term_id, subject, course, includeMeetings, includeInstr, onlyOpen);
            res.json(offerings);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    return r;
}


// --- OPTIONAL: server/src/index.ts ---
// If you *use* index.ts as the entrypoint, make it import default routers.
// Otherwise, delete this file or add it to tsconfig.json "exclude".
/*
import express from "express";
import Database from "better-sqlite3";
import createVizRouter from "./viz_api.js";
import createSchedRouter from "./sched_api.js";

const app = express();
const db = new Database(process.env.DB_PATH || "./prereqs.db");

app.use(express.json());
app.use("/api/viz", createVizRouter(db));
app.use("/api/sched", createSchedRouter(db));

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API on :${PORT}`));
*/
