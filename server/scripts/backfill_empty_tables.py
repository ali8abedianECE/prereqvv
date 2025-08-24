# server/scripts/backfill_empty_tables.py
# -*- coding: utf-8 -*-
import os, re, sqlite3, math
from difflib import SequenceMatcher
from concurrent.futures import ProcessPoolExecutor, as_completed

DB = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "prereqs.db"))

# ---- small helpers ---------------------------------------------------------
def table_exists(cur, name):
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?;", (name,))
    return cur.fetchone() is not None

def table_empty(cur, name):
    cur.execute(f"SELECT COUNT(*) FROM {name}")
    return cur.fetchone()[0] == 0

def pragma_cols(cur, table):
    cur.execute(f"PRAGMA table_info({table})")
    return [{"name": r[1], "type": (r[2] or "").upper(), "notnull": int(r[3]) == 1, "pk": int(r[5]) == 1} for r in cur.fetchall()]

def norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[.,'`\"()\-]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s

def tokenize(s: str):
    return tuple(t for t in norm_name(s).split() if t)

def last_token(s: str) -> str:
    toks = tokenize(s)
    return toks[-1] if toks else ""

# ---- instructors -----------------------------------------------------------
def ensure_instructors_schema(cur):
    if not table_exists(cur, "instructors"):
        cur.execute("""
                    CREATE TABLE instructors(
                                                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                                                name TEXT NOT NULL,
                                                norm TEXT NOT NULL UNIQUE
                    );
                    """)
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_instructors_norm ON instructors(norm)")
        print("[instructors] created")
        return
    print("[instructors] schema OK")

def backfill_instructors(cur):
    if not table_exists(cur, "grades_prof_course"):
        print("[instructors] grades_prof_course missing; skip")
        return
    src_cols = {c["name"] for c in pragma_cols(cur, "grades_prof_course")}
    if "instructor" not in src_cols:
        print("[instructors] grades_prof_course.instructor missing; skip")
        return
    print("[instructors] populating…")
    cur.execute("""
                INSERT OR IGNORE INTO instructors(name, norm)
                SELECT DISTINCT TRIM(instructor) AS name,
                                LOWER(REPLACE(REPLACE(REPLACE(TRIM(instructor),'.',''),',',''),'  ',' ')) AS norm
                FROM grades_prof_course
                WHERE instructor IS NOT NULL AND TRIM(instructor) <> ''
                """)
    cur.execute("SELECT COUNT(*) FROM instructors")
    print(f"[instructors] rows={cur.fetchone()[0]}")

# ---- pair_sections (aggregate → unique) ------------------------------------
def ensure_pair_sections_schema(cur):
    if not table_exists(cur, "pair_sections"):
        cur.execute("""
                    CREATE TABLE pair_sections(
                                                  id         INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  campus     TEXT NOT NULL,
                                                  subject    TEXT NOT NULL,
                                                  course     TEXT NOT NULL,
                                                  section    TEXT NOT NULL,
                                                  year       INTEGER,
                                                  session    TEXT,
                                                  title      TEXT,
                                                  detail     TEXT,
                                                  component  TEXT NOT NULL DEFAULT '',
                                                  enrolled   INTEGER,
                                                  avg        REAL,
                                                  profs_raw  TEXT
                    );
                    """)
        cur.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_pair_sections
                        ON pair_sections(campus,subject,course,section,year,session,component)
                    """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ps_key ON pair_sections(campus,subject,course,section,year)")
        print("[pair_sections] created")
    else:
        print("[pair_sections] table exists")

def backfill_pair_sections(cur):
    if not table_exists(cur, "grades_prof_course"):
        print("[pair_sections] grades_prof_course missing; skip")
        return
    dst_cols = {c["name"] for c in pragma_cols(cur, "pair_sections")}
    src_cols = {c["name"] for c in pragma_cols(cur, "grades_prof_course")}
    key_cols = [c for c in ("campus","subject","course","section","year","session","component") if c in src_cols and c in dst_cols]
    if not key_cols:
        print("[pair_sections] no common key columns; skip")
        return

    print(f"[pair_sections] aggregating by keys: {', '.join([k for k in key_cols if k!='component'])}")
    select_parts = key_cols[:]
    # non-key aggregates
    select_parts.append("MIN(title) AS title" if "title" in src_cols else "'' AS title")
    select_parts.append("MIN(detail) AS detail" if "detail" in src_cols else "'' AS detail")
    select_parts.append("MAX(enrolled) AS enrolled" if "enrolled" in src_cols else "0 AS enrolled")
    select_parts.append("AVG(avg) AS avg" if "avg" in src_cols else "0.0 AS avg")
    if "instructor" in src_cols:
        select_parts.append("GROUP_CONCAT(DISTINCT instructor) AS profs_raw")
    else:
        select_parts.append("'' AS profs_raw")

    insert_cols = key_cols + ["title","detail","enrolled","avg","profs_raw"]
    cur.execute(f"""
        INSERT OR REPLACE INTO pair_sections ({", ".join(insert_cols)})
        SELECT {", ".join(select_parts)}
        FROM grades_prof_course
        WHERE campus IS NOT NULL AND TRIM(campus) <> ''
          AND subject IS NOT NULL AND TRIM(subject) <> ''
          AND course  IS NOT NULL AND TRIM(course)  <> ''
          AND section IS NOT NULL AND TRIM(section) <> ''
        GROUP BY {", ".join(key_cols)}
    """)
    cur.execute("SELECT COUNT(*) FROM pair_sections")
    print(f"[pair_sections] rows={cur.fetchone()[0]}")

# ---- match instructors ↔ RMP (parallel, blocked, looser) -------------------
def ensure_match_schema(cur):
    if not table_exists(cur, "instructor_rmp_match"):
        cur.execute("""
                    CREATE TABLE instructor_rmp_match(
                                                         instructor_id  INTEGER NOT NULL,
                                                         rmp_legacy_id  TEXT    NOT NULL,
                                                         confidence     REAL    NOT NULL DEFAULT 1.0,
                                                         PRIMARY KEY(instructor_id, rmp_legacy_id),
                                                         FOREIGN KEY(instructor_id) REFERENCES instructors(id)
                    );
                    """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_match_instr ON instructor_rmp_match(instructor_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_match_rmp   ON instructor_rmp_match(rmp_legacy_id)")
        print("[match] created")
    else:
        print("[match] schema OK")

def _ratio(a: str, b: str) -> float:
    # token-aware max of two ratios (cheap but effective)
    ra = SequenceMatcher(None, norm_name(a), norm_name(b)).ratio()
    rb = SequenceMatcher(None, " ".join(sorted(tokenize(a))), " ".join(sorted(tokenize(b)))).ratio()
    return ra if ra > rb else rb

def _best_match_one(args):
    iid, iname, threshold, rmp_rows, token_index, last_index, cap = args
    toks = set(tokenize(iname))
    last = last_token(iname)
    candidates = set()
    # block by tokens
    for t in toks:
        if t in token_index:
            candidates.update(token_index[t])
    # also block by last name
    if last and last in last_index:
        candidates.update(last_index[last])

    if not candidates:
        # final fallback: everything (but cap)
        candidates = set(range(len(rmp_rows)))
    # trim candidate universe
    if cap and len(candidates) > cap:
        # rough prefilter by simple substring overlap to shrink
        pre = []
        nin = " ".join(sorted(toks))
        for idx in candidates:
            _, rname = rmp_rows[idx]
            rnin = " ".join(sorted(tokenize(rname)))
            # quick char overlap score
            inter = len(set(nin) & set(rnin))
            pre.append((inter, idx))
        pre.sort(reverse=True)
        candidates = set(idx for _, idx in pre[:cap])

    best_score, best_legacy = 0.0, None
    for idx in candidates:
        legacy, rname = rmp_rows[idx]
        s = _ratio(iname, rname)
        if s > best_score:
            best_score, best_legacy = s, legacy
    if best_legacy and best_score >= threshold:
        return (iid, best_legacy, float(best_score))
    return None

def backfill_matches_parallel(con, threshold=0.85):
    cur = con.cursor()
    # exact matches first
    cur.execute("""
                INSERT OR IGNORE INTO instructor_rmp_match(instructor_id, rmp_legacy_id, confidence)
                SELECT i.id, r.legacy_id, 1.0
                FROM instructors i
                         JOIN (
                    SELECT legacy_id,
                           LOWER(REPLACE(REPLACE(REPLACE(TRIM(first_name||' '||last_name),'.',''),',',''),'  ',' ')) AS norm
                    FROM rmp_professors
                ) r ON r.norm = i.norm
                """)
    con.commit()
    cur.execute("SELECT COUNT(*) FROM instructor_rmp_match")
    print(f"[match] after exact rows={cur.fetchone()[0]}")

    # pull unmapped
    cur.execute("""
                SELECT id, name FROM instructors
                WHERE id NOT IN (SELECT instructor_id FROM instructor_rmp_match)
                """)
    unmapped = cur.fetchall()
    if not unmapped:
        print("[match] nothing to fuzzy-match")
        return

    cur.execute("SELECT legacy_id, first_name||' '||last_name FROM rmp_professors")
    rmp_rows = cur.fetchall()
    if not rmp_rows:
        print("[match] rmp_professors empty; skip fuzzy")
        return

    # build blocking indexes
    token_index = {}   # token -> list of indices in rmp_rows
    last_index  = {}   # last token -> list
    for idx, (legacy, rname) in enumerate(rmp_rows):
        toks = set(tokenize(rname))
        for t in toks:
            token_index.setdefault(t, []).append(idx)
        lt = last_token(rname)
        if lt:
            last_index.setdefault(lt, []).append(idx)

    workers = max(1, int(os.environ.get("MATCH_WORKERS", os.cpu_count() or 4)))
    cap = int(os.environ.get("MATCH_CANDIDATE_CAP", "200"))  # limit candidate set per instructor

    args_iter = ((iid, iname, threshold, rmp_rows, token_index, last_index, cap) for iid, iname in unmapped)

    inserts = []
    done, total = 0, len(unmapped)
    print(f"[match] fuzzy starting: {total} instructors, workers={workers}, threshold={threshold}, cap={cap}")

    with ProcessPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_best_match_one, a) for a in args_iter]
        for f in as_completed(futures):
            res = f.result()
            if res:
                inserts.append(res)
            done += 1
            if done % max(100, total // 50 or 1) == 0 or done == total:
                pct = (done * 100.0) / total
                print(f"[match] {done}/{total} ({pct:.1f}%) matched={len(inserts)}")

    if inserts:
        cur.executemany("""
                        INSERT OR IGNORE INTO instructor_rmp_match(instructor_id, rmp_legacy_id, confidence)
            VALUES (?,?,?)
                        """, inserts)
        con.commit()
    cur.execute("SELECT COUNT(*) FROM instructor_rmp_match")
    print(f"[match] final rows={cur.fetchone()[0]} (+{len(inserts)} fuzzy)")

# ---- main ------------------------------------------------------------------
def main():
    print(f"[db] {DB}")
    con = sqlite3.connect(DB)
    # speed up bulk writes
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=OFF;")
    con.execute("PRAGMA temp_store=MEMORY;")
    con.execute("PRAGMA mmap_size=3000000000;")  # best-effort

    try:
        cur = con.cursor()
        ensure_instructors_schema(cur)
        ensure_pair_sections_schema(cur)
        ensure_match_schema(cur)
        con.commit()

        backfill_instructors(cur)
        con.commit()

        backfill_pair_sections(cur)
        con.commit()

        # looser threshold; override via env RMP_FUZZY_THRESHOLD
        thr = float(os.environ.get("RMP_FUZZY_THRESHOLD", "0.85"))
        backfill_matches_parallel(con, threshold=thr)

    finally:
        con.close()

if __name__ == "__main__":
    main()
