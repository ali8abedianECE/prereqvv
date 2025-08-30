// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import TreeView from "./components/TreeView";
import GraphView from "./components/GraphView";
import { getJSON2, postJSON2 } from './api/http';

/* ────────────────────────── Types & utilities ────────────────────────── */

type Campus = "AUTO" | "V" | "O";

type Link = { source: string; target: string; kind: string; group_id?: string | null };
type GraphPayload = {
    nodes: string[];
    links: Link[];
    base_id: string;
    actual_id: string;
    averages?: Record<string, number>;
    averagesByBase?: Record<string, number>;
};

type VizSection = {
    campus: string | null;
    subject: string;
    course: string;
    section: string;
    year: number;
    session: string;
    title: string;
    instructor: string;
    enrolled: number | null;
    avg: number | null;
    rmp_tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

type VizCourseStat = {
    course_code: string;
    tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

type VizProfessor = {
    legacy_id: string;
    first_name: string;
    last_name: string;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
    department?: string | null;
    faculty?: string | null;
};

const API = (import.meta as any).env?.VITE_API_BASE || "";
const RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;

function toBase(id: string) {
    const m = id.toUpperCase().match(RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
}
function parseCompletedInput(s: string) {
    return s
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map(toBase);
}

async function getJSON<T>(url: string): Promise<T> {
    const r = await fetch(API + url, { credentials: "omit" });
    // dev servers sometimes answer with index.html on unknown routes -> text/html
    const ct = r.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
        const snippet = (await r.text()).slice(0, 120);
        throw new Error(`Expected JSON, got "${ct}". First bytes:\n${snippet}`);
    }
    return r.json();
}
async function postJSON<T>(url: string, body: any): Promise<T> {
    const r = await fetch(API + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
        const snippet = (await r.text()).slice(0, 120);
        throw new Error(`Expected JSON, got "${ct}". First bytes:\n${snippet}`);
    }
    return r.json();
}

/* ────────────────────────── API helpers ────────────────────────── */
async function searchBases(term: string) {
    return getJSON2<string[]>(`/api/search_base?q=${encodeURIComponent(term)}`);
}
async function fetchCourseBase(baseId: string, campus: Campus) {
    return getJSON2<any>(`/api/course_base/${encodeURIComponent(baseId)}?campus=${campus}`);
}
async function fetchGraphBase(baseId: string, depth: number, includeCoreq: boolean, campus: Campus) {
    return getJSON2<GraphPayload>(`/api/graph_base/${encodeURIComponent(baseId)}?depth=${depth}&includeCoreq=${includeCoreq}&campus=${campus}`);
}
async function fetchGradeAverage(baseId: string, campus: Campus) {
    return getJSON2<{ base: string; average: number | null }>(`/api/grades_base/${encodeURIComponent(baseId)}?campus=${campus}`);
}
async function planTwoTerms(baseId: string, campus: Campus, completed: string[]) {
    return postJSON2<{ ok: true; plan: { term1: string[]; term2: string[] } }>(
        `/api/plan_base/${encodeURIComponent(baseId)}?campus=${campus}`,
        { completed }
    );
}
async function fetchVizSections(subject: string, course: string) {
    return getJSON2<VizSection[]>(`/api/viz/sections?subject=${encodeURIComponent(subject)}&course=${encodeURIComponent(course)}`);
}
async function fetchCourseStats(courseCode: string) {
    const normalized = courseCode.replace(/\s+/g, '').toUpperCase();
    return getJSON2<VizCourseStat[]>(`/api/viz/course_stats?course_code=${encodeURIComponent(normalized)}`);
}
async function searchProfessors(q: string, limit?: number) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (limit) qs.set('limit', String(limit));
    return getJSON2<VizProfessor[]>(`/api/viz/professors${qs.toString() ? `?${qs}` : ''}`);
}
/* ────────────────────────── Small UI atoms ────────────────────────── */

function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid #2a3240",
                background: "#1a2231",
                fontSize: 12,
            }}
        >
      {children}
    </span>
    );
}
function H({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{children}</h3>
            <div style={{ marginLeft: "auto" }}>{right}</div>
        </div>
    );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #2a3240",
                background: "#141820",
                color: "#e8edf2",
                ...(props.style || {}),
            }}
        />
    );
}
function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #2a3240",
                background: "#141820",
                color: "#e8edf2",
                ...(props.style || {}),
            }}
        >
            {children}
        </button>
    );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #2a3240",
                background: "#141820",
                color: "#e8edf2",
                ...(props.style || {}),
            }}
        />
    );
}
function Card({ children }: { children: React.ReactNode }) {
    return <div style={{ background: "#141820", border: "1px solid #1e242e", borderRadius: 12, padding: 12 }}>{children}</div>;
}

