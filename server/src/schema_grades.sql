PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS grades_courses (
                                              id INTEGER PRIMARY KEY,
                                              subject TEXT NOT NULL,
                                              number TEXT NOT NULL,
                                              UNIQUE(subject, number)
    );

CREATE TABLE IF NOT EXISTS grades_sections (
                                               id INTEGER PRIMARY KEY,
                                               course_id INTEGER NOT NULL REFERENCES grades_courses(id) ON DELETE CASCADE,
    campus TEXT NOT NULL,              -- UBCV/UBCO mapped to V/O
    year INTEGER NOT NULL,             -- e.g., 2024
    session TEXT NOT NULL,             -- e.g., 'W' or 'S'
    section TEXT NOT NULL,             -- e.g., 'OVERALL', '101'
    average REAL,                      -- average grade
    enrolled INTEGER,                  -- optional if present
    passed INTEGER,                    -- optional if present
    failed INTEGER,                    -- optional if present
    title TEXT,                        -- optional if present
    UNIQUE(course_id, campus, year, session, section)
    );

CREATE TABLE IF NOT EXISTS grades_instructors (
                                                  id INTEGER PRIMARY KEY,
                                                  name TEXT NOT NULL,
                                                  UNIQUE(name)
    );

CREATE TABLE IF NOT EXISTS grades_section_instructors (
                                                          section_id INTEGER NOT NULL REFERENCES grades_sections(id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES grades_instructors(id) ON DELETE CASCADE,
    PRIMARY KEY (section_id, instructor_id)
    );

CREATE INDEX IF NOT EXISTS idx_grades_sections_course ON grades_sections(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_sections_recent ON grades_sections(year, session);
CREATE INDEX IF NOT EXISTS idx_grades_sections_avg ON grades_sections(average);
