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

    // Figure out which RMP column name your DB uses
    const WTA_COL =
        tableHasColumn("rmp_professors", "would_take_again_pct")
            ? "would_take_again_pct"
            : tableHasColumn("rmp_professors", "would_take_again_percent")
                ? "would_take_again_percent"
                : null;

    // /api/viz/sections?subject=CPEN&course=211
    r.get("/sections", (req: Request, res: Response) => {
        const subject = String(req.query.subject || "").toUpperCase().trim();
        const course = String(req.query.course || "").toUpperCase().trim();
        if (!subject || !course) return res.status(400).json({ error: "subject & course required" });

        const rows = db
            .prepare(
                `SELECT campus, subject, course, section, year, session, title, instructor,
                     enrolled, avg,
                     rmp_tid,
                     avg_rating, avg_difficulty, would_take_again_pct, num_ratings
                 FROM viz_sections_with_rmp
                 WHERE subject = ? AND course = ?
                 ORDER BY year DESC, session DESC, section ASC`
            )
            .all(subject, course);

        res.json(rows);
    });

    // /api/viz/course_stats and /api/viz/course-stats
    const courseStatsHandler = (req: Request, res: Response) => {
        const raw = String(req.query.course_code || "").toUpperCase().replace(/\s+/g, "");
        if (!raw) return res.status(400).json({ error: "course_code required (e.g. CPEN211)" });

        // Build SELECT for would_take_again using whichever column name exists
        const wtaSelect = WTA_COL
            ? `COALESCE(vcs.would_take_again_percent, rp.${WTA_COL}) AS would_take_again_pct`
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

    // optional: quick professor search
    r.get("/professors", (req: Request, res: Response) => {
        const q = String(req.query.q || "").trim();
        const args = q ? [`%${q.toUpperCase()}%`] : [];
        const rows = db
            .prepare(
                q
                    ? `SELECT * FROM viz_professors
                       WHERE UPPER(first_name || ' ' || last_name) LIKE ?
                       ORDER BY num_ratings DESC LIMIT 50`
                    : `SELECT * FROM viz_professors
                       ORDER BY num_ratings DESC LIMIT 50`
            )
            .all(...args);
        res.json(rows);
    });

    return r;
}