/* ────────────────────────── Scatter Plot (Canvas) ────────────────────────── */

type ScatterDatum = {
    id: string; // RMP legacy id
    label: string;
    x: number; // difficulty
    y: number; // rating
    size: number; // #ratings weight
};

function colorByRating(r: number) {
    // red → green based on rating 1..5
    const t = Math.max(1, Math.min(5, r));
    const f = (t - 1) / 4; // 0..1
    const rC = Math.round(230 + (89 - 230) * f);
    const gC = Math.round(78 + (201 - 78) * f);
    const bC = Math.round(57 + (79 - 57) * f);
    return `rgb(${rC},${gC},${bC})`;
}

function ScatterPlot({
                         data,
                         width = 980,
                         height = 560,
                         onPointClick,
                     }: {
    data: ScatterDatum[];
    width?: number;
    height?: number;
    onPointClick?: (d: ScatterDatum) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hover, setHover] = useState<ScatterDatum | null>(null);
    const [view, setView] = useState({ xMin: 0.5, xMax: 5.5, yMin: 0.5, yMax: 5.5 });

    // draw
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d")!;
        const px = 60;
        const w = c.width,
            h = c.height;

        // clear
        ctx.clearRect(0, 0, w, h);

        // axes
        ctx.strokeStyle = "#3a4556";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, px);
        ctx.lineTo(px, h - px);
        ctx.lineTo(w - px, h - px);
        ctx.stroke();

        // labels
        ctx.fillStyle = "#9aa7b1";
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillText("Average Rating", 16, px - 10);
        ctx.fillText("Difficulty", w - px - 36, h - px + 20);

        const xScale = (x: number) => px + ((x - view.xMin) / (view.xMax - view.xMin)) * (w - 2 * px);
        const yScale = (y: number) => h - px - ((y - view.yMin) / (view.yMax - view.yMin)) * (h - 2 * px);

        // ticks
        for (let v = 1; v <= 5; v++) {
            const X = Math.round(xScale(v));
            const Y = Math.round(yScale(v));
            // x
            ctx.beginPath();
            ctx.moveTo(X, h - px);
            ctx.lineTo(X, h - px + 6);
            ctx.strokeStyle = "#3a4556";
            ctx.stroke();
            ctx.fillText(String(v), X - 3, h - px + 18);
            // y
            ctx.beginPath();
            ctx.moveTo(px - 6, Y);
            ctx.lineTo(px, Y);
            ctx.strokeStyle = "#3a4556";
            ctx.stroke();
            ctx.fillText(String(v), px - 24, Y + 4);
        }

        // points
        for (const d of data) {
            if (d.x < view.xMin || d.x > view.xMax || d.y < view.yMin || d.y > view.yMax) continue;
            const X = xScale(d.x);
            const Y = yScale(d.y);
            const r = Math.max(2.5, Math.min(6, Math.sqrt(Math.max(1, d.size))));
            ctx.beginPath();
            ctx.arc(X, Y, r, 0, Math.PI * 2);
            ctx.fillStyle = colorByRating(d.y);
            ctx.fill();
        }
    }, [data, view]);

    // hover / click
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;

        const px = 60;
        const w = c.width,
            h = c.height;
        const xScale = (x: number) => px + ((x - view.xMin) / (view.xMax - view.xMin)) * (w - 2 * px);
        const yScale = (y: number) => h - px - ((y - view.yMin) / (view.yMax - view.yMin)) * (h - 2 * px);

        function hit(mx: number, my: number) {
            let best: { d: ScatterDatum; dist2: number } | null = null;
            for (const d of data) {
                const X = xScale(d.x);
                const Y = yScale(d.y);
                const dx = X - mx,
                    dy = Y - my;
                const dist2 = dx * dx + dy * dy;
                const r = Math.max(6, Math.sqrt(Math.max(1, d.size)));
                if (dist2 <= r * r) {
                    if (!best || dist2 < best.dist2) best = { d, dist2 };
                }
            }
            return best?.d || null;
        }

        function onMove(e: MouseEvent) {
            const rect = c.getBoundingClientRect();
            setHover(hit(e.clientX - rect.left, e.clientY - rect.top));
        }
        function onClick() {
            if (hover && onPointClick) onPointClick(hover);
        }
        c.addEventListener("mousemove", onMove);
        c.addEventListener("click", onClick);
        return () => {
            c.removeEventListener("mousemove", onMove);
            c.removeEventListener("click", onClick);
        };
    }, [data, view, hover, onPointClick]);

    // zoom
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        function onWheel(e: WheelEvent) {
            e.preventDefault();
            const zoom = Math.exp(-e.deltaY * 0.001);
            const cx = (view.xMin + view.xMax) / 2;
            const cy = (view.yMin + view.yMax) / 2;
            const nx = (view.xMax - view.xMin) * zoom;
            const ny = (view.yMax - view.yMin) * zoom;
            const xMin = Math.max(0.2, cx - nx / 2),
                xMax = Math.min(5.8, cx + nx / 2);
            const yMin = Math.max(0.2, cy - ny / 2),
                yMax = Math.min(5.8, cy + ny / 2);
            setView({ xMin, xMax, yMin, yMax });
        }
        c.addEventListener("wheel", onWheel, { passive: false });
        return () => c.removeEventListener("wheel", onWheel as any);
    }, [view]);

    return (
        <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} width={width} height={height} style={{ display: "block", width, height }} />
            {hover && (
                <div
                    style={{
                        position: "absolute",
                        left: 12,
                        bottom: 12,
                        background: "#0b0d10",
                        border: "1px solid #2a3240",
                        borderRadius: 12,
                        padding: 12,
                        color: "#e8edf2",
                        pointerEvents: "none",
                        maxWidth: 360,
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{hover.label}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>Rating</div>
                        <div style={{ textAlign: "right" }}>{hover.y.toFixed(1)} / 5</div>
                        <div>Difficulty</div>
                        <div style={{ textAlign: "right" }}>{hover.x.toFixed(1)} / 5</div>
                        <div># Ratings</div>
                        <div style={{ textAlign: "right" }}>{hover.size}</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>wheel = zoom • click to open RMP profile</div>
                </div>
            )}
        </div>
    );
}

