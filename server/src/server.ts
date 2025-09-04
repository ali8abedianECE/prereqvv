// server/src/server.ts
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";

// Routers
import createVizRouter from "./viz_api.js";
import createSchedRouter from "./sched_api.js"; // <-- NEW


const DB_FILE = process.env.DB_FILE || path.resolve("prereqs.db");
const db = new Database(DB_FILE, { readonly: false });
db.pragma("foreign_keys = ON");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const ID_RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;

function splitId(id: string) {
    const m = id.toUpperCase().match(ID_RE);
    if (!m) return { base: id.toUpperCase(), campus: null as null | string };
    const campus = m[2] || null;
    const base = `${m[1]} ${m[3]}`;
    return { base, campus };
}

type BaseIndex = Map<string, { ids: Record<string, string> }>;

function buildBaseIndex(): BaseIndex {
    const out: BaseIndex = new Map();
    const rows = db.prepare("SELECT id FROM courses").all() as Array<{ id: string }>;
    for (const r of rows) {
        const { base, campus } = splitId(r.id);
        const entry = out.get(base) || { ids: {} as Record<string, string> };
        const key = campus ?? "V";
        entry.ids[key] = r.id;
        out.set(base, entry);
    }
    return out;
}

let BASE_INDEX = buildBaseIndex();

app.post("/api/reindex", (_req, res) => {
    BASE_INDEX = buildBaseIndex();
    res.json({ ok: true, bases: BASE_INDEX.size });
});

function resolveActualId(base: string, campus?: string | null): string | null {
    const e = BASE_INDEX.get(base.toUpperCase());
    if (!e) return null;
    const pref = (campus || "").toUpperCase();
    if (pref && e.ids[pref]) return e.ids[pref];
    return e.ids["V"] || e.ids["O"] || Object.values(e.ids)[0] || null;
}

function toBase(id: string) {
    const m = id.toUpperCase().match(ID_RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
}

function getAveragesForIds(ids: string[]) {
    if (!ids.length) return { byId: {} as Record<string, number>, byBase: {} as Record<string, number> };
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
        .prepare(`SELECT id, avg_overall FROM course_avg_map_mat WHERE id IN (${placeholders})`)
        .all(...ids) as Array<{ id: string; avg_overall: number | null }>;
    const byId: Record<string, number> = {};
    const byBase: Record<string, number> = {};
    for (const r of rows) {
        if (r.avg_overall == null) continue;
        byId[r.id] = Number(r.avg_overall);
        byBase[toBase(r.id)] = Number(r.avg_overall);
    }
    return { byId, byBase };
}

app.get("/api/search_base", (req, res) => {
    const q = String(req.query.q || "").trim().toUpperCase();
    const bases = Array.from(BASE_INDEX.keys()).sort();
    const filtered = q ? bases.filter((b) => b.includes(q)) : bases.slice(0, 200);
    res.json(filtered.slice(0, 50));
});

// Mount existing viz routes
app.use("/api/viz", createVizRouter(db));

// Your existing endpoints
app.get("/api/course_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const id = resolveActualId(base, campus);
    if (!id) return res.status(404).json({ error: "not found" });
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(id);
    const constraints = db.prepare("SELECT * FROM constraints WHERE course_id = ?").all(id);
    res.json({ ...(course ?? {}), constraints, base_id: base, actual_id: id });
});

app.get("/api/graph_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const depth = Math.max(1, Math.min(6, Number(req.query.depth) || 2));
    const includeCoreq = String(req.query.includeCoreq || "true") !== "false";
    const rootId = resolveActualId(base, campus);
    if (!rootId) return res.status(404).json({ error: "not found" });

    const nodes = new Set<string>([rootId]);
    const links: Array<{ source: string; target: string; kind: string; group_id?: string | null }> = [];
    const visited = new Set<string>();

    function addOutboundCreditEdges(from: string) {
        const outEdges = db
            .prepare("SELECT source_id,target_id,kind FROM edges WHERE source_id = ? AND kind IN ('EXCLUSION','CREDIT')")
            .all(from) as any[];
        for (const e of outEdges) {
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({ source: e.source_id, target: e.target_id, kind: e.kind, group_id: null });
        }
    }

    addOutboundCreditEdges(rootId);

    function addEdgesFor(target: string) {
        const rowEdges = db
            .prepare("SELECT source_id,target_id,kind,group_id FROM edges WHERE target_id = ?")
            .all(target) as any[];
        for (const e of rowEdges) {
            if (!includeCoreq && e.kind === "CO_REQ") continue;
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({ source: e.source_id, target: e.target_id, kind: e.kind, group_id: e.group_id ?? null });
        }
        return rowEdges.map((e) => e.source_id as string);
    }

    let frontier = [rootId];
    for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const t of frontier) {
            if (visited.has(t)) continue;
            visited.add(t);
            next.push(...addEdgesFor(t));
        }
        frontier = next;
    }

    const nodeList = Array.from(nodes);
    const avgs = getAveragesForIds(nodeList);
    res.json({
        nodes: nodeList,
        links,
        base_id: base,
        actual_id: rootId,
        averages: avgs.byId,
        averagesByBase: avgs.byBase,
    });
});

