const API = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export async function searchBases(q: string) {
    const r = await fetch(`${API}/api/search_base?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error("search failed");
    return r.json();
}

export async function fetchCourseBase(baseId: string, campus: string | null) {
    const r = await fetch(`${API}/api/course_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "course fetch failed");
    return j;
}

export async function fetchGraphBase(baseId: string, depth: number, includeCoreq: boolean, campus: string | null) {
    const u = `${API}/api/graph_base/${encodeURIComponent(baseId)}?depth=${depth}&includeCoreq=${includeCoreq ? "true" : "false"}&campus=${encodeURIComponent(campus || "")}`;
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "graph fetch failed");
    return j;
}

export async function fetchGradeAverage(baseId: string, campus: string | null) {
    const r = await fetch(`${API}/api/grades_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`);
    if (!r.ok) return { base: baseId, average: null };
    return r.json();
}

export async function planTwoTerms(baseId: string, campus: string | null, completed: string[]) {
    const r = await fetch(`${API}/api/plan_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(campus || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "plan failed");
    return j;
}
