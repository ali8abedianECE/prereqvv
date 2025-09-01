// server/src/viz_api.ts
import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";

export default function createVizRouter(db: Database) {
    const r = Router();

    /* ---------------- helpers ---------------- */
    function tableHasColumn(table: string, col: string): boolean {
        const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        return rows.some((x) => x.name === col);
    }

    function normName(s: string) {
        return (s || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[^a-z\s]/g, "")
            .replace(/\s+/g, " ");
    }

    // Which RMP column name your DB uses
    const WTA_COL_RMP =
        tableHasColumn("rmp_professors", "would_take_again_pct")
            ? "would_take_again_pct"
            : tableHasColumn("rmp_professors", "would_take_again_percent")
                ? "would_take_again_percent"
                : null;

    /* =========================================================
       /api/viz/professors  (search)
       ========================================================= */
    r.get("/professors", (req: Request, res: Response) => {
        const q = String(req.query.q ?? "").trim();
        const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 2000));

        const hasDept = tableHasColumn("viz_professors", "department");
        const hasFaculty = tableHasColumn("viz_professors", "faculty");
        const hasNum = tableHasColumn("viz_professors", "num_ratings");
        const hasAvg = tableHasColumn("viz_professors", "avg_rating");
        const hasDiff = tableHasColumn("viz_professors", "avg_difficulty");

        const wtaColVp = tableHasColumn("viz_professors", "would_take_again_pct")
            ? "would_take_again_pct"
            : tableHasColumn("viz_professors", "would_take_again_percent")
                ? "would_take_again_percent"
                : null;

        const wtaColRp = tableHasColumn("rmp_professors", "would_take_again_pct")
            ? "would_take_again_pct"
            : tableHasColumn("rmp_professors", "would_take_again_percent")
                ? "would_take_again_percent"
                : null;

        const cols = `
      vp.legacy_id,
      vp.first_name, vp.last_name,
      ${hasDept ? "vp.department" : "NULL AS department"},
      ${hasFaculty ? "vp.faculty" : "NULL AS faculty"},
      ${hasAvg ? "COALESCE(vp.avg_rating, rp.avg_rating)" : "rp.avg_rating"} AS avg_rating,
      ${hasDiff ? "COALESCE(vp.avg_difficulty, rp.avg_difficulty)" : "rp.avg_difficulty"} AS avg_difficulty,
      ${
            wtaColVp && wtaColRp
                ? `COALESCE(vp.${wtaColVp}, rp.${wtaColRp})`
                : wtaColVp
                    ? `vp.${wtaColVp}`
                    : wtaColRp
                        ? `rp.${wtaColRp}`
                        : "NULL"
        } AS would_take_again_pct,
      ${hasNum ? "COALESCE(vp.num_ratings, rp.num_ratings)" : "rp.num_ratings"} AS num_ratings,
      rp.url
    `;

        const where = q ? "WHERE LOWER(vp.first_name || ' ' || vp.last_name) LIKE ?" : "";
        const params: any[] = q ? [`%${q.toLowerCase()}%`, limit] : [limit];

        const sql = `
            SELECT ${cols}
            FROM viz_professors vp
                     LEFT JOIN rmp_professors rp ON rp.legacy_id = vp.legacy_id
                ${where}
            ORDER BY COALESCE(vp.num_ratings, rp.num_ratings, 0) DESC
                LIMIT ?
        `;

        try {
            const rows = db.prepare(sql).all(...params);
            res.json(rows);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* =========================================================
       /api/viz/sections  (yours)
       ========================================================= */
    r.get("/sections", (req: Request, res: Response) => {
        const tid = String(req.query.tid || "").trim();
        if (tid) {
            const rows = db
                .prepare(
                    `SELECT campus, subject, course, section, year, session, title, instructor,
                         enrolled, avg, rmp_tid, avg_rating, avg_difficulty, would_take_again_pct, num_ratings
                     FROM viz_sections_with_rmp
                     WHERE rmp_tid = ?
                     ORDER BY year DESC, session DESC, subject ASC, course ASC, section ASC`
                )
                .all(tid);
            return res.json(rows);
        }

        const subject = String(req.query.subject || "").toUpperCase().trim();
        const course = String(req.query.course || "").toUpperCase().trim();
        if (!subject || !course) return res.status(400).json({ error: "subject & course required" });

        const rows = db
            .prepare(
                `SELECT campus, subject, course, section, year, session, title, instructor,
                     enrolled, avg, rmp_tid, avg_rating, avg_difficulty, would_take_again_pct, num_ratings
                 FROM viz_sections_with_rmp
                 WHERE subject = ? AND course = ?
                 ORDER BY year DESC, session DESC, section ASC`
            )
            .all(subject, course);

        res.json(rows);
    });

    /* =========================================================
       /api/viz/course_stats  (yours)
       ========================================================= */
    const courseStatsHandler = (req: Request, res: Response) => {
        const raw = String(req.query.course_code || "").toUpperCase().replace(/\s+/g, "");
        if (!raw) return res.status(400).json({ error: "course_code required (e.g. CPEN211)" });

        const wtaSelect = WTA_COL_RMP
            ? `COALESCE(vcs.would_take_again_percent, rp.${WTA_COL_RMP}) AS would_take_again_pct`
            : `vcs.would_take_again_percent AS would_take_again_pct`;

        const sql = `
            SELECT
                vcs.course_code,
                vcs.professor_legacy_id AS tid,
                rp.avg_rating AS avg_rating,
                COALESCE(vcs.avg_difficulty, rp.avg_difficulty) AS avg_difficulty,
                ${wtaSelect},
                COALESCE(vcs.num_ratings, rp.num_ratings) AS num_ratings
            FROM viz_course_stats AS vcs
                     LEFT JOIN rmp_professors AS rp
                               ON rp.legacy_id = vcs.professor_legacy_id
            WHERE REPLACE(vcs.course_code, ' ', '') = ?
            ORDER BY
                CASE WHEN COALESCE(vcs.num_ratings, rp.num_ratings) IS NULL THEN 1 ELSE 0 END,
                COALESCE(vcs.num_ratings, rp.num_ratings) DESC
        `;
        const rows = db.prepare(sql).all(raw);
        res.json(rows);
    };
    r.get("/course_stats", courseStatsHandler);
    r.get("/course-stats", courseStatsHandler);

    /* =========================================================
       /api/viz/sections_by_prof  (yours)
       ========================================================= */
    r.get("/sections_by_prof", (req: Request, res: Response) => {
        const tid = String(req.query.tid || "").trim();
        if (!tid) return res.status(400).json({ error: "tid required" });

        const rows = db
            .prepare(
                `SELECT campus, year, session, subject, course, section, instructor, enrolled, avg,
                     rmp_tid, avg_rating, avg_difficulty, would_take_again_pct, num_ratings
                 FROM viz_sections_with_rmp
                 WHERE rmp_tid = ?
                 ORDER BY year DESC, session DESC, subject ASC, course ASC, section ASC`
            )
            .all(tid);

        res.json(rows);
    });

    /* =========================================================
       /api/viz/professor_overview  (NEW)
       - details (RMP)
       - all sections
       - per-course summary
       - detailed CSV bins if present (prof_course_grade_bins)
       - fallback histogram from section averages if no bins
       ========================================================= */
    r.get("/professor_overview", (req: Request, res: Response) => {
        const tid = String(req.query.tid || "").trim();
        if (!tid) return res.status(400).json({ error: "tid required" });
        const binsReq = Math.min(60, Math.max(8, Number(req.query.bins) || 24));

        // professor details (prefer RMP; can be extended to COALESCE with viz_professors if needed)
        const prof = db
            .prepare(
                `
        SELECT legacy_id, first_name, last_name, department,
               avg_rating, avg_difficulty,
               ${WTA_COL_RMP ? `${WTA_COL_RMP} AS would_take_again_pct` : "would_take_again_percent AS would_take_again_pct"},
               num_ratings, url
        FROM rmp_professors
        WHERE legacy_id = ?
      `
            )
            .get(tid);

        // all sections taught (joined view)
        const sections = db
            .prepare(
                `
        SELECT campus, year, session, subject, course, section, title, instructor,
               enrolled, avg, rmp_tid, avg_rating, avg_difficulty, would_take_again_pct, num_ratings
        FROM viz_sections_with_rmp
        WHERE rmp_tid = ?
        ORDER BY year DESC, session DESC, subject ASC, course ASC, section ASC
      `
            )
            .all(tid) as Array<{
            campus: string;
            year: number;
            session: string;
            subject: string;
            course: string;
            section: string;
            title: string;
            instructor: string;
            enrolled: number | null;
            avg: number | null;
            rmp_tid: string | null;
            avg_rating: number | null;
            avg_difficulty: number | null;
            would_take_again_pct: number | null;
            num_ratings: number | null;
        }>;

        // per-course rollup
        const perCourse = db
            .prepare(
                `
        SELECT subject || ' ' || course AS course_code,
               COUNT(*) AS n_sections,
               AVG(avg) AS avg_of_avg,
               SUM(enrolled) AS total_enrolled,
               MIN(year) AS first_year,
               MAX(year) AS last_year
        FROM viz_sections_with_rmp
        WHERE rmp_tid = ?
        GROUP BY subject, course
        ORDER BY course_code ASC
      `
            )
            .all(tid);

        // CSV bins: align by normalized instructor name AND restrict to the same section keys as the tid
        let bins: Array<{ bin_label: string; count: number }> = [];
        const anyName = db
            .prepare(`SELECT DISTINCT instructor FROM viz_sections_with_rmp WHERE rmp_tid = ? LIMIT 1`)
            .get(tid) as { instructor?: string } | undefined;

        if (anyName?.instructor && tableHasColumn("prof_course_grade_bins", "bin_label")) {
            const key = normName(anyName.instructor);
            bins = db
                .prepare(
                    `
          SELECT bin_label, SUM(count) AS count
          FROM prof_course_grade_bins
          WHERE instructor_norm = ?
            AND (campus,subject,course,section,year,session) IN (
              SELECT campus,subject,course,section,year,session
              FROM viz_sections_with_rmp WHERE rmp_tid = ?
            )
          GROUP BY bin_label
        `
                )
                .all(key, tid) as any;
        }

        // Fallback histogram from section averages, if no bins present
        let hist: Array<{ x0: number; x1: number; c: number }> = [];
        if (!bins?.length) {
            const avgsRows = db
                .prepare(`SELECT avg FROM viz_sections_with_rmp WHERE rmp_tid = ? AND avg IS NOT NULL`)
                .all(tid) as Array<{ avg: number }>;
            if (avgsRows.length) {
                const vals = avgsRows.map((v) => Number(v.avg)).filter((v) => Number.isFinite(v));
                if (vals.length) {
                    const lo = Math.max(0, Math.floor(Math.min(...vals)));
                    const hi = Math.min(100, Math.ceil(Math.max(...vals)));
                    const step = Math.max(1, Math.ceil((hi - lo) / binsReq));
                    const edges: number[] = [];
                    for (let x = lo; x < hi; x += step) edges.push(x);
                    edges.push(hi);
                    const counts = Array(edges.length - 1).fill(0);
                    for (const v of vals) {
                        let idx = Math.floor((v - lo) / step);
                        if (idx < 0) idx = 0;
                        if (idx >= counts.length) idx = counts.length - 1;
                        counts[idx] += 1;
                    }
                    hist = counts.map((c, i) => ({ x0: edges[i], x1: edges[i + 1], c }));
                }
            }
        }

        res.json({ prof: prof || null, sections, perCourse, bins, hist });
    });

    return r;
}