/* ────────────────────────── Tabs infra ────────────────────────── */

type TabKind = "path" | "course" | "scatter";
type Tab = { id: string; kind: TabKind; title: string; payload?: any };

function TabBar({
                    tabs,
                    active,
                    onSelect,
                    onClose,
                    onAddScatter,
                }: {
    tabs: Tab[];
    active: string;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onAddScatter: () => void;
}) {
    return (
        <div style={{ display: "flex", gap: 8, padding: "8px 8px 0 8px", borderBottom: "1px solid #1e242e" }}>
            {tabs.map((t) => (
                <div
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    style={{
                        padding: "8px 12px",
                        border: "1px solid #1e242e",
                        borderBottomColor: t.id === active ? "#0b0d10" : "#1e242e",
                        background: t.id === active ? "#0b0d10" : "#141820",
                        borderRadius: "10px 10px 0 0",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span>{t.title}</span>
                    {t.kind !== "path" && (
                        <span
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(t.id);
                            }}
                            style={{ color: "#ff8a8a", cursor: "pointer" }}
                        >
              ×
            </span>
                    )}
                </div>
            ))}
            <div style={{ marginLeft: "auto" }} />
            <Button onClick={onAddScatter} style={{ marginRight: 4 }}>
                + Scatter Plot
            </Button>
        </div>
    );
}

/* ────────────────────────── Left Sidebar ────────────────────────── */

