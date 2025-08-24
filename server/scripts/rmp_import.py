#!/usr/bin/env python3
import base64, csv, json, os, sqlite3, time, random, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

API_URL = "https://www.ratemyprofessors.com/graphql"
RMP_BASE_URL = "https://www.ratemyprofessors.com/professor/"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IjY0MDY5NTUiLCJleHAiOjE3NDI1NzQ4MTF9.q4UM3HoS8aeBEQPu29g8hpAa2Xi9NQ68xA96Qv7z8I0"
CLIENT_ID = "iC-wp_NaKm-20250218"
SCHOOL_B64 = "U2Nob29sLTE0MTM="
BATCH_SIZE = 100
NUM_THREADS = 10

HERE = os.path.abspath(os.path.dirname(__file__))
OUTPUT_PROF_CSV = os.path.join(HERE, "ubc_professors_ratings.csv")
OUTPUT_COURSE_CSV = os.path.join(HERE, "professor_courses.csv")
DB_PATH = os.path.abspath(os.path.join(HERE, "..", "prereqs.db"))

def b64(s): return base64.b64encode(s.encode()).decode()
def encode_teacher_id(tid): return b64(f"Teacher-{tid}")

def post_graphql(body, referer=None, cookie_extra=""):
    data = json.dumps(body).encode()
    req = Request(API_URL, data=data)
    req.add_header("accept", "*/*")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {AUTH_TOKEN}")
    req.add_header("origin", "https://www.ratemyprofessors.com")
    req.add_header("referer", referer or "https://www.ratemyprofessors.com/")
    req.add_header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
    req.add_header("x-rmp-comp-id", CLIENT_ID)
    cookie = f"RMP_AUTH_COOKIE_VERSION=v01; cid={CLIENT_ID}; ccpa-notice-viewed-02=true; rmpAuth={AUTH_TOKEN}; isLoggedIn=true; userinfo=6406955"
    if cookie_extra: cookie += "; " + cookie_extra
    req.add_header("cookie", cookie)
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))
    except (HTTPError, URLError, Exception):
        return {}

def fetch_professors():
    out = []
    cursor = None
    has_next = True
    while has_next:
        body = {
            "query": 'query TeacherSearchPaginationQuery($count: Int!, $cursor: String, $query: TeacherSearchQuery!) { search: newSearch { ...TeacherSearchPagination_search_1jWD3d } } fragment TeacherSearchPagination_search_1jWD3d on newSearch { teachers(query: $query, first: $count, after: $cursor) { didFallback edges { cursor node { ...TeacherCard_teacher id __typename } } pageInfo { hasNextPage endCursor } resultCount filters { field options { value id } } } } fragment TeacherCard_teacher on Teacher { id legacyId avgRating numRatings ...CardFeedback_teacher ...CardSchool_teacher ...CardName_teacher ...TeacherBookmark_teacher } fragment CardFeedback_teacher on Teacher { wouldTakeAgainPercent avgDifficulty } fragment CardSchool_teacher on Teacher { department school { name id } } fragment CardName_teacher on Teacher { firstName lastName } fragment TeacherBookmark_teacher on Teacher { id isSaved }',
            "variables": { "count": BATCH_SIZE, "cursor": cursor, "query": { "text": "", "schoolID": SCHOOL_B64, "fallback": True } }
        }
        resp = post_graphql(body, referer="https://www.ratemyprofessors.com/search/professors/1413?q=*")
        try:
            teachers = resp["data"]["search"]["teachers"]
        except Exception:
            break
        edges = teachers.get("edges", [])
        for e in edges:
            n = e.get("node", {}) or {}
            avg_rating = n.get("avgRating")
            avg_diff = n.get("avgDifficulty")
            wta = n.get("wouldTakeAgainPercent")
            num_r = n.get("numRatings")
            row = {
                "id": str(n.get("id") or ""),
                "legacyId": str(n.get("legacyId") or ""),
                "firstName": str(n.get("firstName") or ""),
                "lastName": str(n.get("lastName") or ""),
                "department": str(n.get("department") or "N/A"),
                "avgRating": float(avg_rating) if avg_rating is not None else 0.0,
                "numRatings": int(num_r) if num_r is not None else 0,
                "avgDifficulty": float(avg_diff) if avg_diff is not None else 0.0,
                "wouldTakeAgainPercent": float(wta) if wta is not None else 0.0,
                "schoolName": str(((n.get("school") or {}).get("name")) or "University of British Columbia"),
                "schoolId": str(((n.get("school") or {}).get("id")) or ""),
            }
            out.append(row)
        pi = teachers.get("pageInfo", {})
        has_next = bool(pi.get("hasNextPage"))
        cursor = pi.get("endCursor")
        time.sleep(0.1)
    for p in out:
        p["rmpUrl"] = RMP_BASE_URL + str(p.get("legacyId") or "")
    return out

