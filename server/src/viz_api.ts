// server/src/viz_api.ts
import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";

export default function createVizRouter(db: Database) {
    const r = Router();

    // helper: check if a column exists
    function tableHasColumn(table: string, col: string): boolean {
        const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        return rows.some((x) => x.name === col);
    }

    // Which RMP column name your DB uses (you already had this)
    const WTA_COL_RMP =
        tableHasColumn("rmp_professors", "would_take_again_pct")
            ? "would_take_again_pct"
            : tableHasColumn("rmp_professors", "would_take_again_percent")
                ? "would_take_again_percent"
                : null;

    /* ================== NEW: /api/viz/professors ================== */
    r.get("/professors", (req: Request, res: Response) => {
        const q = String(req.query.q ?? "").trim();
        const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 2000));

        // detect columns on viz_professors
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

        const cols = `
      vp.legacy_id,
      vp.first_name, vp.last_name,
      ${hasDept ? "vp.department" : "NULL AS department"},
      ${hasFaculty ? "vp.faculty" : "NULL AS faculty"},
      ${hasAvg ? "vp.avg_rating" : "NULL AS avg_rating"},
      ${hasDiff ? "vp.avg_difficulty" : "NULL AS avg_difficulty"},
      ${wtaColVp ? `vp.${wtaColVp} AS would_take_again_pct` : "NULL AS would_take_again_pct"},
      ${hasNum ? "vp.num_ratings" : "NULL AS num_ratings"}
    `;

        let where = "";
        const params: any[] = [];
        if (q) {
            where = "WHERE (vp.first_name || ' ' || vp.last_name) LIKE ?";
            params.push(`%${q}%`);
        }

        const order = hasNum ? "ORDER BY COALESCE(vp.num_ratings,0) DESC" : "";
        const sql = `SELECT ${cols} FROM viz_professors vp ${where} ${order} LIMIT ?`;
        params.push(limit);

        try {
            const rows = db.prepare(sql).all(...params);
            res.json(rows);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    /* ================== existing routes (keep yours) ================== */

    // /api/viz/sections (yours)
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

    // /api/viz/course_stats (yours) ...
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

    // sections_by_prof (yours)
    r.get("/sections_by_prof", (req, res) => {
        const tid = String(req.query.tid || "").trim();
        if (!tid) return res.status(400).json({ error: "tid required" });

        const rows = db.prepare(`
            SELECT campus, year, session, subject, course, section, instructor, enrolled, avg,
                rmp_tid, avg_rating, avg_difficulty, would_take_again_pct, num_ratings
            FROM viz_sections_with_rmp
            WHERE rmp_tid = ?
            ORDER BY year DESC, session DESC, subject ASC, course ASC, section ASC
        `).all(tid);

        res.json(rows);
    });

    // professor (yours)
// server/src/viz_api.ts (inside createVizRouter)
    r.get("/professors", (req, res) => {
        const q = String(req.query.q ?? "").trim();
        const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 2000));

        // column presence
        const hasDept    = tableHasColumn("viz_professors", "department");
        const hasFaculty = tableHasColumn("viz_professors", "faculty");
        const hasNum     = tableHasColumn("viz_professors", "num_ratings");
        const hasAvg     = tableHasColumn("viz_professors", "avg_rating");
        const hasDiff    = tableHasColumn("viz_professors", "avg_difficulty");
        const wtaVp =
            tableHasColumn("viz_professors", "would_take_again_pct")
                ? "would_take_again_pct"
                : tableHasColumn("viz_professors", "would_take_again_percent")
                    ? "would_take_again_percent"
                    : null;

        const wtaRp =
            tableHasColumn("rmp_professors", "would_take_again_pct")
                ? "would_take_again_pct"
                : tableHasColumn("rmp_professors", "would_take_again_percent")
                    ? "would_take_again_percent"
                    : null;

        // select list with COALESCE to RMP when VP is null/missing
        const cols = `
    vp.legacy_id,
    vp.first_name, vp.last_name,
    ${hasDept    ? "vp.department" : "NULL AS department"},
    ${hasFaculty ? "vp.faculty"    : "NULL AS faculty"},
    ${hasAvg     ? "COALESCE(vp.avg_rating, rp.avg_rating)"           : "rp.avg_rating"} AS avg_rating,
    ${hasDiff    ? "COALESCE(vp.avg_difficulty, rp.avg_difficulty)"   : "rp.avg_difficulty"} AS avg_difficulty,
    ${
            wtaVp && wtaRp
                ? `COALESCE(vp.${wtaVp}, rp.${wtaRp})`
                : wtaVp
                    ? `vp.${wtaVp}`
                    : wtaRp
                        ? `rp.${wtaRp}`
                        : "NULL"
        } AS would_take_again_pct,
    ${hasNum ? "COALESCE(vp.num_ratings, rp.num_ratings)" : "rp.num_ratings"} AS num_ratings
  `;

        let where = "";
        const params: any[] = [];
        if (q) {
            where = "WHERE LOWER(vp.first_name || ' ' || vp.last_name) LIKE ?";
            params.push(`%${q.toLowerCase()}%`);
        }

        const sql = `
    SELECT ${cols}
    FROM viz_professors vp
    LEFT JOIN rmp_professors rp ON rp.legacy_id = vp.legacy_id
    ${where}
    ORDER BY COALESCE(vp.num_ratings, rp.num_ratings, 0) DESC
    LIMIT ?
  `;
        params.push(limit);

        try {
            const rows = db.prepare(sql).all(...params);
            res.json(rows);
        } catch (err: any) {
            res.status(500).json({ error: String(err) });
        }
    });

    return r;
}
