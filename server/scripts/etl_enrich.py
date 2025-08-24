#!/usr/bin/env python3
import os, sys, csv, sqlite3, re
from pathlib import Path
from typing import Optional, List, Set, Dict, Tuple

DB_PATH   = os.environ.get("DB_FILE", "/Users/mohammadaliabedian/IdeaProjects/prereqvv/server/prereqs.db")
PAIR_ROOT = os.environ.get("PAIR_ROOT", "/Users/mohammadaliabedian/Downloads/ubc-pair-grade-data-master")
RMP_CSV   = os.environ.get("RMP_CSV", "ubc_professors_ratings.csv")

REQ_SUBJECT_KEYS: Set[str] = {"subject","dept","department"}
REQ_COURSE_KEYS:  Set[str] = {"course","number","catalog","catalog_number"}

REQ_SECTION_KEYS: Set[str] = {"section","sect"}
REQ_PROF_KEYS:    Set[str] = {"professor","prof","instructor","teacher"}
AVG_KEYS:         Set[str] = {"avg","average","mean"}
ENROL_KEYS:       Set[str] = {"enrolled","reported","enrol","enrollment"}
TITLE_KEYS:       Set[str] = {"title","course title","coursename","course_name"}
YEAR_KEYS:        Set[str] = {"year"}
SESSION_KEYS:     Set[str] = {"session","term"}

def lower_keys(d: Dict[str,str]) -> Dict[str,str]:
    return { (k or "").strip().lower(): (v if v is not None else "") for k,v in d.items() }

def pick_key(dlower: Dict[str,str], candidates: Set[str]) -> Optional[str]:
    for k in dlower.keys():
        if k in candidates: return k
    return None

def normalize_prof_name(raw: str) -> str:
    if not raw: return ""
    s = re.sub(r"\s+"," ",raw).strip()
    if "," in s:
        parts = [p.strip() for p in s.split(",")]
        if len(parts)>=2:
            s = f"{parts[1]} {parts[0]}".strip()
    return s

def split_professors(cell: str) -> List[str]:
    if not cell: return []
    s = cell.strip()
    parts = re.split(r";|\band\b| & ", s, flags=re.IGNORECASE)
    parts = [normalize_prof_name(p) for p in parts if p.strip()]
    if len(parts)==1 and s.count(",")>=3:
        toks = [t.strip() for t in s.split(",") if t.strip()]
        tmp: List[str] = []
        i = 0
        while i < len(toks):
            if i+1 < len(toks):
                tmp.append(normalize_prof_name(f"{toks[i]}, {toks[i+1]}"))
                i += 2
            else:
                tmp.append(normalize_prof_name(toks[i])); i += 1
        parts = [p for p in tmp if p]
    return parts

def get_table_columns(cur: sqlite3.Cursor, table: str) -> List[Tuple[int,str,int,int,Optional[str],int]]:
    cur.execute(f"PRAGMA table_info({table})")
    # cid, name, type, notnull, dflt_value, pk
    return cur.fetchall()

def columns_set(cur: sqlite3.Cursor, table: str) -> Set[str]:
    try:
        return { r[1] for r in get_table_columns(cur, table) }
    except sqlite3.OperationalError:
        return set()