app.get("/api/graph/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    const depth = Math.max(1, Math.min(6, Number(req.query.depth) || 2));
    const includeCoreq = String(req.query.includeCoreq || "true") !== "false";

    const nodes = new Set<string>([id]);
    const links: Array<{ source: string; target: string; kind: string; group_id?: string | null }> = [];

    function addOutboundCreditEdges(from: string) {
        const outEdges = db
            .prepare("SELECT source_id,target_id,kind FROM edges WHERE source_id = ? AND kind IN ('EXCLUSION','CREDIT')")
            .all(from) as any[];
        for (const e of outEdges) {
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({ source: e.source_id, target: e.target_id, kind: e.kind, group_id: null });
        }
    }

    addOutboundCreditEdges(id);

    const visited = new Set<string>();

    function addEdgesFor(target: string) {
        const rowEdges = db
            .prepare("SELECT source_id,target_id,kind,group_id FROM edges WHERE target_id = ?")
            .all(target) as any[];
        for (const e of rowEdges) {
            if (!includeCoreq && e.kind === "CO_REQ") continue;
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({ source: e.source_id, target: e.target_id, kind: e.kind, group_id: e.group_id ?? null });
        }
        return rowEdges.map((e) => e.source_id as string);
    }

    let frontier = [id];
    for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const t of frontier) {
            if (visited.has(t)) continue;
            visited.add(t);
            next.push(...addEdgesFor(t));
        }
        frontier = next;
    }

    const nodeList = Array.from(nodes);
    const avgs = getAveragesForIds(nodeList);
    res.json({ nodes: nodeList, links, averages: avgs.byId, averagesByBase: avgs.byBase });
});

app.get("/api/grades_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const id = resolveActualId(base, campus);
    if (!id) return res.json({ base, average: null });
    try {
        const row = db
            .prepare("SELECT avg_overall FROM course_avg_map_mat WHERE id = ?")
            .get(id) as { avg_overall?: number } | undefined;
        res.json({ base, average: row?.avg_overall ?? null, actual_id: id });
    } catch {
        res.json({ base, average: null, actual_id: id });
    }
});

type Tree =
    | { type: "course"; id: string }
    | { op: "AND" | "OR" | "MIN"; min?: number; meta?: { kind?: string }; children: Tree[] }
    | { constraint: string };

function extractGroups(tree: Tree | null | undefined) {
    const allOf = new Set<string>();
    const oneOf: string[][] = [];
    const coReq: string[][] = [];

    function walk(n: Tree, inCoreq: boolean) {
        if ("type" in n && n.type === "course") {
            const b = toBase(n.id);
            if (inCoreq) {
                if (!coReq.length) coReq.push([]);
                coReq[coReq.length - 1].push(b);
            } else {
                allOf.add(b);
            }
            return;
        }
        if ("constraint" in n) return;
        if ("op" in n) {
            const isCoreq =
                String(n.meta?.kind || "").toUpperCase() === "CO_REQ" ||
                String(n.meta?.kind || "").toUpperCase() === "COREQ";
            if (n.op === "OR" || (n.min && n.min > 0)) {
                const bucket: string[] = [];
                for (const c of n.children || []) {
                    if ("type" in c && c.type === "course") bucket.push(toBase(c.id));
                }
                if (bucket.length) {
                    if (isCoreq) coReq.push(bucket);
                    else oneOf.push(bucket);
                }
                for (const c of n.children || []) {
                    if (!("type" in c)) walk(c, isCoreq || inCoreq);
                }
            } else {
                for (const c of n.children || []) walk(c, isCoreq || inCoreq);
            }
        }
    }

    if (tree) walk(tree, false);
    for (const g of oneOf) for (const b of g) allOf.delete(b);
    return { allOf: Array.from(allOf), oneOf, coReq };
}

app.post("/api/plan_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const completedRaw: string[] = Array.isArray(req.body?.completed) ? req.body.completed : [];
    const completed = new Set(completedRaw.map((s) => toBase(String(s))));
    const id = resolveActualId(base, campus);
    if (!id) return res.status(404).json({ error: "not found" });

    const row = db.prepare("SELECT tree_json FROM courses WHERE id = ?").get(id) as any;
    const tree: Tree | null = row?.tree_json ? JSON.parse(row.tree_json) : null;
    const g = extractGroups(tree);

    const term1 = new Set<string>();
    const term2 = new Set<string>();

    const needAll = new Set<string>(g.allOf);
    for (const b of completed) needAll.delete(b);

    const oneOfPicks: string[] = [];
    for (const group of g.oneOf) {
        let pick: string | null = null;
        for (const b of group) if (completed.has(b)) { pick = b; break; }
        if (!pick) pick = group[0];
        oneOfPicks.push(pick);
        if (!completed.has(pick)) term1.add(pick);
    }

    for (const b of needAll) term1.add(b);

    const coreqPicks: string[] = [];
    for (const group of g.coReq) {
        let pick: string | null = null;
        for (const b of group) if (completed.has(b)) { pick = b; break; }
        if (!pick) pick = group[0];
        coreqPicks.push(pick);
        if (!completed.has(pick)) term2.add(pick);
    }

    const t1 = Array.from(term1);
    const t2 = Array.from(new Set<string>([...term2, base]));

    if (t1.length === 0 && t2.length === 1)
        return res.json({ ok: true, plan: { term1: [], term2: [base] }, note: "all prereqs done" });

    return res.json({ ok: true, plan: { term1: t1, term2: t2 } });
});

// Mount scheduler routes (terms/search/offerings/generate)
app.use("/api/sched", createSchedRouter(db)); // <-- NEW

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
