import sys, csv, json

def load(p):
    with open(p, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            yield r

def iter_tree(n):
    if not isinstance(n, dict): return
    if n.get("type")=="course":
        yield ("course", n["id"])
    elif "op" in n:
        yield ("op", (n["op"], n.get("min")))
        for c in n.get("children",[]):
            for t in iter_tree(c):
                yield t

def main():
    if len(sys.argv)<2:
        print("usage: python3 validate_output.py /path/to/extracted_prereqs.csv"); sys.exit(2)
    p = sys.argv[1]
    total = ok_json = trees = bad_self = or_min_fixed = 0
    credits = excl = 0
    for r in load(p):
        total += 1
        tj = r.get("requirements_tree_json","").strip()
        if tj and tj.lower()!="null":
            try:
                t = json.loads(tj)
                ok_json += 1
                trees += 1
                self_id = r["course_id"]
                has_self = any(kind=="course" and cid==self_id for kind,cid in iter_tree(t))
                if has_self: bad_self += 1
                def check_or(n):
                    nonlocal or_min_fixed
                    if not isinstance(n,dict): return
                    if n.get("op")=="OR":
                        m = n.get("min")
                        k = len([1 for c in n.get("children",[])])
                        if isinstance(m,int) and m>k: or_min_fixed += 1
                    for c in n.get("children",[]): check_or(c)
                check_or(t)
            except Exception:
                pass
        if r.get("credit_pairs_json"): credits += 1
        if r.get("exclusions_json"):   excl    += 1

    print(f"rows: {total}")
    print(f"trees json-ok: {ok_json}")
    print(f"trees present: {trees}")
    print(f"trees with self-reference: {bad_self}")
    print(f"OR min>children cases: {or_min_fixed}")
    print(f"rows with credit pairs: {credits}")
    print(f"rows with exclusions:   {excl}")

if __name__=="__main__":
    main()