function Sidebar({
                     onOpenScatter,
                     onOpenCourse,
                     onOpenPathFromCourse,
                 }: {
    onOpenScatter: () => void;
    onOpenCourse: (courseCode: string) => void;
    onOpenPathFromCourse: (courseCode: string) => void;
}) {
    const [profQ, setProfQ] = useState("");
    const [courseQ, setCourseQ] = useState("");

    return (
        <div style={{ width: 260, background: "#0e1520", borderRight: "1px solid #1e242e", padding: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
                <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/UBC_coa.svg/120px-UBC_coa.svg.png"
                    width={64}
                    height={64}
                    style={{ opacity: 0.85, margin: "8px auto 4px" }}
                />
                <div style={{ textAlign: "center", color: "#9aa7b1", fontSize: 12 }}>UBC Course & Professor Explorer</div>
            </div>

            <Card>
                <H>Search Professor</H>
                <Input placeholder="e.g., tor aamodt" value={profQ} onChange={(e) => setProfQ(e.target.value)} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button onClick={onOpenScatter} style={{ width: "100%" }}>
                        Scatter Plot
                    </Button>
                </div>
            </Card>

            <Card>
                <H>Search Course</H>
                <Input placeholder="e.g., CPEN 211" value={courseQ} onChange={(e) => setCourseQ(e.target.value)} />
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <Button onClick={() => courseQ && onOpenCourse(courseQ)}>Open Course Data</Button>
                    <Button onClick={() => courseQ && onOpenPathFromCourse(courseQ)} style={{ background: "#182235" }}>
                        Open Path Finder
                    </Button>
                </div>
            </Card>

            <Card>
                <H>Graph Controls</H>
                <div style={{ color: "#9aa7b1", fontSize: 12 }}>Use controls inside each tab. Zoom & pan on plots with the mouse wheel.</div>
            </Card>

            <div style={{ marginTop: "auto", color: "#617086", fontSize: 11 }}>Created by you 🧠 — inspired by the Java Swing tool.</div>
        </div>
    );
}

/* ────────────────────────── Path Finder Tab ────────────────────────── */

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
    const listId = useRef("bases-" + Math.random().toString(36).slice(2)).current;
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>Course:</label>
            <Input
                list={listId}
                placeholder="e.g., CPEN 211"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmit();
                }}
            />
            <datalist id={listId}>{options.map((b) => <option key={b} value={b} />)}</datalist>
            <Button onClick={onSubmit}>Load</Button>
        </div>
    );
}

