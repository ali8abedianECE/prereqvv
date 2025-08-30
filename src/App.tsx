// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { searchBases, fetchCourseBase, fetchGraphBase, fetchGradeAverage, planTwoTerms } from "./api";
import TreeView from "./components/TreeView";
import GraphView from "./components/GraphView";

import CourseStatsTable from "./components/CourseStatsTable";
import SectionsTable from "./components/SectionsTable";
import { fetchCourseStats, fetchSections, type CourseStatRow, type SectionRow } from "./api/viz";

type Campus = "AUTO" | "V" | "O";

function DatalistSearch({
                            options, value, onChange, onSubmit,
                        }:{
    options: string[];
    value: string;
    onChange:(v:string)=>void;
    onSubmit:()=>void;
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
            <datalist id={listId}>{options.map(b => <option key={b} value={b} />)}</datalist>
            <button
                onClick={onSubmit}
                style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
            >
                Load
            </button>
        </div>
    );
}

const RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
const toBase = (id: string) => {
    const m = id.toUpperCase().match(RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
};

function parseCompletedInput(s: string) {
    return s.split(/[,\n]/).map(x => x.trim()).filter(Boolean).map(toBase);
}

export default function App() {
    const [bases, setBases] = useState<string[]>([]);
    const [q, setQ] = useState("");
    const [campus, setCampus] = useState<Campus>("AUTO");
    const [depth, setDepth] = useState(2);
    const [includeCoreq, setIncludeCoreq] = useState(true);

    const [course, setCourse] = useState<any>(null);
    const [graph, setGraph] = useState<any>(null);
    const [grades, setGrades] = useState<Record<string, number | null>>({});
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [completedFree, setCompletedFree] = useState<string[]>([]);
    const [pickerText, setPickerText] = useState("");
    const [completedText, setCompletedText] = useState("");
    const [plans, setPlans] = useState<any>(null);
    const [planErr, setPlanErr] = useState<string | null>(null);
    const [planning, setPlanning] = useState(false);

    // VIZ states
    const [courseStats, setCourseStats] = useState<CourseStatRow[] | null>(null);
    const [sections, setSections] = useState<SectionRow[] | null>(null);

    // live suggestions for course search
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const term = q.trim();
            const list = await searchBases(term.length >= 2 ? term : "");
            if (!cancelled) setBases(list);
        })().catch(() => {});
        return () => { cancelled = true; };
    }, [q]);

    // load graph + grade averages when base changes / options change
    useEffect(() => {
        if (!course?.base_id) return;
        let cancelled = false;
        (async () => {
            try {
                const g = await fetchGraphBase(course.base_id, depth, includeCoreq, campus);
                if (cancelled) return;
                setGraph(g);
                const basesSet = new Set<string>(g.nodes.map((id: string) => toBase(id)));
                basesSet.add(course.base_id);
                const entries = Array.from(basesSet);
                const results = await Promise.all(entries.map(b => fetchGradeAverage(b, campus)));
                if (cancelled) return;
                const map: Record<string, number | null> = {};
                for (const r of results) map[r.base] = r.average ?? null;
                setGrades(map);
            } catch {
                if (!cancelled) setGraph(null);
            }
        })();
        return () => { cancelled = true; };
    }, [course?.base_id, depth, includeCoreq, campus]);

    // load viz panels when course changes
    useEffect(() => {
        const base = course?.base_id as string | undefined; // e.g. "CPEN 211"
        if (!base) { setCourseStats(null); setSections(null); return; }
        const m = base.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)$/i);
        if (!m) { setCourseStats(null); setSections(null); return; }
        const [, subject, number] = m;
        let cancelled = false;

        (async () => {
            try {
                const [stats, secs] = await Promise.all([
                    fetchCourseStats(`${subject} ${number}`),
                    fetchSections(subject, number),
                ]);
                if (!cancelled) {
                    setCourseStats(stats);
                    setSections(secs);
                }
            } catch {
                if (!cancelled) {
                    setCourseStats([]);
                    setSections([]);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [course?.base_id]);

    async function loadByInput() {
        const base = q.trim();
        if (!base) return;
        await loadBase(base);
    }

    async function loadBase(baseId: string) {
        setErr(null); setLoading(true);
        try {
            const c = await fetchCourseBase(baseId, campus);
            setCourse(c);
            setSelected(new Set());
            setCompletedFree([]);
            setCompletedText("");
            setPlans(null);
            setPlanErr(null);
        } catch (e:any) {
            setErr(e?.message || String(e));
            setCourse(null); setGraph(null);
        } finally { setLoading(false); }
    }

    const tree = useMemo(() => {
        try { return course?.tree_json ? JSON.parse(course.tree_json) : null; } catch { return null; }
    }, [course?.tree_json]);

    function toggleSelected(b: string) {
        setSelected(prev => {
            const n = new Set(prev);
            if (n.has(b)) n.delete(b); else n.add(b);
            return n;
        });
    }

    function addPicker() {
        const b = toBase(pickerText.trim());
        if (!b) return;
        setCompletedFree(prev => prev.includes(b) ? prev : [...prev, b]);
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
            setPlans(r);
        } catch (e:any) {
            setPlanErr(e.message || String(e));
        } finally {
            setPlanning(false);
        }
    }

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
                <input
                    type="number" min={1} max={6} value={depth}
                    onChange={e => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                    style={{ width:64, padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                />
                <label>
                    <input type="checkbox" checked={includeCoreq} onChange={e=>setIncludeCoreq(e.target.checked)} /> include co-reqs
                </label>
                {loading && <span style={{ color:"#9aa7b1" }}>Loading…</span>}
                {err && <span style={{ color:"#ffb4b4" }}>{err}</span>}
            </div>

            {!course ? (
                <div style={{ color:"#9aa7b1" }}>
                    Type a base course like <code>CPEN 211</code>, pick campus, then <b>Load</b>.
                </div>
            ) : (
                <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:12 }}>
                    {/* Left: Course details + Tree */}
                    <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                        <h3 style={{ marginTop:0 }}>
                            {course.base_id}{" "}
                            <span style={{ opacity:.7, fontWeight:400 }}>(actual: {course.actual_id})</span>
                        </h3>
                        {course.credits && <div style={{ opacity:.8, marginBottom:6 }}>Credits: {course.credits}</div>}
                        <div style={{ whiteSpace:"pre-wrap", color:"#9aa7b1" }}>
                            {course.prereq_text || "(no extracted text)"}
                        </div>
                        <hr style={{ borderColor:"#1e242e", margin:"12px 0" }} />
                        <h4 style={{ margin:0 }}>Requirements</h4>
                        <TreeView tree={tree} onToggle={toggleSelected} selected={selected} />
                        <div style={{ marginTop:12, display:"grid", gap:8 }}>
                            <div>Mark completed (for this course)</div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                                {Array.from(selected).map(b => (
                                    <span
                                        key={b}
                                        onClick={()=>toggleSelected(b)}
                                        style={{ padding:"4px 8px", borderRadius:8, border:"1px solid #2a3240", background:"#20314a", cursor:"pointer" }}
                                    >
                    {b} ×
                  </span>
                                ))}
                                {completedFree.map(b => (
                                    <span
                                        key={b}
                                        onClick={()=>setCompletedFree(prev => prev.filter(x => x!==b))}
                                        style={{ padding:"4px 8px", borderRadius:8, border:"1px solid #2a3240", background:"#20314a", cursor:"pointer" }}
                                    >
                    {b} ×
                  </span>
                                ))}
                            </div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                                <div>Add completed via picker</div>
                                <input
                                    placeholder="Type base code e.g. PHYS 158"
                                    value={pickerText}
                                    onChange={e=>setPickerText(e.target.value)}
                                    style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                                />
                                <button
                                    onClick={addPicker}
                                    style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Graph + Planner + Viz panels */}
                    <div style={{ display:"grid", gap:12 }}>
                        {/* Graph */}
                        <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                            <h4 style={{ marginTop:0 }}>Graph</h4>
                            {graph && (
                                <>
                                    <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:14, height:2, background:"#5aa9e6", display:"inline-block" }} /> prereq
                    </span>
                                        <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:14, height:2, background:"#a78bfa", display:"inline-block" }} /> co-req
                    </span>
                                        <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:14, height:2, background:"#4ade80", display:"inline-block" }} /> credit granted
                    </span>
                                        <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:14, height:2, background:"#9aa7b1", display:"inline-block" }} /> exclusion
                    </span>
                                    </div>
                                    <GraphView
                                        nodes={graph.nodes}
                                        links={graph.links}
                                        rootId={graph.actual_id ?? course.actual_id ?? course.id}
                                        grades={grades}
                                        onNodeClick={(id) => {
                                            const m = id.match(RE);
                                            const base = m ? `${m[1]} ${m[3]}` : id;
                                            setQ(base);
                                            (async () => {
                                                try {
                                                    const c = await fetchCourseBase(base, campus);
                                                    setCourse(c);
                                                } catch {}
                                            })();
                                        }}
                                    />
                                </>
                            )}
                        </div>

                        {/* Planner */}
                        <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                            <h4 style={{ marginTop:0 }}>Path Planner</h4>
                            <div style={{ display:"grid", gap:8 }}>
                                <div>Enter completed base codes (comma-separated)</div>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. MATH 101, PHYS 157"
                                    value={completedText}
                                    onChange={e=>setCompletedText(e.target.value)}
                                    style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2" }}
                                />
                                <button
                                    onClick={doPlan}
                                    disabled={planning}
                                    style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #2a3240", background:"#141820", color:"#e8edf2", width:"fit-content" }}
                                >
                                    {planning ? "Planning…" : `Plan path to ${course.base_id}`}
                                </button>
                                {planErr && <div style={{ color:"#ffb4b4" }}>{planErr}</div>}
                                {!plans ? null : (
                                    <>
                                        {plans.plan && (plans.plan.term1.length > 0 || plans.plan.term2.length > 0) ? (
                                            <>
                                                <div>2-term plan</div>
                                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                                    <div>
                                                        <div style={{ opacity:.8, marginBottom:6 }}>Term 1</div>
                                                        <div>{plans.plan.term1.length ? plans.plan.term1.join(", ") : "(none)"}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ opacity:.8, marginBottom:6 }}>Term 2</div>
                                                        <div>{plans.plan.term2.length ? plans.plan.term2.join(", ") : "(none)"}</div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color:"#ffb4b4" }}>no 2-term plan</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* VIZ: Course-level RMP */}
                        {courseStats && (
                            <CourseStatsTable rows={courseStats} />
                        )}

                        {/* VIZ: Sections & Instructors */}
                        {sections && (
                            <SectionsTable rows={sections} courseCode={course.base_id} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
