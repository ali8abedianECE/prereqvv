-- courses
CREATE TABLE IF NOT EXISTS courses (
                                       id TEXT PRIMARY KEY,
                                       title TEXT,
                                       credits TEXT,
                                       prereq_text TEXT,
                                       tree_json TEXT
);

-- constraints per course (year standing, GPA, etc.)
CREATE TABLE IF NOT EXISTS constraints (
                                           id INTEGER PRIMARY KEY AUTOINCREMENT,
                                           course_id TEXT NOT NULL,
                                           type TEXT NOT NULL,               -- YEAR_STANDING | GPA_MIN | PERCENT_MIN | CREDITS_AT_LEAST
                                           year_min INTEGER,
                                           value REAL,
                                           credits_min INTEGER,
                                           subject TEXT,
                                           level_min INTEGER,
                                           courses_json TEXT,
                                           FOREIGN KEY(course_id) REFERENCES courses(id)
    );

-- prerequisite/co-requisite edges: prereq -> target
CREATE TABLE IF NOT EXISTS edges (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     source_id TEXT NOT NULL,
                                     target_id TEXT NOT NULL,
                                     kind TEXT NOT NULL,               -- REQ | OR | CO_REQ
                                     group_id TEXT,                    -- same group_id for the same ONE-OF cluster
                                     FOREIGN KEY(source_id) REFERENCES courses(id),
    FOREIGN KEY(target_id) REFERENCES courses(id)
    );

CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
-- optional: avoid duplicate edges if you re-import
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
    ON edges(source_id, target_id, kind, IFNULL(group_id, ''));