function PathFinder({ defaultBase }: { defaultBase?: string }) {
    const [bases, setBases] = useState<string[]>([]);
    const [q, setQ] = useState(defaultBase || "");
    const [campus, setCampus] = useState<Campus>("AUTO");
    const [depth, setDepth] = useState(2);
    const [includeCoreq, setIncludeCoreq] = useState(true);
    const [course, setCourse] = useState<any>(null);
    const [graph, setGraph] = useState<GraphPayload | null>(null);
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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const term = q.trim();
            const list = await searchBases(term.length >= 2 ? term : "");
            if (!cancelled) setBases(list);
        })().catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [q]);

    useEffect(() => {
        if (!course?.base_id) return;
        (async () => {
            try {
                const g = await fetchGraphBase(course.base_id, depth, includeCoreq, campus);
                setGraph(g);

                const basesSet = new Set<string>(g.nodes.map((id: string) => toBase(id)));
                basesSet.add(course.base_id);
                const entries = Array.from(basesSet);
                const results = await Promise.all(entries.map((b) => fetchGradeAverage(b, campus)));
                const map: Record<string, number | null> = {};
                for (const r of results) map[r.base] = r.average ?? null;
                setGrades(map);
            } catch {
                setGraph(null);
            }
        })();
    }, [course?.base_id, depth, includeCoreq, campus]);

    async function loadBase(base: string) {
        setErr(null);
        setLoading(true);
        try {
            const c = await fetchCourseBase(toBase(base), campus);
            setCourse(c);
            setSelected(new Set());
            setCompletedFree([]);
            setCompletedText("");
            setPlans(null);
            setPlanErr(null);
        } catch (e: any) {
            setErr(e?.message || String(e));
            setCourse(null);
            setGraph(null);
        } finally {
            setLoading(false);
        }
    }

    const tree = useMemo(() => {
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
            setPlans(r);
        } catch (e: any) {
            setPlanErr(e.message || String(e));
        } finally {
            setPlanning(false);
        }
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12 }}>
            <Card>
                <H
                    right={
                        <>
                            {loading && <span style={{ color: "#9aa7b1" }}>Loading…</span>}
                            {err && <span style={{ color: "#ffb4b4" }}>{err}</span>}
                        </>
                    }
                >
                    Path Finder
                </H>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    <DatalistSearch options={bases} value={q} onChange={setQ} onSubmit={() => q && loadBase(q)} />
                    <label>Campus</label>
                    <Select value={campus} onChange={(e) => setCampus(e.target.value as Campus)}>
                        <option value="AUTO">Auto</option>
                        <option value="V">Vancouver</option>
                        <option value="O">Okanagan</option>
                    </Select>
                    <label>Depth</label>
                    <Input
                        type="number"
                        min={1}
                        max={6}
                        value={depth}
                        onChange={(e) => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                        style={{ width: 64 }}
                    />
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={includeCoreq} onChange={(e) => setIncludeCoreq(e.target.checked)} /> include
                        co-reqs
                    </label>
                </div>

                {!course ? (
                    <div style={{ color: "#9aa7b1" }}>
                        Type a base course like <code>CPEN 211</code>, pick campus, then <b>Load</b>.
                    </div>
                ) : (
                    <>
                        <div>
                            <h3 style={{ marginTop: 0 }}>
                                {course.base_id} <span style={{ opacity: 0.7, fontWeight: 400 }}>(actual: {course.actual_id})</span>
                            </h3>
                            {course.credits && <div style={{ opacity: 0.8, marginBottom: 6 }}>Credits: {course.credits}</div>}
                            <div style={{ whiteSpace: "pre-wrap", color: "#9aa7b1" }}>{course.prereq_text || "(no extracted text)"}</div>
                            <hr style={{ borderColor: "#1e242e", margin: "12px 0" }} />
                            <h4 style={{ margin: 0 }}>Requirements</h4>
                            <TreeView tree={tree} onToggle={toggleSelected} selected={selected} />
                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                <div>Mark completed (for this course)</div>
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
                                        >
                      {b} ×
                    </span>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <div>Add completed via picker</div>
                                    <Input placeholder="Type base code e.g. PHYS 158" value={pickerText} onChange={(e) => setPickerText(e.target.value)} />
                                    <Button onClick={addPicker}>Add</Button>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Button onClick={doPlan} disabled={planning}>
                                        {planning ? "Planning…" : `Plan path to ${course.base_id}`}
                                    </Button>
                                    {planErr && <div style={{ color: "#ffb4b4" }}>{planErr}</div>}
                                </div>
                                {plans && (
                                    <>
                                        <div>2-term plan</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div>
                                                <div style={{ opacity: 0.8, marginBottom: 6 }}>Term 1</div>
                                                <div>{plans.plan.term1.length ? plans.plan.term1.join(", ") : "(none)"}</div>
                                            </div>
                                            <div>
                                                <div style={{ opacity: 0.8, marginBottom: 6 }}>Term 2</div>
                                                <div>{plans.plan.term2.length ? plans.plan.term2.join(", ") : "(none)"}</div>
                                            </div>
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 2, background: "#5aa9e6", display: "inline-block" }} /> prereq
                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 2, background: "#a78bfa", display: "inline-block" }} /> co-req
                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 2, background: "#4ade80", display: "inline-block" }} /> credit granted
                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 2, background: "#9aa7b1", display: "inline-block" }} /> exclusion
                </span>
                            </div>
                            <GraphView
                                nodes={graph.nodes}
                                links={graph.links}
                                rootId={graph.actual_id}
                                grades={grades}
                                onNodeClick={(id) => {
                                    const m = id.match(RE);
                                    const base = m ? `${m[1]} ${m[3]}` : id;
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
                </Card>
            </div>
        </div>
    );
}

/* ────────────────────────── Course Explorer Tab ────────────────────────── */

