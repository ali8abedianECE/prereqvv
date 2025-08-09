const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function searchBases(q = ""): Promise<string[]> {
    const r = await fetch(`${BASE}/api/search_base?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`search_base failed: ${r.status}`);
    return r.json();
}

export async function fetchCourseBase(baseId: string, campus?: "V" | "O" | "AUTO") {
    const params = new URLSearchParams();
    if (campus && campus !== "AUTO") params.set("campus", campus);
    const r = await fetch(`${BASE}/api/course_base/${encodeURIComponent(baseId)}?${params}`);
    if (!r.ok) throw new Error(`course_base not found: ${baseId}`);
    return r.json();
}

export async function fetchGraphBase(baseId: string, depth = 2, includeCoreq = true, campus?: "V" | "O" | "AUTO") {
    const params = new URLSearchParams({ depth: String(depth), includeCoreq: String(includeCoreq) });
    if (campus && campus !== "AUTO") params.set("campus", campus);
    const r = await fetch(`${BASE}/api/graph_base/${encodeURIComponent(baseId)}?${params}`);
    if (!r.ok) throw new Error(`graph_base failed: ${r.status}`);
    return r.json();
}
