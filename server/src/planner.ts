import Database from "better-sqlite3";

type Campus = "V" | "O" | "AUTO" | "" | null | undefined;

type Tree =
    | { type: "course"; id: string }
    | {
    op: "AND" | "OR" | "MIN";
    min?: number;
    meta?: { kind?: string };
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

type Edge = { src: string; tgt: string; coreq: boolean };
type Mode = "easiest" | "hardest" | "fewest" | "all";

const BASE_RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
const toBase = (id: string) => {
    const m = id.toUpperCase().match(BASE_RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
};
const campusToUbcGrades = (c: Exclude<Campus, "AUTO" | "" | undefined | null>) =>
    c === "V" ? "UBCV" : "UBCO";

export function buildBaseIndex(db: Database.Database) {
    const out = new Map<string, { ids: Record<string, string> }>();
    const rows = db.prepare("SELECT id FROM courses").all() as Array<{ id: string }>;
    for (const r of rows) {
        const m = r.id.match(BASE_RE);
        if (!m) {
            const base = r.id.toUpperCase();
            const entry = out.get(base) || { ids: {} as Record<string, string> };
            if (!entry.ids["V"]) entry.ids["V"] = r.id;
            out.set(base, entry);
        } else {
            const base = `${m[1]} ${m[3]}`;
            const campus = m[2] || "V";
            const entry = out.get(base) || { ids: {} as Record<string, string> };
            entry.ids[campus] = r.id;
            out.set(base, entry);
        }
    }
    return out;
}

export function resolveActualId(
    baseIndex: Map<string, { ids: Record<string, string> }>,
    base: string,
    campus: Campus
): string | null {
    const e = baseIndex.get(base.toUpperCase());
    if (!e) return null;
    const pref = (campus || "").toUpperCase();
    if (pref && pref !== "AUTO" && e.ids[pref]) return e.ids[pref];
    return e.ids["V"] || e.ids["O"] || Object.values(e.ids)[0] || null;
}

async function fetchAvgForBase(
    base: string,
    campus: Campus
): Promise<number | null> {
    const c = campus && campus !== "AUTO" ? campus : "V";
    const m = base.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)$/);
    if (!m) return null;
    const subj = m[1];
    const course = m[2];
    const url = `https://ubcgrades.com/api/recent-section-averages/${campusToUbcGrades(
        c as "V" | "O"
    )}/${encodeURIComponent(subj)}/${encodeURIComponent(course)}`;
    try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
        const r = await fetch(url, { signal: ac.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        const data = (await r.json()) as Array<{ average?: number; section?: string }>;
        if (!Array.isArray(data) || data.length === 0) return null;
        const overall = data.find((d) => (d.section || "").toUpperCase() === "OVERALL");
        if (overall?.average && isFinite(overall.average)) return overall.average;
        const vals = data.map((d) => d.average).filter((x) => typeof x === "number") as number[];
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    } catch {
        return null;
    }
}

function weightFromAvg(avg: number | null | undefined) {
    if (avg == null || !isFinite(avg)) return 25;
    return Math.max(0, 100 - avg);
}

type Cache = {
    treeByActual: Map<string, Tree | null>;
    avgByBase: Map<string, number | null>;
    costMemo: Map<string, { easiest: number; hardest: number; fewest: number }>;
};

function getTree(db: Database.Database, id: string, cache: Cache): Tree | null {
    if (cache.treeByActual.has(id)) return cache.treeByActual.get(id) || null;
    const row = db.prepare("SELECT tree_json FROM courses WHERE id = ?").get(id) as
        | { tree_json: string | null }
        | undefined;
    const t = row?.tree_json ? safeJSON<Tree>(row.tree_json) : null;
    cache.treeByActual.set(id, t);
    return t;
}

function safeJSON<T>(s: string): T | null {
    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

async function getAvg(base: string, campus: Campus, cache: Cache) {
    if (cache.avgByBase.has(base)) return cache.avgByBase.get(base) ?? null;
    const v = await fetchAvgForBase(base, campus);
    cache.avgByBase.set(base, v);
    return v;
}

export type Plan = {
    courses: string[];
    edges: Edge[];
    terms: string[][];
    cost: number;
};

type SelectRes = {
    set: Set<string>;
    edges: Edge[];
    cost: number;
};

function isCoreqMeta(n?: { kind?: string }) {
    const k = (n?.kind || "").toUpperCase();
    return k === "CO_REQ" || k === "COREQ";
}

export async function planCourse(
    db: Database.Database,
    baseIndex: Map<string, { ids: Record<string, string> }>,
    base: string,
    campus: Campus,
    completedBases: string[],
    mode: Mode,
    kMax = 5
): Promise<{ root_actual: string; plans: Plan[] }> {
    const cache: Cache = {
        treeByActual: new Map(),
        avgByBase: new Map(),
        costMemo: new Map(),
    };

    const completed = new Set(completedBases.map((x) => x.toUpperCase().trim()));

    const rootActual = resolveActualId(baseIndex, base, campus);
    if (!rootActual) throw new Error("course not found");

    const picked = await pickSet(db, baseIndex, rootActual, campus, completed, cache, mode);
    const mainPlan = schedule(picked.set, picked.edges, rootActual);

    if (mode !== "all") {
        return { root_actual: rootActual, plans: [{ ...mainPlan, cost: picked.cost }] };
    }

    const alts = await enumerateAlternatives(
        db,
        baseIndex,
        rootActual,
        campus,
        completed,
        cache,
        kMax
    );

    const plans: Plan[] = alts.map((a) => ({ ...schedule(a.set, a.edges, rootActual), cost: a.cost }));
    return { root_actual: rootActual, plans };
}

async function pickSet(
    db: Database.Database,
    baseIndex: Map<string, { ids: Record<string, string> }>,
    targetActual: string,
    campus: Campus,
    completed: Set<string>,
    cache: Cache,
    mode: Mode
): Promise<SelectRes> {
    const seenStack = new Set<string>();
    async function solveNode(
        node: Tree | null,
        parent: string,
        parentCoreq: boolean
    ): Promise<SelectRes> {
        if (!node) return { set: new Set(), edges: [], cost: 0 };

        if ("type" in node && node.type === "course") {
            const base = toBase(node.id);
            if (completed.has(base)) return { set: new Set(), edges: [], cost: 0 };

            const set = new Set<string>([node.id]);
            const edges: Edge[] = [];
            if (node.id !== parent) edges.push({ src: node.id, tgt: parent, coreq: parentCoreq });

            if (seenStack.has(node.id)) return { set, edges, cost: await weightOf(node.id) };
            seenStack.add(node.id);
            const subTree = getTree(db, node.id, cache);
            const subRes = await solveNode(subTree, node.id, false);
            seenStack.delete(node.id);

            subRes.set.forEach((c) => set.add(c));
            edges.push(...subRes.edges);
            const cost = (await weightOf(node.id)) + subRes.cost;
            return { set, edges, cost };
        }

        if ("constraint" in node) return { set: new Set(), edges: [], cost: 0 };

        if ("op" in node) {
            const coreqHere = parentCoreq || isCoreqMeta(node.meta);
            if (node.op === "AND") {
                const agg: SelectRes = { set: new Set(), edges: [], cost: 0 };
                for (const ch of node.children || []) {
                    const r = await solveNode(ch, parent, coreqHere);
                    r.set.forEach((c) => agg.set.add(c));
                    agg.edges.push(...r.edges);
                    agg.cost += r.cost;
                }
                return agg;
            }
            const want = node.op === "OR" ? 1 : Math.max(1, node.min || 1);
            const opts: SelectRes[] = [];
            for (const ch of node.children || []) {
                opts.push(await solveNode(ch, parent, coreqHere));
            }
            const scored = await Promise.all(
                opts.map(async (r) => ({
                    r,
                    s:
                        mode === "fewest"
                            ? r.set.size
                            : mode === "hardest"
                                ? r.cost * -1
                                : r.cost,
                }))
            );
            scored.sort((a, b) => a.s - b.s);
            const pick = scored.slice(0, want).map((x) => x.r);
            const agg: SelectRes = { set: new Set(), edges: [], cost: 0 };
            for (const pr of pick) {
                pr.set.forEach((c) => agg.set.add(c));
                agg.edges.push(...pr.edges);
                agg.cost += pr.cost;
            }
            return agg;
        }
        return { set: new Set(), edges: [], cost: 0 };
    }

    async function weightOf(actual: string) {
        const base = toBase(actual);
        const key = `${base}`;
        if (cache.costMemo.has(key)) {
            const m = cache.costMemo.get(key)!;
            if (mode === "fewest") return 1;
            if (mode === "hardest") return m.hardest;
            return m.easiest;
        }
        const avg = await getAvg(base, campus, cache);
        const w = weightFromAvg(avg);
        const memo = { easiest: w, hardest: w, fewest: 1 };
        cache.costMemo.set(key, memo);
        if (mode === "fewest") return 1;
        if (mode === "hardest") return w;
        return w;
    }

    const rootTree = getTree(db, targetActual, cache);
    const picked = await solveNode(rootTree, targetActual, false);
    return picked;
}

async function enumerateAlternatives(
    db: Database.Database,
    baseIndex: Map<string, { ids: Record<string, string> }>,
    targetActual: string,
    campus: Campus,
    completed: Set<string>,
    cache: Cache,
    kMax: number
): Promise<Array<{ set: Set<string>; edges: Edge[]; cost: number }>> {
    const res = await pickSet(db, baseIndex, targetActual, campus, completed, cache, "easiest");
    const uniq = new Set<string>();
    const out: Array<{ set: Set<string>; edges: Edge[]; cost: number }> = [];
    function keyOf(s: Set<string>) {
        return Array.from(s).sort().join("|");
    }
    out.push(res);
    uniq.add(keyOf(res.set));

    async function walk(node: Tree | null, parent: string) {
        if (!node) return;
        if ("op" in node) {
            const want = node.op === "OR" ? 1 : Math.max(1, node.min || 1);
            if (want >= 1 && node.children.length > want) {
                const picks = await Promise.all(
                    node.children.map(async () => await pickSet(db, baseIndex, parent, campus, completed, cache, "easiest"))
                );
                for (let i = 0; i < node.children.length && out.length < kMax; i++) {
                    const s = picks[i];
                    const k = keyOf(s.set);
                    if (!uniq.has(k)) {
                        uniq.add(k);
                        out.push(s);
                        if (out.length >= kMax) break;
                    }
                }
            }
            for (const ch of node.children) await walk(ch, parent);
        }
    }
    const t = getTree(db, targetActual, cache);
    await walk(t, targetActual);
    return out.slice(0, kMax);
}

function schedule(set: Set<string>, edges: Edge[], rootActual: string) {
    const need = new Set(set);
    need.delete(rootActual);
    const reqEdges = edges.filter((e) => !e.coreq && need.has(e.src) && (need.has(e.tgt) || e.tgt === rootActual));
    const coEdges = edges.filter((e) => e.coreq && need.has(e.src) && (need.has(e.tgt) || e.tgt === rootActual));

    const preds = new Map<string, Set<string>>();
    const succs = new Map<string, Set<string>>();
    for (const n of need) {
        preds.set(n, new Set());
        succs.set(n, new Set());
    }
    for (const e of reqEdges) {
        if (!preds.has(e.tgt)) preds.set(e.tgt, new Set());
        if (!succs.has(e.src)) succs.set(e.src, new Set());
        preds.get(e.tgt)!.add(e.src);
        succs.get(e.src)!.add(e.tgt);
    }

    const terms: string[][] = [];
    const scheduled = new Set<string>();
    while (scheduled.size < need.size) {
        const layer: string[] = [];
        for (const n of need) {
            if (scheduled.has(n)) continue;
            const p = preds.get(n) || new Set();
            let ok = true;
            for (const pr of p) if (!scheduled.has(pr)) { ok = false; break; }
            if (ok) layer.push(n);
        }
        if (layer.length === 0) {
            const rest = Array.from(need).filter((n) => !scheduled.has(n));
            terms.push(rest);
            break;
        }
        for (const n of layer) scheduled.add(n);
        terms.push(layer);
    }

    const termOf = new Map<string, number>();
    terms.forEach((arr, i) => arr.forEach((n) => termOf.set(n, i)));

    for (const e of coEdges) {
        const tTgt = e.tgt === rootActual ? terms.length : (termOf.get(e.tgt) ?? terms.length - 1);
        const tSrc = termOf.get(e.src);
        if (tSrc == null) continue;
        if (tSrc < tTgt) continue;
        if (tSrc > tTgt && tTgt < terms.length) {
            const curArr = terms[tSrc];
            const i = curArr.indexOf(e.src);
            if (i >= 0) curArr.splice(i, 1);
            if (!terms[tTgt]) terms[tTgt] = [];
            terms[tTgt].push(e.src);
            termOf.set(e.src, tTgt);
        }
    }

    const ordered = terms.filter((a) => a.length > 0);
    const finalEdges = edges.filter(
        (e) => need.has(e.src) && ((need.has(e.tgt) && e.tgt !== e.src) || e.tgt === rootActual)
    );
    return { courses: Array.from(need).sort(), edges: finalEdges, terms: ordered, cost: 0 };
}
