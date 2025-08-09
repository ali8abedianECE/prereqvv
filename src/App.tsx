import { useEffect, useMemo, useRef, useState } from "react";
import { searchBases, fetchCourseBase, fetchGraphBase } from "./api";
import TreeView from "./components/TreeView";
import GraphView from "./components/GraphView";
import Legend from "./components/Legend";

type Campus = "AUTO" | "V" | "O";

function DatalistSearch({ options, value, onChange, onSubmit }:{
    options: string[]; value: string; onChange:(v:string)=>void; onSubmit:()=>void;
}) {
    const listId = useRef("bases-" + Math.random().toString(36).slice(2)).current;
    return (
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <label>Course:</label>
            <input
                list={listId}
                placeholder="e.g., CPEN 211"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSubmit(); }}
                style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
            />
            <datalist id={listId}>
                {options.map(b => <option key={b} value={b} />)}
            </datalist>
            <button onClick={onSubmit} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}>
                Load
            </button>
        </div>
    );
}

export default function App() {
    const [bases, setBases] = useState<string[]>([]);
    const [q, setQ] = useState("");
    const [campus, setCampus] = useState<Campus>("AUTO");

    const [depth, setDepth] = useState(2);
    const [includeCoreq, setIncludeCoreq] = useState(true);

    const [course, setCourse] = useState<any>(null);
    const [graph, setGraph] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // search as you type (bases only)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const term = q.trim();
            const list = await searchBases(term.length >= 2 ? term : "");
            if (!cancelled) setBases(list);
        })().catch(console.error);
        return () => { cancelled = true; };
    }, [q]);

    useEffect(() => {
        if (!course?.base_id) return;
        fetchGraphBase(course.base_id, depth, includeCoreq, campus).then(setGraph).catch(e => setErr(String(e)));
    }, [course?.base_id, depth, includeCoreq, campus]);

    async function loadByInput() {
        const base = q.trim();
        if (!base) return;
        try {
            await loadBase(base);
        } catch (e:any) {
            // fallback to first suggestion
            const chosen = bases[0];
            if (chosen) await loadBase(chosen);
            else setErr(e?.message || String(e));
        }
    }

    async function loadBase(baseId: string) {
        setErr(null); setLoading(true);
        try {
            const c = await fetchCourseBase(baseId, campus);
            setCourse(c);
            const g = await fetchGraphBase(baseId, depth, includeCoreq, campus);
            setGraph(g);
            setQ(baseId);
        } catch (e:any) {
            setErr(e?.message || String(e));
            setCourse(null); setGraph(null);
        } finally { setLoading(false); }
    }

    const tree = useMemo(() => {
        try { return course?.tree_json ? JSON.parse(course.tree_json) : null; } catch { return null; }
    }, [course?.tree_json]);

    return (
        <div style={{ padding:16, color:"#e8edf2", background:"#0b0d10", minHeight:"100vh" }}>
            <h2 style={{ marginTop:0 }}>Prerequisite Viewer</h2>

            <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
                <DatalistSearch options={bases} value={q} onChange={setQ} onSubmit={loadByInput} />
                <label>Campus</label>
                <select
                    value={campus}
                    onChange={(e) => setCampus(e.target.value as Campus)}
                    style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                >
                    <option value="AUTO">Auto</option>
                    <option value="V">Vancouver</option>
                    <option value="O">Okanagan</option>
                </select>

                <label>Depth</label>
                <input type="number" min={1} max={6} value={depth}
                       onChange={e => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                       style={{ width:64, padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                />
                <label><input type="checkbox" checked={includeCoreq} onChange={e=>setIncludeCoreq(e.target.checked)} /> include co-reqs</label>
                {loading && <span style={{ color:"#9aa7b1" }}>Loading…</span>}
                {err && <span style={{ color:"#ffb4b4" }}>{err}</span>}
            </div>

            {!course ? (
                <div style={{ color:"#9aa7b1" }}>Type a base course like <code>CPEN 211</code>, pick campus, then <b>Load</b>.</div>
            ) : (
                <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:12 }}>
                    <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                        <h3 style={{ marginTop:0 }}>{course.base_id} <span style={{ opacity:.7, fontWeight:400 }}>(actual: {course.actual_id})</span></h3>
                        {course.credits && <div style={{ opacity:.8, marginBottom:6 }}>Credits: {course.credits}</div>}
                        <div style={{ whiteSpace:"pre-wrap", color:"#9aa7b1" }}>{course.prereq_text || "(no extracted text)"}</div>
                        <hr style={{ borderColor:"#1e242e", margin:"12px 0" }} />
                        <h4 style={{ margin:0 }}>Requirements Tree</h4>
                        <TreeView tree={tree} />
                    </div>

                    <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                        <h4 style={{ marginTop:0 }}>Graph</h4>
                        <Legend />
                        {!graph ? (
                            <div style={{ color:"#9aa7b1" }}>No graph yet. Load a course.</div>
                        ) : (
                            <GraphView
                                key={(graph.actual_id ?? course.actual_id ?? course.id) + "|" + campus + "|" + depth + "|" + (includeCoreq ? "C" : "N")}
                                nodes={graph.nodes}
                                links={graph.links}
                                rootId={graph.actual_id ?? course.actual_id ?? course.id}
                                onNodeClick={(id) => {
                                    const m = id.match(/^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/);
                                    const base = m ? `${m[1]} ${m[3]}` : id;
                                    setQ(base);
                                    (async () => {
                                        try {
                                            const c = await fetchCourseBase(base, campus);
                                            setCourse(c);
                                            const g = await fetchGraphBase(base, depth, includeCoreq, campus);
                                            setGraph(g);
                                        } catch (e: any) {
                                            setErr(e?.message || String(e));
                                        }
                                    })();
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