def write_professors_csv(rows, path):
    hdr = ["ID","Legacy ID","First Name","Last Name","Department","Average Rating","Number of Ratings","Average Difficulty","Would Take Again %","School Name","School ID","RMP URL"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(hdr)
        for r in rows:
            w.writerow([
                r["id"] or "N/A",
                r["legacyId"] or "N/A",
                r["firstName"] or "N/A",
                r["lastName"] or "N/A",
                r["department"] or "N/A",
                f'{float(r["avgRating"]):.1f}',
                int(r["numRatings"]),
                f'{float(r["avgDifficulty"]):.1f}',
                f'{float(r["wouldTakeAgainPercent"]):.1f}',
                r["schoolName"] or "N/A",
                r["schoolId"] or "N/A",
                r["rmpUrl"] or "N/A",
                ])

def read_professor_tids_from_rows(rows):
    tids = []
    for r in rows:
        tid = str(r.get("legacyId") or "").strip()
        if tid:
            tids.append(tid)
    return tids

Q_RATINGS = """query RatingsListQuery($count: Int!, $id: ID!, $courseFilter: String, $cursor: String) {
  node(id: $id) {
    __typename
    ... on Teacher {
      ratings(first: $count, after: $cursor, courseFilter: $courseFilter) {
        edges { node { class difficultyRating wouldTakeAgain } }
        pageInfo { hasNextPage endCursor }
      }
    }
    id
  }
}"""

def scrape_prof_courses_one(tid):
    time.sleep(1.0 + random.random()*2.0)
    encoded = encode_teacher_id(tid)
    agg = {}
    cursor = None
    first_log = True
    while True:
        body = {"query": Q_RATINGS, "variables": {"count": 50, "id": encoded, "courseFilter": None, "cursor": cursor}}
        resp = post_graphql(body, referer=f"https://www.ratemyprofessors.com/professor/{tid}")
        try:
            ratings = resp["data"]["node"]["ratings"]
        except Exception:
            break
        if first_log:
            first_log = False
            s = json.dumps(resp)[:500]
            print(f"Response for TID {tid}:\n{s}")
        for e in ratings.get("edges", []):
            n = e.get("node", {}) or {}
            course = (n.get("class") or "").strip()
            if not course:
                continue
            try:
                diff = float(n.get("difficultyRating")) if n.get("difficultyRating") is not None else 0.0
            except:
                diff = 0.0
            wta = n.get("wouldTakeAgain")
            rec = agg.get(course)
            if rec is None:
                rec = {"n":0,"sum_diff":0.0,"sum_wta":0.0,"n_wta":0}
                agg[course]=rec
            rec["n"] += 1
            rec["sum_diff"] += diff
            if wta is True:
                rec["sum_wta"] += 1.0
                rec["n_wta"] += 1
            elif wta is False:
                rec["n_wta"] += 1
        pi = ratings.get("pageInfo", {})
        if not pi.get("hasNextPage"):
            break
        cursor = pi.get("endCursor")
        if not cursor:
            break
        time.sleep(0.5)
    rows = []
    for c,a in agg.items():
        n = max(1,a["n"])
        avg_diff = a["sum_diff"]/n
        wta_pct = (a["sum_wta"]/max(1,a["n_wta"])) * 100.0 if a["n_wta"]>0 else 0.0
        rows.append({"course": c.replace(",", ";"), "avg_difficulty": avg_diff, "would_take_again_pct": wta_pct, "num_ratings": a["n"], "prof_tid": tid})
    return rows

def write_courses_csv(rows, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["CourseCode","AvgDifficulty","WouldTakeAgainPercent","NumRatings","ProfessorId"])
        for r in rows:
            w.writerow([r["course"], f'{float(r["avg_difficulty"]):.2f}', f'{float(r["would_take_again_pct"]):.2f}', int(r["num_ratings"]), str(r["prof_tid"])])

def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS rmp_professors(
                                                                id TEXT PRIMARY KEY,
                                                                legacy_id TEXT,
                                                                first_name TEXT,
                                                                last_name TEXT,
                                                                department TEXT,
                                                                avg_rating REAL,
                                                                num_ratings INTEGER,
                                                                avg_difficulty REAL,
                                                                would_take_again_pct REAL,
                                                                school_name TEXT,
                                                                school_id TEXT,
                                                                rmp_url TEXT
                   )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS rmp_course_stats(
                                                                  prof_tid TEXT NOT NULL,
                                                                  course_code TEXT NOT NULL,
                                                                  avg_difficulty REAL,
                                                                  would_take_again_pct REAL,
                                                                  num_ratings INTEGER,
                                                                  PRIMARY KEY(prof_tid, course_code)
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rmp_course_code ON rmp_course_stats(course_code)")
    con.commit()
    con.close()

def upsert_professors(rows):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.executemany("""INSERT INTO rmp_professors(
        id,legacy_id,first_name,last_name,department,avg_rating,num_ratings,avg_difficulty,would_take_again_pct,school_name,school_id,rmp_url
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(id) DO UPDATE SET
        legacy_id=excluded.legacy_id,
                                                  first_name=excluded.first_name,
                                                  last_name=excluded.last_name,
                                                  department=excluded.department,
                                                  avg_rating=excluded.avg_rating,
                                                  num_ratings=excluded.num_ratings,
                                                  avg_difficulty=excluded.avg_difficulty,
                                                  would_take_again_pct=excluded.would_take_again_pct,
                                                  school_name=excluded.school_name,
                                                  school_id=excluded.school_id,
                                                  rmp_url=excluded.rmp_url
                    """, [(str(r["id"]), str(r["legacyId"]), str(r["firstName"]), str(r["lastName"]), str(r["department"]), float(r["avgRating"]), int(r["numRatings"]), float(r["avgDifficulty"]), float(r["wouldTakeAgainPercent"]), str(r["schoolName"]), str(r["schoolId"]), str(r["rmpUrl"])) for r in rows])
    con.commit()
    con.close()

def upsert_course_stats(rows):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.executemany("""INSERT INTO rmp_course_stats(prof_tid,course_code,avg_difficulty,would_take_again_pct,num_ratings)
                       VALUES(?,?,?,?,?)
                           ON CONFLICT(prof_tid,course_code) DO UPDATE SET
        avg_difficulty=excluded.avg_difficulty,
                                                                    would_take_again_pct=excluded.would_take_again_pct,
                                                                    num_ratings=excluded.num_ratings
                    """, [(str(r["prof_tid"]), str(r["course"]), float(r["avg_difficulty"]), float(r["would_take_again_pct"]), int(r["num_ratings"])) for r in rows])
    con.commit()
    con.close()

def atomic_counter():
    lock = threading.Lock()
    n = {"v":0}
    def inc():
        with lock:
            n["v"] += 1
            return n["v"]
    return inc

def main():
    ensure_db()
    profs = fetch_professors()
    write_professors_csv(profs, OUTPUT_PROF_CSV)
    upsert_professors(profs)
    tids = read_professor_tids_from_rows(profs)
    counter = atomic_counter()
    all_rows = []
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as ex:
        futs = {ex.submit(scrape_prof_courses_one, tid): tid for tid in tids}
        total = len(tids)
        for i, fut in enumerate(as_completed(futs), 1):
            try:
                rows = fut.result()
            except Exception:
                rows = []
            all_rows.extend(rows)
            counter()
            if i % 10 == 0 or i == total:
                print(f"{i}/{total} professors processed, rows={len(all_rows)}")
            time.sleep(0.02)
    write_courses_csv(all_rows, OUTPUT_COURSE_CSV)
    upsert_course_stats(all_rows)
    print("OK")
    print(f"CSV professors: {os.path.abspath(OUTPUT_PROF_CSV)}")
    print(f"CSV courses   : {os.path.abspath(OUTPUT_COURSE_CSV)}")
    print(f"DB            : {os.path.abspath(DB_PATH)}")

if __name__ == "__main__":
    main()