def ensure_rmp_professors_schema(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='rmp_professors'")
    exists = cur.fetchone() is not None
    if exists:
        cols = columns_set(cur, "rmp_professors")
        if "legacy_id" not in cols:
            print("[migrate] replacing rmp_professors schema (missing legacy_id)")
            cur.execute("ALTER TABLE rmp_professors RENAME TO rmp_professors_old")
            con.commit()
            cur.execute("""
                        CREATE TABLE rmp_professors(
                                                       legacy_id TEXT PRIMARY KEY,
                                                       first_name TEXT,
                                                       last_name TEXT,
                                                       department TEXT,
                                                       avg_rating REAL,
                                                       num_ratings INTEGER,
                                                       avg_difficulty REAL,
                                                       would_take_again_percent REAL,
                                                       url TEXT
                        )""")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_rmp_last_first ON rmp_professors(last_name, first_name)")
            con.commit()
            old_cols = columns_set(cur, "rmp_professors_old")
            can_migrate = {"id","first_name","last_name","department","avg_rating","num_ratings","avg_difficulty","would_take_again_percent","url"}.issubset(old_cols)
            if can_migrate:
                cur.execute("""
                            INSERT INTO rmp_professors(legacy_id,first_name,last_name,department,avg_rating,num_ratings,avg_difficulty,would_take_again_percent,url)
                            SELECT id,first_name,last_name,department,avg_rating,num_ratings,avg_difficulty,would_take_again_percent,url
                            FROM rmp_professors_old
                            """)
                con.commit()
            cur.execute("DROP TABLE rmp_professors_old")
            con.commit()
        else:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_rmp_last_first ON rmp_professors(last_name, first_name)")
            con.commit()
    else:
        cur.execute("""
                    CREATE TABLE rmp_professors(
                                                   legacy_id TEXT PRIMARY KEY,
                                                   first_name TEXT,
                                                   last_name TEXT,
                                                   department TEXT,
                                                   avg_rating REAL,
                                                   num_ratings INTEGER,
                                                   avg_difficulty REAL,
                                                   would_take_again_percent REAL,
                                                   url TEXT
                    )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rmp_last_first ON rmp_professors(last_name, first_name)")
        con.commit()

def ensure_grades_prof_course_schema(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='grades_prof_course'")
    exists = cur.fetchone() is not None
    if not exists:
        cur.execute("""
                    CREATE TABLE grades_prof_course(
                                                       campus TEXT,
                                                       year INTEGER,
                                                       session TEXT,
                                                       subject TEXT,
                                                       course TEXT,
                                                       section TEXT,
                                                       title TEXT,
                                                       instructor TEXT,
                                                       enrolled INTEGER,
                                                       avg REAL,
                                                       source_file TEXT,
                                                       instructor_id TEXT  -- NULLABLE
                    )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_sc ON grades_prof_course(subject,course)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_prof ON grades_prof_course(instructor)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_campus ON grades_prof_course(campus)")
        con.commit()
        return

    info = get_table_columns(cur, "grades_prof_course")
    names = [r[1] for r in info]
    notnull = { r[1]: (r[3] == 1) for r in info }
    need_migration = False

    if "instructor_id" not in names:
        need_migration = True
    elif notnull.get("instructor_id", False):     # currently NOT NULL → must relax
        need_migration = True

    # Also normalize old column name 'professor' → 'instructor'
    has_professor = "professor" in names
    has_instructor = "instructor" in names
    if has_professor and not has_instructor:
        need_migration = True

    if not need_migration:
        # make sure indices exist
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_sc ON grades_prof_course(subject,course)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_prof ON grades_prof_course(instructor)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_campus ON grades_prof_course(campus)")
        con.commit()
        return

    # Rebuild with standard schema
    print("[migrate] rebuilding grades_prof_course (nullable instructor_id, instructor column)")
    cur.execute("PRAGMA foreign_keys=OFF")
    con.commit()
    cur.execute("""
                CREATE TABLE grades_prof_course_new(
                                                       campus TEXT,
                                                       year INTEGER,
                                                       session TEXT,
                                                       subject TEXT,
                                                       course TEXT,
                                                       section TEXT,
                                                       title TEXT,
                                                       instructor TEXT,
                                                       enrolled INTEGER,
                                                       avg REAL,
                                                       source_file TEXT,
                                                       instructor_id TEXT
                )""")
    # copy from old → new, mapping professor→instructor if needed
    if has_professor and not has_instructor:
        cur.execute("""
                    INSERT INTO grades_prof_course_new(campus,year,session,subject,course,section,title,instructor,enrolled,avg,source_file,instructor_id)
                    SELECT campus,year,session,subject,course,section,title,professor,enrolled,avg,source_file,
                        NULLIF(instructor_id,'')
                    FROM grades_prof_course
                    """)
    else:
        cur.execute("""
                    INSERT INTO grades_prof_course_new(campus,year,session,subject,course,section,title,instructor,enrolled,avg,source_file,instructor_id)
                    SELECT campus,year,session,subject,course,section,title,instructor,enrolled,avg,source_file,
                        NULLIF(instructor_id,'')
                    FROM grades_prof_course
                    """)
    con.commit()
    cur.execute("DROP TABLE grades_prof_course")
    cur.execute("ALTER TABLE grades_prof_course_new RENAME TO grades_prof_course")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_sc ON grades_prof_course(subject,course)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_prof ON grades_prof_course(instructor)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gpc_campus ON grades_prof_course(campus)")
    cur.execute("PRAGMA foreign_keys=ON")
    con.commit()

def ensure_schema(con: sqlite3.Connection) -> None:
    ensure_rmp_professors_schema(con)
    ensure_grades_prof_course_schema(con)
    cur = con.cursor()
    cur.execute("""
                CREATE TABLE IF NOT EXISTS rmp_instructor_map(
                                                                 instructor TEXT PRIMARY KEY,
                                                                 legacy_id TEXT
                )""")
    cur.execute("""
                CREATE TABLE IF NOT EXISTS grades_prof_course_summary(
                                                                         subject TEXT,
                                                                         course TEXT,
                                                                         instructor TEXT,
                                                                         n_sections INTEGER,
                                                                         n_enrolled INTEGER,
                                                                         avg_of_avg REAL,
                                                                         PRIMARY KEY(subject,course,instructor)
                    )""")
    con.commit()

def upsert_rmp_professors(con: sqlite3.Connection, csv_path: str) -> int:
    p = Path(csv_path)
    if not p.exists():
        print(f"[rmp] skip: {csv_path} not found")
        return 0
    with p.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = []
        for row in r:
            d = lower_keys(row)
            legacy = (d.get("legacy id") or d.get("legacy_id") or d.get("id") or "").strip()
            if not legacy: continue
            first = (d.get("first name") or d.get("first_name") or "").strip()
            last  = (d.get("last name")  or d.get("last_name")  or "").strip()
            dept  = (d.get("department") or "").strip()
            try: avg_rating = float(d.get("average rating") or d.get("avg_rating") or 0.0)
            except: avg_rating = 0.0
            try: num_r = int(float(d.get("number of ratings") or d.get("num_ratings") or 0))
            except: num_r = 0
            try: avg_diff = float(d.get("average difficulty") or d.get("avg_difficulty") or 0.0)
            except: avg_diff = 0.0
            try: wta = float(d.get("would take again %") or d.get("would_take_again_percent") or 0.0)
            except: wta = 0.0
            url = (d.get("rmp url") or d.get("url") or "").strip()
            rows.append((legacy,first,last,dept,avg_rating,num_r,avg_diff,wta,url))
    cur = con.cursor()
    cur.executemany("""
                    INSERT INTO rmp_professors(legacy_id,first_name,last_name,department,avg_rating,num_ratings,avg_difficulty,would_take_again_percent,url)
                    VALUES(?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(legacy_id) DO UPDATE SET
                        first_name=excluded.first_name,
                                                      last_name=excluded.last_name,
                                                      department=excluded.department,
                                                      avg_rating=excluded.avg_rating,
                                                      num_ratings=excluded.num_ratings,
                                                      avg_difficulty=excluded.avg_difficulty,
                                                      would_take_again_percent=excluded.would_take_again_percent,
                                                      url=excluded.url
                    """, rows)
    con.commit()
    print(f"[rmp] professors upserted: {len(rows)}")
    return len(rows)

def walk_pair_csvs(root: str) -> List[Path]:
    r = Path(root)
    if not r.exists(): return []
    out: List[Path] = []
    for p in r.rglob("*.csv"):
        if p.name.lower() == "directory_map.csv": continue
        out.append(p)
    return out

def parse_int(s):
    try: return int(float(str(s).strip()))
    except: return None

def parse_float(s):
    try: return float(str(s).strip())
    except: return None

def infer_campus(headers_lc: Set[str], row_lc: Dict[str,str], fallback_from_path: str) -> Optional[str]:
    if "campus" in headers_lc:
        v = (row_lc.get("campus") or "").strip().upper()
        if v in {"UBCV","UBCO"}: return v
        if v in {"V","VANCOUVER"}: return "UBCV"
        if v in {"O","OKANAGAN"}: return "UBCO"
    fp = fallback_from_path.upper()
    if "UBCO" in fp: return "UBCO"
    if "UBCV" in fp or "VANCOUVER" in fp: return "UBCV"
    return None

def ingest_pair(con: sqlite3.Connection, root: str) -> int:
    cur = con.cursor()
    csv_paths = walk_pair_csvs(root)
    if not csv_paths:
        print("[pair] no csv files found via PAIR_ROOT")
        return 0
    total = 0
    batch: List[Tuple] = []
    BATCH = 2000
    for path in csv_paths:
        with path.open(newline="", encoding="utf-8", errors="ignore") as f:
            try:
                reader = csv.DictReader(f)
            except Exception:
                continue
            headers_lc: Set[str] = set((h or "").strip().lower() for h in (reader.fieldnames or []))
            if not (headers_lc & REQ_SUBJECT_KEYS):  continue
            if not (headers_lc & REQ_COURSE_KEYS):   continue
            if not (headers_lc & REQ_SECTION_KEYS):  continue
            if not (headers_lc & REQ_PROF_KEYS):     continue
            for row in reader:
                dl = lower_keys(row)
                subj_k   = pick_key(dl, REQ_SUBJECT_KEYS);   subj = (dl.get(subj_k) or "").strip().upper() if subj_k else ""
                course_k = pick_key(dl, REQ_COURSE_KEYS);    course = (dl.get(course_k) or "").strip().upper() if course_k else ""
                sect_k   = pick_key(dl, REQ_SECTION_KEYS);   sect = (dl.get(sect_k) or "").strip().upper() if sect_k else ""
                prof_k   = pick_key(dl, REQ_PROF_KEYS);      prof_cell = (dl.get(prof_k) or "").strip() if prof_k else ""
                avg_k    = pick_key(dl, AVG_KEYS);           avg = parse_float(dl.get(avg_k)) if avg_k else None
                enr_k    = pick_key(dl, ENROL_KEYS);         enr = parse_int(dl.get(enr_k)) if enr_k else None
                title_k  = pick_key(dl, TITLE_KEYS);         title = (dl.get(title_k) or "").strip() if title_k else ""
                year_k   = pick_key(dl, YEAR_KEYS);          year = parse_int(dl.get(year_k)) if year_k else None
                sess_k   = pick_key(dl, SESSION_KEYS);       sess = (dl.get(sess_k) or "").strip().upper() if sess_k else ""
                if not subj or not course or not sect: continue
                campus = infer_campus(headers_lc, dl, str(path))
                instructors = split_professors(prof_cell) or [""]
                for instr in instructors:
                    batch.append((campus,year,sess,subj,course,sect,title,instr,enr,avg,str(path),None))  # instructor_id=NULL
                    if len(batch) >= BATCH:
                        cur.executemany("""
                                        INSERT INTO grades_prof_course(campus,year,session,subject,course,section,title,instructor,enrolled,avg,source_file,instructor_id)
                                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                                        """, batch)
                        con.commit()
                        total += len(batch); batch = []
    if batch:
        cur.executemany("""
                        INSERT INTO grades_prof_course(campus,year,session,subject,course,section,title,instructor,enrolled,avg,source_file,instructor_id)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                        """, batch)
        con.commit()
        total += len(batch)
    return total

def rebuild_summary(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    cur.execute("DELETE FROM grades_prof_course_summary")
    cur.execute("""
                INSERT INTO grades_prof_course_summary(subject,course,instructor,n_sections,n_enrolled,avg_of_avg)
                SELECT
                    subject,
                    course,
                    COALESCE(NULLIF(TRIM(instructor),''),'(unknown)') AS instructor,
                    COUNT(*) AS n_sections,
                    SUM(COALESCE(enrolled,0)) AS n_enrolled,
                    AVG(COALESCE(avg,0.0)) AS avg_of_avg
                FROM grades_prof_course
                GROUP BY subject, course, instructor
                """)
    con.commit()

def auto_match_instructors_to_rmp(con: sqlite3.Connection) -> int:
    cur = con.cursor()
    cur.execute("SELECT legacy_id, first_name, last_name FROM rmp_professors")
    rmp = cur.fetchall()
    idx: Dict[str, Dict[str, List[str]]] = {}
    for legacy, first, last in rmp:
        last_k = (last or "").strip().lower()
        fi = ((first or "").strip().lower()[:1] or "")
        if last_k:
            idx.setdefault(last_k, {}).setdefault(fi, []).append(legacy)
    cur.execute("SELECT DISTINCT instructor FROM grades_prof_course WHERE instructor IS NOT NULL AND TRIM(instructor) <> ''")
    instructors = [row[0] for row in cur.fetchall()]
    upserts: List[Tuple[str,str]] = []
    for name in instructors:
        n = name.strip()
        parts = n.split()
        if len(parts) >= 2:
            last = parts[-1].lower()
            first = parts[0].lower()
            fi = first[:1]
            cand = idx.get(last, {}).get(fi, [])
            if len(cand) == 1:
                upserts.append((n, cand[0]))
    if upserts:
        cur.executemany("""
                        INSERT INTO rmp_instructor_map(instructor, legacy_id)
                        VALUES(?,?)
                            ON CONFLICT(instructor) DO UPDATE SET legacy_id=excluded.legacy_id
                        """, upserts)
        con.commit()
    # apply to grades_prof_course
    cur.execute("""
                UPDATE grades_prof_course
                SET instructor_id = (
                    SELECT legacy_id FROM rmp_instructor_map m
                    WHERE m.instructor = grades_prof_course.instructor
                )
                WHERE instructor_id IS NULL
                """)
    con.commit()
    return len(upserts)

def count_rows(cur: sqlite3.Cursor, table: str) -> int:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        return int(cur.fetchone()[0])
    except sqlite3.OperationalError:
        return 0

def main():
    print(f"[paths] DB={os.path.abspath(DB_PATH)}")
    print(f"[paths] PAIR_ROOT={PAIR_ROOT}")
    print(f"[paths] RMP_CSV={RMP_CSV}")

    con = sqlite3.connect(DB_PATH)
    ensure_schema(con)

    upsert_rmp_professors(con, RMP_CSV)

    # (Re)build PAIR rows
    cur = con.cursor()
    cur.execute("DELETE FROM grades_prof_course")
    con.commit()
    rows = ingest_pair(con, PAIR_ROOT)
    print(f"[pair] rebuilt grades_prof_course rows={rows}")
    if rows == 0:
        print("[pair] warning: no section rows ingested (check PAIR_ROOT)")

    matched = auto_match_instructors_to_rmp(con)
    print(f"[match] instructor name matches upserted: {matched}")

    rebuild_summary(con)

    print("[summary] rows={}".format(rows))
    print("[ok] rmp_professors: {}".format(count_rows(con.cursor(), 'rmp_professors')))
    print("[ok] rmp_course_stats: {}".format(count_rows(con.cursor(), 'rmp_course_stats')))
    print("[ok] grades_prof_course: {}".format(count_rows(con.cursor(), 'grades_prof_course')))
    print("[ok] rmp_instructor_map: {}".format(count_rows(con.cursor(), 'rmp_instructor_map')))
    print("[ok] grades_prof_course_summary: {}".format(count_rows(con.cursor(), 'grades_prof_course_summary')))
    print("ENRICH DONE")

if __name__ == "__main__":
    main()
