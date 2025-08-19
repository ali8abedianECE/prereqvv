import os, sys, csv, json, tempfile, runpy

def read_csv(p):
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    extractor = os.path.join(here, "extractor_v2.py")

    sample = """Course,Credits,Prerequisites,Description
ELEC_V 201,4,"Prerequisite : MATH_V 101 and one of PHYS_V 108, PHYS_V 118, PHYS_V 158. Corequisite : One of MATH_V 255, MATH_V 256.",The fundamentals...
PHIL_V 102,3,"Credit will be granted for only one of PHIL_V 100 or PHIL_V 102.",Intro to logic
"""
    with tempfile.TemporaryDirectory() as td:
        in_csv  = os.path.join(td,"in.csv")
        out_csv = os.path.join(td,"out.csv")
        with open(in_csv,"w",encoding="utf-8") as f: f.write(sample)
        sys.argv = ["extractor_v2.py", in_csv, "-o", out_csv]
        runpy.run_path(extractor, run_name="__main__")

        rows = read_csv(out_csv)
        assert len(rows)==2, f"expected 2 rows, got {len(rows)}"

        r1 = next(r for r in rows if r["course_id"]=="ELEC_V 201")
        tree = json.loads(r1["requirements_tree_json"])
        assert tree["op"]=="AND"
        flat_ids = []
        def walk(n):
            if isinstance(n,dict) and n.get("type")=="course":
                flat_ids.append(n["id"])
            elif isinstance(n,dict) and n.get("op"):
                for c in n["children"]: walk(c)
        walk(tree)
        assert "ELEC_V 201" not in flat_ids
        assert "MATH_V 101" in flat_ids
        assert {"PHYS_V 108","PHYS_V 118","PHYS_V 158"} & set(flat_ids)

        r2 = next(r for r in rows if r["course_id"]=="PHIL_V 102")
        assert r2["requirements_tree_json"] in ("", None, "null")
        cp = json.loads(r2["credit_pairs_json"])
        assert len(cp)==1 and set(cp[0]["courses"])=={"PHIL_V 100","PHIL_V 102"}

    print("OK: integration smoke test passed")

if __name__=="__main__":
    main()
