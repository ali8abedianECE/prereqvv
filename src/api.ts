export async function searchBases(q: string): Promise<string[]> {
    const r = await fetch(`/api/search_base?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`search ${r.status}`);
    return r.json();
}

export async function fetchCourseBase(baseId: string, campus: "AUTO" | "V" | "O") {
    const c = campus === "O" ? "O" : campus === "V" ? "V" : "AUTO";
    const r = await fetch(
        `/api/course_base/${encodeURIComponent(baseId)}?campus=${encodeURIComponent(c)}`
    );
    if (!r.ok) throw new Error(`course ${r.status}`);
    return r.json();
}

export async function fetchGraphBase(
    baseId: string,
    depth: number,
    includeCoreq: boolean,
    campus: "AUTO" | "V" | "O"
) {
    const c = campus === "O" ? "O" : campus === "V" ? "V" : "AUTO";
    const qs = new URLSearchParams({
        depth: String(depth),
        includeCoreq: String(!!includeCoreq),
        campus: c,
    });
    const r = await fetch(`/api/graph_base/${encodeURIComponent(baseId)}?${qs.toString()}`);
    if (!r.ok) throw new Error(`graph ${r.status}`);
    return r.json();
}

export async function fetchGradesBatch(
    bases: string[],
    campus: "AUTO" | "V" | "O"
): Promise<Record<string, number>> {
    const c = campus === "O" ? "O" : "V"; // AUTO -> V default
    if (!bases.length) return {};
    const q = encodeURIComponent(bases.join(","));
    const r = await fetch(`/api/grades_batch?campus=${c}&bases=${q}`);
    if (!r.ok) throw new Error(`grades ${r.status}`);
    const data = await r.json();
    const out: Record<string, number> = {};
    for (const it of data.items as Array<{ base_id: string; latestAverage: number | null }>) {
        if (typeof it.latestAverage === "number") out[it.base_id] = it.latestAverage;
    }
    return out;
}
