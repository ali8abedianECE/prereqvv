const API = (import.meta as any).env.VITE_API_BASE || "";

export type Link = { source: string; target: string; kind: string; group_id?: string | null };

export type GraphResponse = {
    nodes: string[];
    links: Link[];
    base_id?: string;
    actual_id?: string;
    averages?: Record<string, number>;
    averagesByBase?: Record<string, number>;
};

export type CourseBaseResponse = {
    id: string;
    title?: string | null;
    credits?: string | null;
    prereq_text?: string | null;
    tree_json?: string | null;
    constraints: any[];
    base_id: string;
    actual_id: string;
};

export type PlanResponse = {
    ok: boolean;
    plan: { term1: string[]; term2: string[] };
    note?: string;
};

export async function searchBases(q: string) {
    const r = await fetch(`${API}/api/search_base?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error("search failed");
    return r.json() as Promise<string[]>;
}

export async function fetchCourseBase(baseId: string, campus: string | null) {
    const r = await fetch(
        `${API}/api/course_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "course fetch failed");
    return j as CourseBaseResponse;
}

export async function fetchGraphBase(baseId: string, depth: number, includeCoreq: boolean, campus: string | null) {
    const u = `${API}/api/graph_base/${encodeURIComponent(baseId)}?depth=${depth}&includeCoreq=${
        includeCoreq ? "true" : "false"
    }&campus=${encodeURIComponent(campus || "")}`;
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "graph fetch failed");
    return j as GraphResponse;
}

export async function fetchGradeAverage(baseId: string, campus: string | null) {
    const r = await fetch(
        `${API}/api/grades_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`
    );
    if (!r.ok) return { base: baseId, average: null as number | null };
    return r.json() as Promise<{ base: string; average: number | null; actual_id?: string }>;
}

export async function planTwoTerms(baseId: string, campus: string | null, completed: string[]) {
    const r = await fetch(
        `${API}/api/plan_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed }),
        }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "plan failed");
    return j as PlanResponse;
}
