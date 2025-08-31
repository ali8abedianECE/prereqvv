import React from "react";
import { Card, H, Input, Button, Select } from "../components/ui";
import { BASE_RE, Campus, GraphPayload, parseCompletedInput, toBase } from "../types";
import { fetchCourseBase, fetchGraphBase, fetchGradeAverage, planTwoTerms, searchBases } from "../api/viz";
import TreeView from "../components/TreeView";
import GraphView from "../components/GraphView";

function DatalistSearch({ options, value, onChange, onSubmit }: { options: string[]; value: string; onChange: (v: string) => void; onSubmit: () => void; }) {
    const listId = React.useRef("bases-" + Math.random().toString(36).slice(2)).current;
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>Course:</label>
            <Input list={listId} placeholder="e.g., CPEN 211" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSubmit(); }} />
            <datalist id={listId}>{options.map(b => <option key={b} value={b} />)}</datalist>
            <Button onClick={onSubmit}>Load</Button>
        </div>
    );
}

export default function PathFinderTab({ defaultBase }: { defaultBase?: string }) {
    const [bases, setBases] = React.useState<string[]>([]);
    const [q, setQ] = React.useState(defaultBase || "");
    const [campus, setCampus] = React.useState<Campus>("AUTO");
    const [depth, setDepth] = React.useState(2);
    const [includeCoreq, setIncludeCoreq] = React.useState(true);
    const [course, setCourse] = React.useState<any>(null);
    const [graph, setGraph] = React.useState<GraphPayload | null>(null);
    const [grades, setGrades] = React.useState<Record<string, number | null>>({});
    const [err, setErr] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [completedFree, setCompletedFree] = React.useState<string[]>([]);
    const [pickerText, setPickerText] = React.useState("");
    const [completedText, setCompletedText] = React.useState("");
    const [plans, setPlans] = React.useState<any>(null);
    const [planErr, setPlanErr] = React.useState<string | null>(null);
    const [planning, setPlanning] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const term = q.trim();
            const list = await searchBases(term.length >= 2 ? term : "");
            if (!cancelled) setBases(list);
        })().catch(()=>{});
        return () => { cancelled = true; };
    }, [q]);

    React.useEffect(() => {
        if (!course?.base_id) return;
        (async () => {
            try {
                const g = await fetchGraphBase(course.base_id, depth, includeCoreq, campus);
                setGraph(g);
                const basesSet = new Set<string>(g.nodes.map((id: string) => toBase(id)));
                basesSet.add(course.base_id);
                const entries = Array.from(basesSet);
                const results = await Promise.all(entries.map(b => fetchGradeAverage(b, campus)));
                const map: Record<string, number | null> = {};
                for (const r of results) map[r.base] = r.average ?? null;
                setGrades(map);
            } catch { setGraph(null); }
        })();
    }, [course?.base_id, depth, includeCoreq, campus]);

    async function loadBase(base: string) {
        setErr(null); setLoading(true);
        try {
            const c = await fetchCourseBase(toBase(base), campus);
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

    const tree = React.useMemo(() => {
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
        setPlanning(true); setPlanErr(null); setPlans(null);
        try {
            const manualCompleted = parseCompletedInput(completedText);
            const combined = Array.from(new Set<string>([...Array.from(selected), ...completedFree, ...manualCompleted]));
            const r = await planTwoTerms(course.base_id, campus, combined);
            setPlans(r);
        } catch (e:any) { setPlanErr(e.message || String(e)); }
        finally { setPlanning(false); }
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12 }}>
            <Card>
                <H right={<>{loading && <span style={{ color: "#9aa7b1" }}>Loading…</span>} {err && <span style={{ color: "#ffb4b4" }}>{err}</span>}</>}>
                    Path Finder
                </H>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    <DatalistSearch options={bases} value={q} onChange={setQ} onSubmit={() => q && loadBase(q)} />
                    <label>Campus</label>
                    <Select value={campus} onChange={(e) => setCampus(e.target.value as Campus)}>
                        <option value="AUTO">Auto</option><option value="V">Vancouver</option><option value="O">Okanagan</option>
                    </Select>
                    <label>Depth</label>
                    <Input type="number" min={1} max={6} value={depth} onChange={e => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} style={{ width: 64 }} />
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={includeCoreq} onChange={e => setIncludeCoreq(e.target.checked)} /> include co-reqs
                    </label>
                </div>

                {!course ? (
                    <div style={{ color: "#9aa7b1" }}>Type a base course like <code>CPEN 211</code>, pick campus, then <b>Load</b>.</div>
                ) : (
                    <>
                        <div>
                            <h3 style={{ marginTop: 0 }}>{course.base_id} <span style={{ opacity: .7, fontWeight: 400 }}>(actual: {course.actual_id})</span></h3>
                            {course.credits && <div style={{ opacity: .8, marginBottom: 6 }}>Credits: {course.credits}</div>}
                            <div style={{ whiteSpace: "pre-wrap", color: "#9aa7b1" }}>{course.prereq_text || "(no extracted text)"}</div>
                            <hr style={{ borderColor: "#1e242e", margin: "12px 0" }} />
                            <h4 style={{ margin: 0 }}>Requirements</h4>
                            <TreeView tree={tree} onToggle={toggleSelected} selected={selected} />
                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                <div>Mark completed (for this course)</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {Array.from(selected).map(b => (
                                        <span key={b} onClick={() => toggleSelected(b)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #2a3240", background: "#20314a", cursor: "pointer" }}>{b} ×</span>
                                    ))}
                                    {completedFree.map(b => (
                                        <span key={b} onClick={() => setCompletedFree(prev => prev.filter(x => x !== b))} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #2a3240", background: "#20314a", cursor: "pointer" }}>{b} ×</span>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <div>Add completed via picker</div>
                                    <Input placeholder="Type base code e.g. PHYS 158" value={pickerText} onChange={e => setPickerText(e.target.value)} />
                                    <Button onClick={addPicker}>Add</Button>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Input placeholder="Paste completed list (comma/newline separated)" value={completedText} onChange={e => setCompletedText(e.target.value)} style={{ flex: 1 }} />
                                    <Button onClick={doPlan} disabled={planning}>{planning ? "Planning…" : `Plan path to ${course.base_id}`}</Button>
                                    {planErr && <div style={{ color: "#ffb4b4" }}>{planErr}</div>}
                                </div>
                                {plans && (
                                    <>
                                        <div>2-term plan</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div><div style={{ opacity: .8, marginBottom: 6 }}>Term 1</div><div>{plans.plan.term1.length ? plans.plan.term1.join(", ") : "(none)"}</div></div>
                                            <div><div style={{ opacity: .8, marginBottom: 6 }}>Term 2</div><div>{plans.plan.term2.length ? plans.plan.term2.join(", ") : "(none)"}</div></div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </Card>

            <div style={{ display: "grid", gap: 12 }}>
                <Card>
                    <H>Graph</H>
                    {graph && (
                        <>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: "#5aa9e6", display: "inline-block" }} /> prereq</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: "#a78bfa", display: "inline-block" }} /> co-req</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: "#4ade80", display: "inline-block" }} /> credit granted</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: "#9aa7b1", display: "inline-block" }} /> exclusion</span>
                            </div>
                            <GraphView
                                nodes={graph.nodes}
                                links={graph.links}
                                rootId={graph.actual_id}
                                grades={{}}
                                onNodeClick={(id) => {
                                    const m = id.match(BASE_RE);
                                    const base = m ? `${m[1]} ${m[3]}` : id;
                                    setQ(base);
                                    (async () => { try { const c = await fetchCourseBase(base, campus); setCourse(c); } catch {} })();
                                }}
                            />
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
