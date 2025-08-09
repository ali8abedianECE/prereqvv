// server/src/import.ts
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

type Row = {
    course_id: string;
    credit_value?: string;
    prereq_text_raw?: string;
    requirements_tree_json?: string | null;
    logic_groups_json?: string | null;
};

type Tree =
    | { type: "course"; id: string }
    | {
    op: "AND" | "OR" | "MIN";
    min?: number;
    meta?: { kind?: "CO_REQ" | "COREQ" | string };
    children: Tree[];
}
    | {
    constraint:
        | "YEAR_STANDING"
        | "GPA_MIN"
        | "PERCENT_MIN"
        | "CREDITS_AT_LEAST";
    year_min?: number;
    value?: number;
    credits_min?: number;
    subject?: string | null;
    level_min?: number | null;
    courses?: string[];
};

type EdgeKind = "REQ" | "CO_REQ" | "CREDIT" | "EXCLUSION";

const DB_FILE = path.resolve(process.env.DB_FILE || "prereqs.db");
const CSV_FILE = path.resolve(
    process.env.CSV_FILE ||
    path.join(process.env.HOME || "", "Downloads/extracted_prereqs.csv")
);

console.log("▶ CSV_FILE:", CSV_FILE);
console.log("▶ DB_FILE :", DB_FILE);

if (!fs.existsSync(CSV_FILE)) {
    console.error("✗ CSV not found at", CSV_FILE);
    process.exit(1);
}

const db = new Database(DB_FILE);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = wal");

// ---- schema ----
const schemaPath = path.resolve("src/schema.sql");
db.exec(fs.readFileSync(schemaPath, "utf-8"));

// ---- csv ----
const rows: Row[] = parse(fs.readFileSync(CSV_FILE, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
});
console.log(`▶ Parsed ${rows.length} CSV rows`);

// ---- statements ----
const insCourse = db.prepare(
    `INSERT OR REPLACE INTO courses(id,title,credits,prereq_text,tree_json)
   VALUES(@id,NULL,@credits,@text,@tree)`
);
const ensureCourse = db.prepare(`INSERT OR IGNORE INTO courses(id) VALUES(?)`);
const insEdge = db.prepare(
    `INSERT OR IGNORE INTO edges(source_id,target_id,kind,group_id)
   VALUES(?,?,?,?)`
);
const insConstraint = db.prepare(
    `INSERT INTO constraints(course_id,type,year_min,value,credits_min,subject,level_min,courses_json)
   VALUES(@course_id,@type,@year_min,@value,@credits_min,@subject,@level_min,@courses_json)`
);

// ---- helpers ----
function tryJSON<T = any>(s: unknown): T | null {
    if (s == null) return null;
    try {
        return JSON.parse(String(s)) as T;
    } catch {
        return null;
    }
}

let groupCounter = 0;
const newGroupId = () => `g${groupCounter++}`;

function emitEdge(
    seen: Set<string>,
    source: string,
    target: string,
    kind: EdgeKind,
    groupId?: string | null
) {
    const key = `${source}|${target}|${kind}|${groupId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    ensureCourse.run(source);
    ensureCourse.run(target);
    insEdge.run(source, target, kind, groupId ?? null);
}

// Walk requirements_tree and emit REQ/CO_REQ edges.
// One-of or MIN groups assign the same group_id to children;
// kind remains REQ/CO_REQ so the UI can style by semantics and dash by group.
function toEdges(
    n: Tree,
    target: string,
    mode: EdgeKind,
    seen: Set<string>,
    parentGroup?: string | null
) {
    // propagate CO_REQ if subtree is explicitly coreq
    const nextMode: EdgeKind =
        (("meta" in n &&
                (n as any).meta &&
                (((n as any).meta.kind || "").toUpperCase() === "CO_REQ" ||
                    ((n as any).meta.kind || "").toUpperCase() === "COREQ")) &&
            "CO_REQ") ||
        mode;

    if ("type" in n && n.type === "course") {
        if (n.id && target && n.id !== target) {
            emitEdge(seen, n.id, target, nextMode, parentGroup ?? null);
        }
        return;
    }

    if ("constraint" in n) {
        // constraints are inserted separately (below)
        return;
    }

    if ("op" in n) {
        const isGroup =
            n.op === "OR" || n.op === "MIN" || (n.op === "AND" && n.min && n.min > 0);
        // we consider any MIN/OR as a selectable group (OR == min=1 is a special case)
        const groupId = isGroup ? newGroupId() : parentGroup ?? null;
        for (const child of n.children || []) {
            toEdges(child, target, nextMode, seen, groupId);
        }
        return;
    }
}

// ---- import ----
db.transaction(() => {
    const seenGlobal = new Set<string>(); // avoid duplicates across rows/runs

    for (const r of rows) {
        const id = (r.course_id || "").trim();
        if (!id) continue;

        const tree = tryJSON<Tree>(r.requirements_tree_json);
        const logicGroups = tryJSON<any[]>(r.logic_groups_json) || [];

        insCourse.run({
            id,
            credits: r.credit_value ?? null,
            text: r.prereq_text_raw ?? null,
            tree: tree ? JSON.stringify(tree) : null,
        });

        // store constraints from tree
        if (tree) {
            (function collect(n: Tree) {
                if ("constraint" in n) {
                    insConstraint.run({
                        course_id: id,
                        type: n.constraint,
                        year_min: n.year_min ?? null,
                        value: n.value ?? null,
                        credits_min: n.credits_min ?? null,
                        subject: n.subject ?? null,
                        level_min: n.level_min ?? null,
                        courses_json: n.courses ? JSON.stringify(n.courses) : null,
                    });
                } else if ("op" in n) {
                    n.children.forEach(collect);
                }
            })(tree);

            // edges: prerequisites/co-reqs
            toEdges(tree, id, "REQ", seenGlobal, null);
        }

        // edges: credit/exclusion (outbound from this course)
        if (logicGroups && Array.isArray(logicGroups)) {
            for (const g of logicGroups) {
                const k = String(g?.kind || "").toUpperCase();
                if (!g?.courses || !Array.isArray(g.courses)) continue;

                if (k === "EXCLUSION" || k === "CREDIT" || k === "CREDIT_GRANT" || k === "CREDIT_GRANTED_FOR") {
                    for (const other of g.courses) {
                        const target = String(other || "").trim();
                        if (!target || target === id) continue;
                        emitEdge(
                            seenGlobal,
                            id,
                            target,
                            k === "EXCLUSION" ? "EXCLUSION" : "CREDIT",
                            null
                        );
                    }
                }
                // NOTE: "ONE_OF" groups are already represented via group_id produced from the tree.
            }
        }
    }
})();

const counts = db
    .prepare(
        `
  SELECT
    (SELECT COUNT(*) FROM courses)     AS courses,
    (SELECT COUNT(*) FROM edges)       AS edges,
    (SELECT COUNT(*) FROM constraints) AS constraints
`
    )
    .get();

console.log("✔ Import complete:", counts);
