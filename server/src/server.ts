import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";

// ---- DB ----
const DB_FILE = process.env.DB_FILE || path.resolve("prereqs.db");
const db = new Database(DB_FILE, { readonly: false });
db.pragma("foreign_keys = ON");

const app = express();
app.use(cors());

// ---- campus/base helpers ----
const DEFAULT_NO_SUFFIX: "V" | "O" = "V"; // assume no suffix = Vancouver
const ID_RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;

function splitId(id: string) {
    const m = id.toUpperCase().match(ID_RE);
    if (!m) return { base: id.toUpperCase(), campus: null as "V" | "O" | null };
    const campus = (m[2] as "V" | "O" | undefined) || null;
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
        const key = campus ?? DEFAULT_NO_SUFFIX;
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

// ---- utils: keep only the component reachable from root (undirected) ----
type Link = { source: string; target: string; kind: string; group_id?: string | null };

function pruneToConnected(root: string, nodesSet: Set<string>, links: Link[]) {
    const adj = new Map<string, string[]>();
    for (const { source, target } of links) {
        (adj.get(source) || adj.set(source, []).get(source)!).push(target);
        (adj.get(target) || adj.set(target, []).get(target)!).push(source);
    }
    const keep = new Set<string>();
    const q: string[] = [root];
    keep.add(root);
    while (q.length) {
        const u = q.shift()!;
        for (const v of adj.get(u) || []) {
            if (!keep.has(v)) {
                keep.add(v);
                q.push(v);
            }
        }
    }
    const prunedLinks = links.filter((e) => keep.has(e.source) && keep.has(e.target));
    return { nodes: Array.from(keep), links: prunedLinks };
}

// ---- base-aware endpoints ----
app.get("/api/search_base", (req, res) => {
    const q = String(req.query.q || "").trim().toUpperCase();
    const bases = Array.from(BASE_INDEX.keys()).sort();
    const filtered = q ? bases.filter((b) => b.includes(q)) : bases.slice(0, 200);
    res.json(filtered.slice(0, 50));
});

app.get("/api/campuses/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const e = BASE_INDEX.get(base);
    if (!e) return res.status(404).json({ error: "not found" });
    res.json({ base_id: base, campuses: Object.keys(e.ids).sort(), ids: e.ids });
});

app.get("/api/course_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const id = resolveActualId(base, campus);
    if (!id) return res.status(404).json({ error: "not found" });
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(id);
    const constraints = db.prepare("SELECT * FROM constraints WHERE course_id = ?").all(id);
    res.json({ ...course, constraints, base_id: base, actual_id: id });
});

app.get("/api/graph_base/:base", (req, res) => {
    const base = req.params.base.toUpperCase();
    const campus = (req.query.campus as string | undefined) ?? undefined;
    const depth = Math.max(1, Math.min(6, Number(req.query.depth) || 2));
    const includeCoreq = String(req.query.includeCoreq || "true") !== "false";

    const rootId = resolveActualId(base, campus);
    if (!rootId) return res.status(404).json({ error: "not found" });

    const nodes = new Set<string>([rootId]);
    const links: Link[] = [];
    const visited = new Set<string>();

    function addOutboundCreditEdges(from: string) {
        const outEdges = db
            .prepare(
                "SELECT source_id,target_id,kind FROM edges WHERE source_id = ? AND kind IN ('EXCLUSION','CREDIT')"
            )
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
            if (e.kind === "CREDIT" || e.kind === "EXCLUSION") continue; // handled outbound from root
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({
                source: e.source_id,
                target: e.target_id,
                kind: e.kind,
                group_id: e.group_id ?? null,
            });
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

    // prune to the root's connected component so no stray islands appear
    const pruned = pruneToConnected(rootId, nodes, links);
    res.json({ ...pruned, base_id: base, actual_id: rootId });
});

// ---- legacy endpoints (optional) ----
app.get("/api/search", (req, res) => {
    const qRaw = String(req.query.q || "").trim().toUpperCase();
    if (!qRaw) {
        const rows = db.prepare("SELECT id FROM courses ORDER BY id LIMIT 50").all();
        return res.json(rows.map((r: any) => r.id));
    }
    const esc = qRaw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const like = `%${esc}%`;
    const rows = db
        .prepare(
            `
                SELECT id FROM courses WHERE id = ?
                UNION
                SELECT id FROM courses WHERE id LIKE ? ESCAPE '\\' AND id <> ?
                ORDER BY id
                    LIMIT 50
            `
        )
        .all(qRaw, like, qRaw);
    res.json(rows.map((r: any) => r.id));
});

app.get("/api/course/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(id);
    if (!course) return res.status(404).json({ error: "not found" });
    const constraints = db.prepare("SELECT * FROM constraints WHERE course_id = ?").all(id);
    res.json({ ...course, constraints });
});

app.get("/api/graph/:id", (req, res) => {
    const id = req.params.id.toUpperCase();
    const depth = Math.max(1, Math.min(6, Number(req.query.depth) || 2));
    const includeCoreq = String(req.query.includeCoreq || "true") !== "false";

    const nodes = new Set<string>([id]);
    const links: Link[] = [];
    const visited = new Set<string>();

    function addOutboundCreditEdges(from: string) {
        const outEdges = db
            .prepare(
                "SELECT source_id,target_id,kind FROM edges WHERE source_id = ? AND kind IN ('EXCLUSION','CREDIT')"
            )
            .all(from) as any[];
        for (const e of outEdges) {
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({ source: e.source_id, target: e.target_id, kind: e.kind, group_id: null });
        }
    }
    addOutboundCreditEdges(id);

    function addEdgesFor(target: string) {
        const rowEdges = db
            .prepare("SELECT source_id,target_id,kind,group_id FROM edges WHERE target_id = ?")
            .all(target) as any[];
        for (const e of rowEdges) {
            if (!includeCoreq && e.kind === "CO_REQ") continue;
            if (e.kind === "CREDIT" || e.kind === "EXCLUSION") continue;
            nodes.add(e.source_id);
            nodes.add(e.target_id);
            links.push({
                source: e.source_id,
                target: e.target_id,
                kind: e.kind,
                group_id: e.group_id ?? null,
            });
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

    const pruned = pruneToConnected(id, nodes, links);
    res.json(pruned);
});

// ---- start ----
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
