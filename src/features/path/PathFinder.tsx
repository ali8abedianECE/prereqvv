// src/features/path/PathFinder.tsx
import React from "react";
import {
    Campus,
    searchBases,
    fetchCourseBase,
    fetchGraphBase,
    fetchGradeAverage,
    planTwoTerms,
    toBase,
} from "../../api/viz";
import TreeView from "../../components/TreeView";
import GraphView from "../../components/GraphView";

/** ───────────────── helpers ───────────────── */
type Link = { source: string; target: string; kind: string; group_id?: string | null };
type GraphPayload = { nodes: string[]; links: Link[]; base_id: string; actual_id: string };

function parseCompletedInput(s: string) {
    return s
        .split(/[,\n]/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .map(toBase);
}

function DatalistSearch({
                            options,
                            value,
                            onChange,
                            onSubmit,
                        }: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
}) {
    const listId = React.useRef("bases-" + Math.random().toString(36).slice(2)).current;
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>Course:</label>
            <input
                list={listId}
                placeholder="e.g., CPEN 211"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmit();
                }}
                style={{ width: 180 }}
            />
            <datalist id={listId}>{options.map((b) => <option key={b} value={b} />)}</datalist>
            <button onClick={onSubmit}>Load</button>
        </div>
    );
}

/** ───────────────── main ───────────────── */
export default function PathFinder({ defaultBase }: { defaultBase?: string }) {
    // query & suggestions
    const [q, setQ] = React.useState(defaultBase ?? "");
    const [bases, setBases] = React.useState<string[]>([]);
    const [campus, setCampus] = React.useState<Campus>("AUTO");
    const [depth, setDepth] = React.useState(2);
    const [includeCoreq, setIncludeCoreq] = React.useState(true);

    // loaded course + graph + grades
    const [course, setCourse] = React.useState<any>(null);
    const [graph, setGraph] = React.useState<GraphPayload | null>(null);
    const [grades, setGrades] = React.useState<Record<string, number | null>>({});

    // selection & planning
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [completedFree, setCompletedFree] = React.useState<string[]>([]);
    const [pickerText, setPickerText] = React.useState("");
    const [completedText, setCompletedText] = React.useState("");
    const [plans, setPlans] = React.useState<{ term1: string[]; term2: string[] } | null>(null);

    // status
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const [planErr, setPlanErr] = React.useState<string | null>(null);
    const [planning, setPlanning] = React.useState(false);

    /** suggestions for the course box */
    React.useEffect(() => {
        let stop = false;
        (async () => {
            const term = q.trim();
            const list = await searchBases(term.length >= 2 ? term : "");
            if (!stop) setBases(list);
        })().catch(() => {});
        return () => {
            stop = true;
        };
    }, [q]);

    /** load one base (e.g. CPEN 211) */
    async function loadBase(baseId: string) {
        if (!baseId.trim()) return;
        const base = toBase(baseId);
        setErr(null);
        setLoading(true);
        setCourse(null);
        setGraph(null);
        setGrades({});
        setPlans(null);
        setPlanErr(null);
        setSelected(new Set());
        setCompletedFree([]);
        setCompletedText("");

        try {
            const c = await fetchCourseBase(base, campus);
            setCourse(c);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    /** fetch graph + grade avgs when course/controls change */
    React.useEffect(() => {
        let stop = false;
        async function run() {
            if (!course?.base_id) return;
            try {
                const g = await fetchGraphBase(course.base_id, depth, includeCoreq, campus);
                if (stop) return;
                setGraph(g);

                const nodes = new Set<string>(g.nodes.map((id: string) => toBase(id)));
                nodes.add(course.base_id);

                const results = await Promise.all(
                    Array.from(nodes).map((b) => fetchGradeAverage(b, campus).catch(() => ({ base: b, average: null })))
                );
                if (stop) return;
                const map: Record<string, number | null> = {};
                for (const r of results) map[r.base] = r?.average ?? null;
                setGrades(map);
            } catch {
                if (!stop) setGraph(null);
            }
        }
        run();
        return () => {
            stop = true;
        };
    }, [course?.base_id, depth, includeCoreq, campus]);

    /** requirements tree */
    const tree = React.useMemo(() => {
        try {
            return course?.tree_json ? JSON.parse(course.tree_json) : null;
        } catch {
            return null;
        }
    }, [course?.tree_json]);

    function toggleSelected(b: string) {
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(b)) n.delete(b);
            else n.add(b);
            return n;
        });
    }

    function addPicker() {
        const b = toBase(pickerText.trim());
        if (!b) return;
        setCompletedFree((prev) => (prev.includes(b) ? prev : [...prev, b]));
        setPickerText("");
    }

    async function doPlan() {
        if (!course?.base_id) return;
        setPlanning(true);
        setPlanErr(null);
        setPlans(null);
        try {
            const manualCompleted = parseCompletedInput(completedText);
            const combined = Array.from(new Set<string>([...Array.from(selected), ...completedFree, ...manualCompleted]));
            const r = await planTwoTerms(course.base_id, campus, combined);
            setPlans(r.plan);
        } catch (e: any) {
            setPlanErr(e?.message || String(e));
        } finally {
            setPlanning(false);
        }
    }

    /** ─────────────── layout: info left, graph right ───────────────
     * This container is pinned to the viewport height so the page doesn’t scroll.
     * Only the LEFT card will scroll internally if its content is long.
     */
    const SHELL_H = "calc(100dvh - 120px)"; // leave room for tab bar/header; tweak if needed

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "minmax(420px, 560px) 1fr",
                gap: 12,
                alignItems: "stretch",
                height: SHELL_H,
                overflow: "hidden", // page stays fixed height
            }}
        >
            {/* LEFT: info / controls — scroll only here */}
            <div className="card" style={{ minHeight: 0, overflowY: "auto", paddingBottom: 12 }}>
                <div className="card-h">
                    <h3>Path Finder</h3>
                    {loading && <span className="muted">Loading…</span>}
                    {err && <span className="error">{err}</span>}
                </div>

                {/* Top controls */}
                <div className="toolbar" style={{ marginBottom: 12, position: "sticky", top: 0, background: "var(--bg, #0e1520)", zIndex: 1, paddingTop: 4 }}>
                    <DatalistSearch options={bases} value={q} onChange={setQ} onSubmit={() => loadBase(q)} />
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                        <label>Campus</label>
                        <select value={campus} onChange={(e) => setCampus(e.target.value as Campus)}>
                            <option value="AUTO">Auto</option>
                            <option value="V">Vancouver</option>
                            <option value="O">Okanagan</option>
                        </select>
                        <label>Depth</label>
                        <input
                            type="number"
                            min={1}
                            max={6}
                            value={depth}
                            onChange={(e) => {
                                const v = Math.max(1, Math.min(6, Number(e.target.value) || 1));
                                setDepth(v);
                            }}
                            style={{ width: 64 }}
                        />
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={includeCoreq} onChange={(e) => setIncludeCoreq(e.target.checked)} />
                            include co-reqs
                        </label>
                    </div>
                    {err && <div className="error" style={{ marginTop: 6 }}>{err}</div>}
                </div>

                {!course ? (
                    <div className="muted">Type a base course like <code>CPEN 211</code>, pick campus, then <b>Load</b>.</div>
                ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                        {/* Course header */}
                        <div>
                            <h3 style={{ marginTop: 0 }}>
                                {course.base_id}{" "}
                                <span className="muted" style={{ fontWeight: 400 }}>
                  (actual: {course.actual_id})
                </span>
                            </h3>
                            {course.credits && (
                                <div className="muted" style={{ marginBottom: 6 }}>
                                    Credits: {course.credits}
                                </div>
                            )}
                            <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                                {course.prereq_text || "(no extracted prerequisite text)"}
                            </div>
                        </div>

                        {/* Requirements */}
                        <div>
                            <h4 style={{ margin: "8px 0" }}>Requirements</h4>
                            <TreeView tree={tree} onToggle={toggleSelected} selected={selected} />
                        </div>

                        {/* Completed selection & planning */}
                        <div style={{ display: "grid", gap: 10 }}>
                            <div className="muted">Mark completed (for this course)</div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {Array.from(selected).map((b) => (
                                    <span
                                        key={b}
                                        onClick={() => toggleSelected(b)}
                                        style={{
                                            padding: "4px 8px",
                                            borderRadius: 8,
                                            border: "1px solid #2a3240",
                                            background: "#20314a",
                                            cursor: "pointer",
                                        }}
                                        title="Click to unselect"
                                    >
                    {b} ×
                  </span>
                                ))}

                                {completedFree.map((b) => (
                                    <span
                                        key={b}
                                        onClick={() => setCompletedFree((prev) => prev.filter((x) => x !== b))}
                                        style={{
                                            padding: "4px 8px",
                                            borderRadius: 8,
                                            border: "1px solid #2a3240",
                                            background: "#20314a",
                                            cursor: "pointer",
                                        }}
                                        title="Click to remove"
                                    >
                    {b} ×
                  </span>
                                ))}
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <div className="muted">Add completed via picker</div>
                                <input
                                    placeholder="Type base code e.g. PHYS 158"
                                    value={pickerText}
                                    onChange={(e) => setPickerText(e.target.value)}
                                    style={{ width: 180 }}
                                />
                                <button onClick={addPicker}>Add</button>
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                                <div className="muted">Additional completed (comma or newline separated)</div>
                                <textarea
                                    placeholder="e.g. MATH 100, MATH 101"
                                    value={completedText}
                                    onChange={(e) => setCompletedText(e.target.value)}
                                    rows={3}
                                    style={{
                                        padding: 10,
                                        borderRadius: 8,
                                        border: "1px solid #2a3240",
                                        background: "#141820",
                                        color: "#e8edf2",
                                        resize: "vertical",
                                    }}
                                />
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <button onClick={doPlan} disabled={planning}>
                                    {planning ? "Planning…" : `Plan path to ${course.base_id}`}
                                </button>
                                {planErr && <div className="error">{planErr}</div>}
                            </div>

                            {plans && (
                                <div className="card" style={{ background: "#0e1520" }}>
                                    <div className="card-h">
                                        <h4 style={{ margin: 0 }}>2-term plan</h4>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                        <div>
                                            <div className="muted" style={{ marginBottom: 6 }}>
                                                Term 1
                                            </div>
                                            <div>{plans.term1.length ? plans.term1.join(", ") : "(none)"}</div>
                                        </div>
                                        <div>
                                            <div className="muted" style={{ marginBottom: 6 }}>
                                                Term 2
                                            </div>
                                            <div>{plans.term2.length ? plans.term2.join(", ") : "(none)"}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT: graph — unchanged; no page scroll */}
            <div className="card" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div className="card-h" style={{ alignItems: "baseline" }}>
                    <h3>Graph</h3>
                    <span className="muted" style={{ marginLeft: "auto" }}>
            Click nodes to jump; wheel to zoom/pan (inside the graph)
          </span>
                </div>

                {graph ? (
                    <>
                        <div className="muted" style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, background: "#5aa9e6", display: "inline-block" }} />
                prereq
              </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, background: "#a78bfa", display: "inline-block" }} />
                co-req
              </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, background: "#4ade80", display: "inline-block" }} />
                credit granted
              </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, background: "#9aa7b1", display: "inline-block" }} />
                exclusion
              </span>
                        </div>

                        {/* GraphView stays exactly as before */}
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <GraphView
                                nodes={graph.nodes}
                                links={graph.links}
                                rootId={graph.actual_id}
                                grades={grades}
                                onNodeClick={(id: string) => {
                                    // Normalize like before
                                    const parts = id.replace(/\s+/, " ").split(" ");
                                    const normalized = parts.length >= 2 ? `${parts[0].replace(/_.*/, "")} ${parts[1]}` : id;
                                    setQ(normalized);
                                    loadBase(normalized);
                                }}
                            />
                        </div>
                    </>
                ) : (
                    <div className="muted">No graph loaded yet.</div>
                )}
            </div>
        </div>
    );
}
