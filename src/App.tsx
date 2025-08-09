import { useEffect, useMemo, useRef, useState } from "react";
import { searchBases, fetchCourseBase, fetchGraphBase, fetchGradesBatch } from "./api";
import TreeView from "./components/TreeView";
import GraphView from "./components/GraphView";
import Legend from "./components/Legend";

type Campus = "AUTO" | "V" | "O";

const BASE_RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
const toBase = (id: string) => {
    const m = id.match(BASE_RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
};

// ---- Small, custom combobox for robust suggestions (no <datalist> quirks) ----
function ComboSearch({
                         options,
                         value,
                         onChange,
                         onSubmit,
                     }: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
    onSubmit: (picked?: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const filtered =
        value.trim().length >= 2
            ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()))
            : options.slice(0, 20);

    return (
        <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
            <label style={{ marginRight: 6 }}>Course:</label>
            <input
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        onSubmit();
                        setOpen(false);
                    }
                }}
                placeholder="e.g., CPEN 211"
                style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #2a3240",
                    background: "#141820",
                    color: "#e8edf2",
                    minWidth: 220,
                }}
            />
            <button
                onClick={() => onSubmit()}
                style={{
                    marginLeft: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #2a3240",
                    background: "#141820",
                    color: "#e8edf2",
                }}
            >
                Load
            </button>
            {open && filtered.length > 0 && (
                <div
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        zIndex: 50,
                        width: "100%",
                        background: "#0f141b",
                        border: "1px solid #2a3240",
                        borderRadius: 8,
                        marginTop: 6,
                        maxHeight: 260,
                        overflowY: "auto",
                        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
                    }}
                >
                    {filtered.map((opt) => (
                        <div
                            key={opt}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onSubmit(opt);
                                setOpen(false);
                            }}
                            style={{
                                padding: "8px 10px",
                                cursor: "pointer",
                                color: "#e8edf2",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#151b24")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const GRADES_TIMEOUT_MS = 2500; // fail-safe: render without grades if this expires

export default function App() {
    const [bases, setBases] = useState<string[]>([]);
    const [q, setQ] = useState("");
    const [campus, setCampus] = useState<Campus>("AUTO");

    const [depth, setDepth] = useState(2);
    const [includeCoreq, setIncludeCoreq] = useState(true);

    const [course, setCourse] = useState<any>(null);
    const [graph, setGraph] = useState<any>(null);

    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false); // top-level UI spinner
    const [graphLoading, setGraphLoading] = useState(false);
    const [gradesLoading, setGradesLoading] = useState(false);

    const [gradeMap, setGradeMap] = useState<Record<string, number>>({});
    const [paintReady, setPaintReady] = useState(false);

    // sequence guard to drop stale async results
    const loadSeqRef = useRef(0);

    // suggestions
    useEffect(() => {
        let stop = false;
        (async () => {
            try {
                const list = await searchBases(q.trim().length >= 2 ? q.trim() : "");
                if (!stop) setBases(list);
            } catch (e) {
                if (!stop) setBases([]);
                console.warn("search_base failed", e);
            }
        })();
        return () => {
            stop = true;
        };
    }, [q]);

    // Reindex button: force server to rebuild base index
    async function reindex() {
        try {
            await fetch("/api/reindex", { method: "POST" });
            const list = await searchBases(q.trim().length >= 2 ? q.trim() : "");
            setBases(list);
        } catch (e) {
            console.warn("reindex failed", e);
        }
    }

    // Master loader: course -> graph -> (grades or timeout) -> render
    async function loadBaseAndGraph(baseId: string) {
        const thisSeq = ++loadSeqRef.current;

        setErr(null);
        setLoading(true);
        setGraphLoading(true);
        setGradesLoading(false);
        setPaintReady(false);
        setGradeMap({});

        try {
            const c = await fetchCourseBase(baseId, campus);
            if (thisSeq !== loadSeqRef.current) return;
            setCourse(c);

            const g = await fetchGraphBase(baseId, depth, includeCoreq, campus);
            if (thisSeq !== loadSeqRef.current) return;
            setGraph(g);

            // now grades (but don't block forever)
            const bases = Array.from(new Set((g.nodes as string[]).map((id) => toBase(id))));
            setGradesLoading(true);

            const timeout = new Promise<Record<string, number>>((resolve) =>
                setTimeout(() => resolve({}), GRADES_TIMEOUT_MS)
            );

            let grades: Record<string, number> = {};
            try {
                grades = await Promise.race([fetchGradesBatch(bases, campus), timeout]);
            } catch {
                grades = {};
            }
            if (thisSeq !== loadSeqRef.current) return;
            setGradeMap(grades);

            // all done (or timed out) -> paint
            setPaintReady(true);
        } catch (e: any) {
            if (thisSeq !== loadSeqRef.current) return;
            setErr(e?.message || String(e));
            setCourse(null);
            setGraph(null);
            setGradeMap({});
            setPaintReady(false);
        } finally {
            if (thisSeq === loadSeqRef.current) {
                setLoading(false);
                setGraphLoading(false);
                setGradesLoading(false);
            }
        }
    }

    // When knobs change and a course is selected, reload
    useEffect(() => {
        if (!course?.base_id) return;
        loadBaseAndGraph(course.base_id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depth, includeCoreq, campus]);

    async function loadByInput(picked?: string) {
        const base = (picked ?? q).trim();
        if (!base) return;
        try {
            await loadBaseAndGraph(base);
            setQ(base);
        } catch (e: any) {
            const chosen = bases[0];
            if (chosen) {
                await loadBaseAndGraph(chosen);
                setQ(chosen);
            } else {
                setErr(e?.message || String(e));
            }
        }
    }

    const tree = useMemo(() => {
        try {
            return course?.tree_json ? JSON.parse(course.tree_json) : null;
        } catch {
            return null;
        }
    }, [course?.tree_json]);

    const loadingMsg =
        (graphLoading ? "Loading graph" : "") +
        (graphLoading && gradesLoading ? " + " : "") +
        (!graphLoading && gradesLoading ? "Loading grades" : "") +
        (graphLoading || gradesLoading ? "…" : "");

    return (
        <div style={{ padding: 16, color: "#e8edf2", background: "#0b0d10", minHeight: "100vh" }}>
            <h2 style={{ marginTop: 0 }}>Prerequisite Viewer</h2>

            <div
                style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 12,
                }}
            >
                <ComboSearch options={bases} value={q} onChange={setQ} onSubmit={loadByInput} />

                <button
                    onClick={reindex}
                    title="Re-scan courses table on the server (use after import)"
                    style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                    }}
                >
                    Reindex
                </button>

                <label>Campus</label>
                <select
                    value={campus}
                    onChange={(e) => setCampus(e.target.value as Campus)}
                    style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                    }}
                >
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
                    onChange={(e) => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                    style={{
                        width: 64,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                    }}
                />

                <label>
                    <input
                        type="checkbox"
                        checked={includeCoreq}
                        onChange={(e) => setIncludeCoreq(e.target.checked)}
                    />{" "}
                    include co-reqs
                </label>

                {(loading || graphLoading || gradesLoading) && (
                    <span style={{ color: "#9aa7b1" }}>{loadingMsg || "Loading…"} </span>
                )}
                {err && <span style={{ color: "#ffb4b4" }}>{err}</span>}
            </div>

            {!course ? (
                <div style={{ color: "#9aa7b1" }}>
                    Type a base like <code>CPEN 211</code>, pick campus, then <b>Load</b>. If you imported
                    after the server started, click <b>Reindex</b>.
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12 }}>
                    <div
                        style={{
                            background: "#141820",
                            border: "1px solid #1e242e",
                            borderRadius: 12,
                            padding: 12,
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>
                            {course.base_id}{" "}
                            <span style={{ opacity: 0.7, fontWeight: 400 }}>(actual: {course.actual_id})</span>
                        </h3>
                        {course.credits && (
                            <div style={{ opacity: 0.8, marginBottom: 6 }}>Credits: {course.credits}</div>
                        )}
                        <div style={{ whiteSpace: "pre-wrap", color: "#9aa7b1" }}>
                            {course.prereq_text || "(no extracted text)"}
                        </div>
                        <hr style={{ borderColor: "#1e242e", margin: "12px 0" }} />
                        <h4 style={{ margin: 0 }}>Requirements Tree</h4>
                        <TreeView tree={tree} />
                    </div>

                    <div
                        style={{
                            background: "#141820",
                            border: "1px solid #1e242e",
                            borderRadius: 12,
                            padding: 12,
                            minHeight: "70vh",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {!paintReady || !graph ? (
                            // seamless feel while we wait for grades or timeout
                            <div style={{ color: "#9aa7b1", fontSize: 14 }}>
                                {gradesLoading
                                    ? "Fetching course averages…"
                                    : graphLoading
                                        ? "Building graph…"
                                        : "Finalizing…"}
                            </div>
                        ) : (
                            <div style={{ width: "100%" }}>
                                <h4 style={{ marginTop: 0 }}>Graph</h4>
                                <Legend />
                                <GraphView
                                    nodes={graph.nodes}
                                    links={graph.links}
                                    rootId={graph.actual_id ?? course.actual_id ?? course.id}
                                    grades={gradeMap}
                                    onNodeClick={(id) => {
                                        const m = id.match(BASE_RE);
                                        const base = m ? `${m[1]} ${m[3]}` : id;
                                        setQ(base);
                                        loadBaseAndGraph(base).catch((e) =>
                                            setErr((e as any)?.message || String(e))
                                        );
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

    );
}
