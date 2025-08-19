#!/usr/bin/env python3
import re, os, sys, csv, json, argparse, html

COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,5})(?:_([A-Z]))?\s*[- ]?\s*(\d{3}[A-Z]?)\b")
HTML_TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
SENT_SPLIT = re.compile(r'(?<=[\.\!\?])\s+(?=[A-Z(])')
PREREQ_CUE = re.compile(r"pre[\s\-]?req", re.I)
COREQ_CUE = re.compile(r"co[\s\-]?req|co[\s\-]?requisite|corequisite", re.I)
PERM_CUE = re.compile(r"(permission|consent) of (the )?(instructor|department|school|faculty)", re.I)
CREDIT_EXCL_PAT = re.compile(
    r"(credit (will|won't|will not) be (granted|given)|"
    r"no credit (for|will be given)|"
    r"credit (towards|toward)|"
    r"credit excluded|"
    r"only one of|"
    r"mutually exclusive|"
    r"may not be taken for credit with|"
    r"cannot be taken for credit with)",
    re.I
)

def strip_html(s):
    s = HTML_TAG_RE.sub(" ", str(s))
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
    return SPACE_RE.sub(" ", s).strip()

def course_id_from_row(row):
    for key in ("course_id","Course","course","Code","code"):
        if key in row and row[key]:
            m = COURSE_CODE_RE.search(str(row[key]))
            if m: return f"{m.group(1)}{('_'+m.group(2)) if m.group(2) else ''} {m.group(3)}"
    joined = " ".join(str(v) for v in row.values() if v)
    m = COURSE_CODE_RE.search(joined)
    return f"{m.group(1)}{('_'+m.group(2)) if m.group(2) else ''} {m.group(3)}" if m else ""

def detect_texts(row, headers):
    picks = []
    order = ["Prerequisites","Prerequisite","Requisites","Eligibility","Notes","Description","Requisite"]
    low = [h.lower() for h in headers]
    for name in order:
        if name in headers:
            val = row.get(name,"")
            if isinstance(val,str) and val.strip(): picks.append(val)
        else:
            try:
                i = low.index(name.lower())
                val = row.get(headers[i],"")
                if isinstance(val,str) and val.strip(): picks.append(val)
            except:
                pass
    extra = []
    for h in headers:
        if any(k in h.lower() for k in ["prereq","pre-req","pre req","coreq","co-req","co req"]):
            v = row.get(h,"")
            if isinstance(v,str) and v.strip(): extra.append(v)
    return picks+extra

def extract_codes(text):
    if not text: return []
    found = []
    for m in COURSE_CODE_RE.finditer(text):
        subj = m.group(1).upper()
        campus = m.group(2).upper() if m.group(2) else None
        num = m.group(3).upper()
        code = f"{subj}{('_'+campus) if campus else ''} {num}"
        found.append(code)
    seen, uniq = set(), []
    for c in found:
        if c not in seen:
            seen.add(c); uniq.append(c)
    return uniq

def sanitize_for_tree(text):
    if not isinstance(text,str): return ""
    parts = [s for s in SENT_SPLIT.split(text) if not CREDIT_EXCL_PAT.search(s)]
    return " ".join(parts).strip()

def classify_logic(text):
    if not isinstance(text,str) or not text.strip(): return "NONE"
    t = text.lower()
    has_one = "one of" in t
    has_and = " and " in t
    has_or  = " or "  in t
    if has_one and has_and: return "MIXED"
    if has_one or (has_or and not has_and): return "OR"
    if has_and and not has_or: return "AND"
    if has_and and has_or: return "MIXED"
    return "UNKNOWN"

def sentence_kind(text):
    t = text.lower()
    if COREX := CORESSION:...
    if CORESSION:...
    return "CO_REQ" if CORESSION else "REQ"

def parse_sentence_tree(sent):
    t = sent.strip()
    codes = extract_codes(t)
    if not codes: return None
    is_coreq = bool(COREQ_CUE.search(t))
    one_pos = t.lower().find("one of")
    groups = []
    leading_codes = []
    if one_pos >= 0:
        pre_codes = extract_codes(t[:one_pos])
        post_codes = extract_codes(t[one_pos:])
        pre_set = set(pre_codes)
        post_set = set(post_codes)
        leading_codes = [c for c in pre_codes if c not in post_set]
        if post_codes:
            groups.append({"op":"OR","min":1,"children":[{"type":"course","id":c} for c in post_codes]})
    else:
        if " or " in t.lower() and " and " not in t.lower():
            groups.append({"op":"OR","min":1,"children":[{"type":"course","id":c} for c in codes]})
        else:
            leading_codes = codes[:]
    and_children = [{"type":"course","id":c} for c in leading_codes]
    children = []
    children.extend(and_children)
    for g in groups:
        children.append(g)
    if not children: return None
    if len(children) == 1 and isinstance(children[0],dict) and ("type" in children[0] or "op" in children[0]):
        node = children[0]
        if "op" in node and is_coreq:
            node = dict(node); node["meta"] = dict(node.get("meta",{}), **{"kind":"CO_REQ"})
        return node
    node = {"op":"AND","children":children}
    if is_coreq:
        node["meta"] = {"kind":"CO_REQ"}
    return node