function tinyFmt(n: number | null | undefined, digits = 1) {
    if (n == null) return "—";
    return Number(n).toFixed(digits);
}
function Histogram({ values }: { values: number[] }) {
    const bins = new Array(20).fill(0); // 0..100 by 5%
    for (const v of values) {
        if (v == null || isNaN(v)) continue;
        const idx = Math.min(19, Math.max(0, Math.floor(v / 5)));
        bins[idx]++;
    }
    const max = Math.max(1, ...bins);
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20,1fr)", gap: 2, alignItems: "end", height: 120 }}>
            {bins.map((b, i) => (
                <div key={i} title={`${i * 5}-${i * 5 + 4}%: ${b}`} style={{ height: `${(b / max) * 100}%`, background: "#4b7fd6", borderRadius: 2 }} />
            ))}
        </div>
    );
}

function CourseExplorer({ courseCode, onOpenScatter }: { courseCode: string; onOpenScatter: () => void }) {
    const [rows, setRows] = useState<VizSection[]>([]);
    const [stats, setStats] = useState<VizCourseStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const normalized = toBase(courseCode);
    const [subject, course] = normalized.split(" ");

    useEffect(() => {
        let stop = false;
        (async () => {
            setLoading(true);
            setErr(null);
            try {
                const [a, b] = await Promise.all([fetchVizSections(subject, course), fetchCourseStats(normalized)]);
                if (!stop) {
                    setRows(a);
                    setStats(b);
                }
            } catch (e: any) {
                setErr(e?.message || String(e));
            } finally {
                if (!stop) setLoading(false);
            }
        })();
        return () => {
            stop = true;
        };
    }, [subject, course, normalized]);

    const ratings = rows
        .filter((r) => r.section !== "OVERALL")
        .map((r) => (r.avg == null ? NaN : Number(r.avg)))
        .filter((v) => !isNaN(v));

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
            <Card>
                <H right={loading ? <span style={{ color: "#9aa7b1" }}>Loading…</span> : err && <span style={{ color: "#ff8a8a" }}>{err}</span>}>
                    {normalized} — Sections & Instructors (+ RMP)
                </H>
                <div style={{ overflow: "auto", maxHeight: "70vh" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                        <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                            <th style={{ padding: 6 }}>Year</th>
                            <th style={{ padding: 6 }}>Sess</th>
                            <th style={{ padding: 6 }}>Section</th>
                            <th style={{ padding: 6 }}>Instructor</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Enrolled</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Grade Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>RMP Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                            <th style={{ padding: 6, textAlign: "right" }}>WTA %</th>
                            <th style={{ padding: 6, textAlign: "right" }}># Ratings</th>
                            <th style={{ padding: 6 }}>Link</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                <td style={{ padding: 6 }}>{r.year}</td>
                                <td style={{ padding: 6 }}>{r.session}</td>
                                <td style={{ padding: 6 }}>{r.section}</td>
                                <td style={{ padding: 6 }}>{r.instructor || "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg, 2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg_rating, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg_difficulty, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.would_take_again_pct, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.num_ratings ?? "—"}</td>
                                <td style={{ padding: 6 }}>
                                    {r.rmp_tid ? (
                                        <a href={`https://www.ratemyprofessors.com/professor/${r.rmp_tid}`} target="_blank" rel="noreferrer" style={{ color: "#7ab7ff" }}>
                                            RMP
                                        </a>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div style={{ display: "grid", gap: 12 }}>
                <Card>
                    <H right={<Button onClick={onOpenScatter}>Open Scatter Plot</Button>}>Course-level RMP (per matched prof)</H>
                    <div style={{ overflow: "auto", maxHeight: 280 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                            <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                                <th style={{ padding: 6 }}>RMP Prof (tid)</th>
                                <th style={{ padding: 6, textAlign: "right" }}>#Ratings</th>
                                <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                                <th style={{ padding: 6, textAlign: "right" }}>WTA %</th>
                                <th style={{ padding: 6 }}>Link</th>
                            </tr>
                            </thead>
                            <tbody>
                            {stats.map((s, i) => (
                                <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                    <td style={{ padding: 6 }}>{s.tid ?? "—"}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{s.num_ratings ?? "—"}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(s.avg_difficulty, 2)}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(s.would_take_again_pct, 1)}</td>
                                    <td style={{ padding: 6 }}>
                                        {s.tid ? (
                                            <a href={`https://www.ratemyprofessors.com/professor/${s.tid}`} target="_blank" rel="noreferrer" style={{ color: "#7ab7ff" }}>
                                                RMP
                                            </a>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card>
                    <H>Overall Grade Distribution</H>
                    <Histogram values={ratings} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa7b1", fontSize: 12, marginTop: 6 }}>
                        <span>0</span>
                        <span>25</span>
                        <span>50</span>
                        <span>75</span>
                        <span>100</span>
                    </div>
                </Card>
            </div>
        </div>
    );
}

/* ────────────────────────── Scatter Plot Tab ────────────────────────── */

function ScatterPlotTab() {
    const [data, setData] = useState<VizProfessor[]>([]);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function doSearch(limit?: number) {
        setLoading(true);
        setErr(null);
        try {
            const list = await searchProfessors(q.trim(), limit ?? 500);
            setData(list);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        doSearch(500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const points: ScatterDatum[] = useMemo(
        () =>
            data
                .filter((p) => p.avg_difficulty != null && p.avg_rating != null)
                .map((p) => ({
                    id: p.legacy_id,
                    label: `${p.first_name} ${p.last_name}`,
                    x: Number(p.avg_difficulty),
                    y: Number(p.avg_rating),
                    size: Math.max(1, Number(p.num_ratings ?? 1)),
                })),
        [data]
    );

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Card>
                <H
                    right={
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Input
                                placeholder="Search professor name…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") doSearch();
                                }}
                            />
                            <Button onClick={() => doSearch()}>Search</Button>
                            <Badge>{points.length} profs</Badge>
                            {loading && <span style={{ color: "#9aa7b1" }}>Loading…</span>}
                            {err && <span style={{ color: "#ff8a8a" }}>{err}</span>}
                        </div>
                    }
                >
                    Professor Scatter Plot
                </H>

                <ScatterPlot
                    data={points}
                    onPointClick={(d) => {
                        // open RMP profile in a new tab
                        window.open(`https://www.ratemyprofessors.com/professor/${d.id}`, "_blank", "noopener,noreferrer");
                    }}
                />
                <div style={{ color: "#9aa7b1", fontSize: 12, marginTop: 8 }}>
                    Y = Average Rating • X = Difficulty • circle size ≈ number of ratings • wheel = zoom
                </div>
            </Card>
        </div>
    );
}

/* ────────────────────────── Main App (tabs + layout) ────────────────────────── */

export default function App() {
    const [tabs, setTabs] = useState<Tab[]>([{ id: "path", kind: "path", title: "Path Finder" }]);
    const [active, setActive] = useState("path");

    function openOrFocus(tab: Tab) {
        setTabs((prev) => (prev.find((t) => t.id === tab.id) ? prev : [...prev, tab]));
        setActive(tab.id);
    }
    function openCourseTab(courseCode: string) {
        const id = `course:${toBase(courseCode)}`;
        openOrFocus({ id, kind: "course", title: `Course: ${toBase(courseCode)}`, payload: { courseCode: toBase(courseCode) } });
    }
    function openScatterTab() {
        openOrFocus({ id: `scatter:${Date.now().toString(36)}`, kind: "scatter", title: "Professor Scatter" });
    }
    function openPathWithCourse(courseCode: string) {
        setTabs((prev) => prev.map((t) => (t.id === "path" ? { ...t, payload: { defaultBase: toBase(courseCode) } } : t)));
        setActive("path");
    }
    function closeTab(id: string) {
        setTabs((prev) => prev.filter((t) => t.id !== id));
        if (active === id) setActive("path");
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh", background: "#0b0d10", color: "#e8edf2" }}>
            <Sidebar onOpenScatter={openScatterTab} onOpenCourse={openCourseTab} onOpenPathFromCourse={openPathWithCourse} />
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
                <TabBar tabs={tabs} active={active} onSelect={setActive} onClose={closeTab} onAddScatter={openScatterTab} />
                <div style={{ padding: 12, overflow: "auto" }}>
                    {tabs.map((t) => (
                        <div key={t.id} style={{ display: t.id === active ? "block" : "none" }}>
                            {t.kind === "path" && <PathFinder key={(t.payload?.defaultBase || "") + "-path"} defaultBase={t.payload?.defaultBase} />}
                            {t.kind === "course" && <CourseExplorer courseCode={t.payload.courseCode} onOpenScatter={openScatterTab} />}
                            {t.kind === "scatter" && <ScatterPlotTab />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
