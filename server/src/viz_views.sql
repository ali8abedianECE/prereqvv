DROP VIEW IF EXISTS viz_sections_with_rmp;

CREATE VIEW viz_sections_with_rmp AS
SELECT
    s.campus, s.subject, s.course, s.section, s.year, s.session,
    s.title, s.instructor, s.enrolled, s.avg,
    m.rmp_tid,
    rp.avg_rating, rp.avg_difficulty, rp.num_ratings, rp.would_take_again_pct
FROM viz_sections s
         LEFT JOIN instructor_rmp_match m
                   ON LOWER(TRIM(s.instructor)) = LOWER(TRIM(m.instructor))
         LEFT JOIN rmp_professors rp
                   ON rp.legacy_id = m.rmp_tid;