def strip_self_refs(node, target):
    if not node: return None
    if isinstance(node, dict) and node.get("type") == "course":
        return None if node.get("id") == target else node
    if isinstance(node, dict) and "op" in node:
        kids = []
        for ch in node.get("children",[]):
            c2 = strip_self_refs(ch, target)
            if c2: kids.append(c2)
        if not kids: return None
        out = dict(node); out["children"] = kids
        if out["op"] == "OR" and isinstance(out.get("min"), int):
            out["min"] = max(1, min(out["min"], len(kids)))
        return out
    return node

def merge_and(a,b):
    if not a: return b
    if not b: return a
    if isinstance(a,dict) and a.get("op")=="AND":
        if isinstance(b,dict) and b.get("op")=="AND":
            return {"op":"AND","children":a["children"]+b["children"]}
        return {"op":"AND","children":a["children"]+[b]}
    if isinstance(b,dict) and b.get("op")=="AND":
        return {"op":"AND","children":[a]+b["children"]}
    return {"op":"AND","children":[a,b]}

def extract_credit_groups(text):
    out = []
    if not isinstance(text,str): return out
    for s in SENT_SPLIT.split(text):
        if CREDIT_EXCL_PAT.search(s):
            codes = extract_codes(s)
            if len(codes) >= 2:
                out.append({"courses":codes,"source":s.strip()})
    return out

def build_tree_from_text(text):
    if not isinstance(text,str) or not text.strip(): return None
    parts = [p.strip() for p in SENT_SPLIT.split(text) if p.strip()]
    combined = None
    for s in parts:
        if CREDIT_EXCL_PAT.search(s):
            continue
        st = parse_sentence_tree(s)
        if st:
            combined = merge_and(combined, st)
    return combined

def main():
    ap = argparse.ArgumentParser(description="Extract structured prerequisites from HAR CSV")
    ap.add_argument("input_csv", help="Path to combined_courses_with_prereqs.csv")
    ap.add_argument("-o","--output_csv", default=None, help="Where to write extracted_prereqs.csv")
    args = ap.parse_args()
    in_path = os.path.expanduser(args.input_csv)
    if not os.path.exists(in_path):
        print(f"Input file not found: {in_path}", file=sys.stderr)
        sys.exit(1)
    out_path = os.path.expanduser(args.output_csv) if args.output_csv else os.path.join(os.path.dirname(in_path) or ".", "extracted_prereqs.csv")
    with open(in_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        rows_out = []
        for row in reader:
            cid = course_id_from_row(row)
            if not cid:
                continue
            credits = None
            for k in ("Credits","credits","Credit","credit","Units"):
                if k in row and row[k]:
                    credits = str(row[k]).strip()
                    break
            texts = detect_texts(row, headers)
            texts_clean = [strip_html(t) for t in texts if isinstance(t,str) and t.strip()]
            picked = ""
            for t in texts_clean:
                if PREREQ_CUE.search(t) or COREQ_CUE.search(t):
                    picked = t; break
            if not picked and texts_clean:
                picked = texts_clean[0]
            mentions_coreq = bool(COREQ_CUE.search(picked)) if picked else False
            requires_permission = bool(PERM_CUE.search(picked)) if picked else False
            logic_hint = classify_logic(picked or "")
            credit_groups = extract_credit_groups(picked or "")
            exclusion_groups = []
            sanitized = sanitize_for_tree(picked or "")
            tree = build_tree_from_text(sanitized)
            tree = strip_self_refs(tree, cid)
            tree_json = json.dumps(tree, ensure_ascii=False) if tree else None
            rows_out.append({
                "course_id": cid,
                "course_field_raw": row.get("Course","") or "",
                "credit_value": credits or "",
                "prereq_text_raw": picked or "",
                "logic_hint": logic_hint,
                "mentions_coreq": "TRUE" if mentions_coreq else "FALSE",
                "requires_permission": "TRUE" if requires_permission else "FALSE",
                "logic_groups_json": None,
                "requirements_tree_json": tree_json,
                "credit_pairs_json": json.dumps(credit_groups, ensure_ascii=False) if credit_groups else None,
                "exclusions_json": json.dumps(exclusion_groups, ensure_ascii=False) if exclusion_groups else None
            })
    fieldnames = ["course_id","course_field_raw","credit_value","prereq_text_raw","logic_hint","mentions_coreq","requires_permission","logic_groups_json","requirements_tree_json","credit_pairs_json","exclusions_json"]
    with open(out_path, "w", newline="", encoding="utf-8") as g:
        w = csv.DictWriter(g, fieldnames=fieldnames)
        w.writeheader()
        for r in rows_out:
            w.writerow(r)
    print(f"Wrote {len(rows_out)} rows to {out_path}")

if __name__ == "__main__":
    main()
