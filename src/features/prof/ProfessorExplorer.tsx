// src/features/prof/ProfessorExplorer.tsx
import React from "react";
import {
    searchProfessorsPX,
    fetchProfessorOverviewPX,
    type VizProfessor,
    type VizSection,
    type PXProfPerCourse,
    type PXBin,
    type PXHistBin,
} from "../../api/viz";

/* -------------------- helpers -------------------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (n: number | null | undefined, d = 2) =>
    n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);
const hueFromPct = (p: number) => 10 + (115 - 10) * clamp((p - 50) / 50, 0, 1);
const colFromPct = (p: number) => `hsl(${hueFromPct(p)}deg 70% 55%)`;
const asPct = (x: number | null | undefined) =>
    x == null || !Number.isFinite(Number(x)) ? "—" : `${Number(x).toFixed(1)}%`;

function useMeasure<T extends HTMLElement>() {
    const ref = React.useRef<T | null>(null);
    const [size, setSize] = React.useState({ w: 0, h: 0 });
    React.useLayoutEffect(() => {
        if (!ref.current) return;
        const el = ref.current;
        const update = () => {
            const r = el.getBoundingClientRect();
            setSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, size] as const;
}

/* -------------------- Distribution Panel -------------------- */
// Accepts either CSV bins or fallback histogram.
function sortBinLabels(labels: string[]) {
    function lowerOf(label: string): number {
        const s = label.trim();
        if (s.startsWith("<")) return Number(s.slice(1)) - 1000; // force to far-left
        if (s.endsWith("+")) return Number(s.slice(0, -1));
        if (s.includes("-")) return Number(s.split("-")[0]);
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }
    return [...labels].sort((a, b) => lowerOf(a) - lowerOf(b));
}

function binLabelMid(label: string): number {
    const s = label.trim();
    if (s.startsWith("<")) return Math.max(0, Number(s.slice(1)) - 5);
    if (s.endsWith("+")) return Math.min(100, Number(s.slice(0, -1)) + 5);
    if (s.includes("-")) {
        const [a, b] = s.split("-").map((x) => Number(x));
        if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 50;
}

function DistributionPanel({
                               bins,
                               hist,
                           }: {
    bins: PXBin[]; // when present, prefer bins
    hist: PXHistBin[]; // fallback
}) {
    const usingBins = bins && bins.length > 0;
    const [wrapRef, size] = useMeasure<HTMLDivElement>();
    const OUT_H = 300;
    const OUT_W = size.w || 0;
    const PAD_LR = 24,
        PAD_T = 34,
        PAD_B = 34;
    const W = Math.max(0, OUT_W - PAD_LR * 2);
    const H = OUT_H - PAD_T - PAD_B;

    let bars: Array<{ x: number; y: number; w: number; h: number; label: string; color: string; count: number }> = [];
    let xLabels: string[] = [];

    if (usingBins) {
        const lbls = sortBinLabels(bins.map((b) => b.bin_label));
        const map = new Map(lbls.map((l) => [l, 0]));
        for (const b of bins) map.set(b.bin_label, (map.get(b.bin_label) || 0) + Number(b.count || 0));
        const counts = Array.from(map.values());
        const maxC = Math.max(1, ...counts);
        const cellW = W / Math.max(1, lbls.length);
        lbls.forEach((l, i) => {
            const c = map.get(l) || 0;
            const h = (c / maxC) * H;
            const w = Math.max(6, cellW - 6);
            const x = PAD_LR + i * cellW + (cellW - w) / 2;
            const y = PAD_T + H - h;
            bars.push({ x, y, w, h, label: l, color: colFromPct(binLabelMid(l)), count: c });
        });
        xLabels = lbls;
    } else {
        // fallback hist
        const maxC = Math.max(1, ...hist.map((b) => b.c));
        const cellW = W / Math.max(1, hist.length);
        hist.forEach((b, i) => {
            const h = (b.c / maxC) * H;
            const w = Math.max(6, cellW - 6);
            const x = PAD_LR + i * cellW + (cellW - w) / 2;
            const y = PAD_T + H - h;
            const mid = (b.x0 + b.x1) / 2;
            const lbl = `${Math.round(b.x0)}–${Math.round(b.x1)}`;
            bars.push({ x, y, w, h, label: lbl, color: colFromPct(mid), count: b.c });
        });
        xLabels = hist.map((b) => `${Math.round(b.x0)}`);
    }

    const total = bars.reduce((a, b) => a + b.count, 0);
    const estAvg =
        usingBins && total > 0
            ? bars.reduce((a, b) => a + b.count * binLabelMid(b.label), 0) / total
            : null;

    return (
        <div ref={wrapRef} style={{ width: "100%", height: OUT_H, overflow: "visible" }}>
            {OUT_W > 0 && (
                <svg width={OUT_W} height={OUT_H} style={{ display: "block" }}>
                    {/* frame (closed border) */}
                    <rect
                        x={PAD_LR}
                        y={PAD_T}
                        width={W}
                        height={H}
                        rx={10}
                        ry={10}
                        fill="none"
                        stroke="#263041"
                    />

                    {/* header note */}
                    <text x={PAD_LR + 4} y={20} fill="#94a3b8" fontSize={12}>
                        {usingBins ? "Detailed bins (CSV)" : "Section average histogram"}
                    </text>
                    {/* summary on right */}
                    <text x={PAD_LR + W - 6} y={20} fill="#7bd17b" fontSize={12} textAnchor="end">
                        {total > 0 ? `N = ${total}${estAvg != null ? ` • mean≈${fmt(estAvg, 1)}%` : ""}` : ""}
                    </text>

                    {/* bars */}
                    {bars.map((b, i) => (
                        <g key={i}>
                            <rect x={b.x} y={b.y} width={b.w} height={Math.max(1, b.h)} rx={4} fill={b.color} />
                            {/* show sparse x labels */}
                            {bars.length <= 24 || i % Math.ceil(bars.length / 24) === 0 ? (
                                <text x={b.x + b.w / 2} y={PAD_T + H + 12} fill="#94a3b8" fontSize={10} textAnchor="middle">
                                    {b.label}
                                </text>
                            ) : null}
                        </g>
                    ))}

                    {/* axis labels */}
                    <text x={PAD_LR + W / 2} y={PAD_T + H + 28} fill="#94a3b8" fontSize={11} textAnchor="middle">
                        Grade %
                    </text>
                    <text
                        x={12}
                        y={PAD_T + H / 2}
                        fill="#94a3b8"
                        fontSize={11}
                        textAnchor="middle"
                        transform={`rotate(-90 12 ${PAD_T + H / 2})`}
                    >
                        Count
                    </text>
                </svg>
            )}
        </div>
    );
}

/* -------------------- Mini scatter (per-course) -------------------- */
type PCKey = "avg_of_avg" | "n_sections" | "total_enrolled" | "first_year" | "last_year";
const PC_LABEL: Record<PCKey, string> = {
    avg_of_avg: "Avg Grade %",
    n_sections: "# Sections",
    total_enrolled: "Total Enrolled",
    first_year: "First Year",
    last_year: "Last Year",
};

type CoursePoint = {
    id: string;
    code: string;
    avg_of_avg: number;
    n_sections: number;
    total_enrolled: number;
    first_year: number;
    last_year: number;
};

function MiniCourseScatter({
                               rows,
                               xKey,
                               yKey,
                               onX,
                               onY,
                           }: {
    rows: PXProfPerCourse[];
    xKey: PCKey;
    yKey: PCKey;
    onX: (k: PCKey) => void;
    onY: (k: PCKey) => void;
}) {
    const [wrapRef, size] = useMeasure<HTMLDivElement>();
    const OUT_W = size.w || 0;
    const OUT_H = 260;
    const PAD = 28;
    const W = Math.max(0, OUT_W - PAD * 2);
    const H = OUT_H - PAD * 2;

    const points: CoursePoint[] = rows.map((r) => ({
        id: r.course_code,
        code: r.course_code,
        avg_of_avg: Number(r.avg_of_avg ?? NaN),
        n_sections: Number(r.n_sections ?? NaN),
        total_enrolled: Number(r.total_enrolled ?? NaN),
        first_year: Number(r.first_year ?? NaN),
        last_year: Number(r.last_year ?? NaN),
    }));

    const xs = points.map((p) => p[xKey]).filter(Number.isFinite);
    const ys = points.map((p) => p[yKey]).filter(Number.isFinite);
    const xMin = Math.min(...xs),
        xMax = Math.max(...xs);
    const yMin = Math.min(...ys),
        yMax = Math.max(...ys);
    const xTo = (v: number) => PAD + ((v - xMin) / Math.max(1e-6, xMax - xMin)) * W;
    const yTo = (v: number) => PAD + H - ((v - yMin) / Math.max(1e-6, yMax - yMin)) * H;

    const holderRef = React.useRef<SVGSVGElement | null>(null);
    const [hover, setHover] = React.useState<{ p: CoursePoint; cx: number; cy: number } | null>(null);

    function nearest(e: React.MouseEvent) {
        if (!holderRef.current) return null;
        const r = holderRef.current.getBoundingClientRect();
        const px = e.clientX - r.left,
            py = e.clientY - r.top;
        let best: any = null,
            dBest = Infinity;
        for (const p of points) {
            if (!Number.isFinite(p[xKey]) || !Number.isFinite(p[yKey])) continue;
            const cx = xTo(p[xKey]);
            const cy = yTo(p[yKey]);
            const d = Math.hypot(px - cx, py - cy);
            if (d < dBest) {
                dBest = d;
                best = { p, cx, cy };
            }
        }
        return dBest <= 18 ? best : null;
    }

    function placeTooltip(cx: number, cy: number) {
        const TW = 180,
            TH = 84,
            M = 8;
        let left = cx + 12,
            top = cy + 12;
        if (left + TW > OUT_W - M) left = cx - TW - 12;
        if (left < M) left = M;
        if (top + TH > OUT_H - M) top = cy - TH - 12;
        if (top < M) top = M;
        return { left, top, width: TW, height: TH };
    }

    return (
        <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>X:</span>
                <select value={xKey} onChange={(e) => onX(e.target.value as PCKey)}>
                    {Object.keys(PC_LABEL).map((k) => (
                        <option key={k} value={k}>
                            {PC_LABEL[k as PCKey]}
                        </option>
                    ))}
                </select>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>Y:</span>
                <select value={yKey} onChange={(e) => onY(e.target.value as PCKey)}>
                    {Object.keys(PC_LABEL).map((k) => (
                        <option key={k} value={k}>
                            {PC_LABEL[k as PCKey]}
                        </option>
                    ))}
                </select>
            </div>

            <div ref={wrapRef} style={{ width: "100%", height: OUT_H, position: "relative", overflow: "visible" }}>
                {OUT_W > 0 && (
                    <svg
                        ref={holderRef}
                        width={OUT_W}
                        height={OUT_H}
                        style={{ display: "block" }}
                        onMouseMove={(e) => setHover(nearest(e))}
                        onMouseLeave={() => setHover(null)}
                    >
                        {/* frame (closed border) */}
                        <rect
                            x={PAD}
                            y={PAD}
                            width={W}
                            height={H}
                            rx={10}
                            ry={10}
                            fill="none"
                            stroke="#263041"
                        />

                        {/* axis labels */}
                        <text x={PAD + W / 2} y={PAD + H + 24} fill="#94a3b8" fontSize={11} textAnchor="middle">
                            {PC_LABEL[xKey]}
                        </text>
                        <text
                            x={12}
                            y={PAD + H / 2}
                            fill="#94a3b8"
                            fontSize={11}
                            textAnchor="middle"
                            transform={`rotate(-90 12 ${PAD + H / 2})`}
                        >
                            {PC_LABEL[yKey]}
                        </text>

                        {/* points */}
                        {points.map((p) => {
                            if (!Number.isFinite(p[xKey]) || !Number.isFinite(p[yKey])) return null;
                            const cx = xTo(p[xKey]);
                            const cy = yTo(p[yKey]);
                            return (
                                <circle
                                    key={p.id}
                                    cx={cx}
                                    cy={cy}
                                    r={6}
                                    fill={colFromPct(Number(p.avg_of_avg))}
                                    opacity={0.95}
                                />
                            );
                        })}
                    </svg>
                )}

                {hover &&
                    (() => {
                        const pos = placeTooltip(hover.cx, hover.cy);
                        return (
                            <div
                                style={{
                                    position: "absolute",
                                    left: pos.left,
                                    top: pos.top,
                                    width: pos.width,
                                    background: "#0f151e",
                                    border: "1px solid #1f2731",
                                    borderRadius: 10,
                                    padding: 10,
                                    boxShadow: "0 12px 24px rgba(0,0,0,.35)",
                                    pointerEvents: "none",
                                    fontSize: 12,
                                }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{hover.p.code}</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
                                    <span>Avg Grade</span>
                                    <span>{fmt(hover.p.avg_of_avg, 1)}%</span>
                                    <span># Sections</span>
                                    <span>{hover.p.n_sections}</span>
                                    <span>Enrolled</span>
                                    <span>{hover.p.total_enrolled}</span>
                                </div>
                            </div>
                        );
                    })()}
            </div>
        </div>
    );
}

/* -------------------- Main -------------------- */
export default function ProfessorExplorer() {
    // search + suggestions
    const [q, setQ] = React.useState("");
    const [sugs, setSugs] = React.useState<VizProfessor[]>([]);
    const [showSugs, setShowSugs] = React.useState(false);
    const [hi, setHi] = React.useState(0);
    const [loadingSugs, setLoadingSugs] = React.useState(false);

    // selected prof & data
    const [prof, setProf] = React.useState<VizProfessor | null>(null);
    const [sections, setSections] = React.useState<VizSection[]>([]);
    const [perCourse, setPerCourse] = React.useState<PXProfPerCourse[]>([]);
    const [bins, setBins] = React.useState<PXBin[]>([]);
    const [hist, setHist] = React.useState<PXHistBin[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    // scatter axis
    const [xKey, setXKey] = React.useState<PCKey>("avg_of_avg");
    const [yKey, setYKey] = React.useState<PCKey>("total_enrolled");

    // suggestion fetching (debounced)
    const debRef = React.useRef<number | null>(null);
    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setQ(v);
        setShowSugs(true);
        if (debRef.current) window.clearTimeout(debRef.current);
        debRef.current = window.setTimeout(async () => {
            try {
                setLoadingSugs(true);
                const res = await searchProfessorsPX(v, 12);
                setSugs(res || []);
                setHi(0);
            } catch {
                setSugs([]);
            } finally {
                setLoadingSugs(false);
            }
        }, 120);
    }
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!showSugs || !sugs.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, sugs.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (sugs[hi]) choose(sugs[hi]);
        } else if (e.key === "Escape") {
            setShowSugs(false);
        }
    }
    function choose(p: VizProfessor) {
        setShowSugs(false);
        setQ(`${p.first_name} ${p.last_name}`);
        run(p.legacy_id);
    }

    async function run(tid?: string) {
        const id = tid || (sugs[0]?.legacy_id ?? "");
        if (!id) return;
        setLoading(true);
        setErr(null);
        try {
            const data = await fetchProfessorOverviewPX(id, 24);
            setProf(data.prof);
            setSections(data.sections || []);
            setPerCourse(data.perCourse || []);
            setBins(data.bins || []);
            setHist(data.hist || []);
        } catch (e: any) {
            setErr(e?.message || String(e));
            setProf(null);
            setSections([]);
            setPerCourse([]);
            setBins([]);
            setHist([]);
        } finally {
            setLoading(false);
        }
    }

    const OUTER_GRID_H = 760; // constant page height
    return (
        <div
            style={{
                display: "grid",
                gridTemplateRows: "auto 1fr",
                gap: 12,
                height: OUTER_GRID_H,
                minHeight: OUTER_GRID_H,
                overflowX: "auto",
                overflowY: "auto"
            }}
        >
            {/* Header */}
            <div className="card" style={{ minWidth: 0 }}>
                <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <h3 style={{ margin: 0 }}>Professor Explorer</h3>

                    {/* Controls (fixed widths so header never expands) */}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                        <div style={{ position: "relative", width: 320 /* fixed so header never shifts */ }}>
                            <input
                                placeholder="Search professor (e.g., Smith)"
                                value={q}
                                onChange={onChange}
                                onKeyDown={onKeyDown}
                                onFocus={() => setShowSugs(true)}
                                style={{ width: "100%" }}
                            />
                            {showSugs && !!sugs.length && (
                                <div
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        top: "100%",
                                        marginTop: 4,
                                        background: "#0f151e",
                                        border: "1px solid #1f2731",
                                        borderRadius: 8,
                                        boxShadow: "0 12px 24px rgba(0,0,0,.35)",
                                        zIndex: 5,
                                        maxHeight: 240,
                                        overflow: "auto",
                                    }}
                                >
                                    {sugs.map((s, i) => (
                                        <div
                                            key={s.legacy_id}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                choose(s);
                                            }}
                                            onMouseEnter={() => setHi(i)}
                                            style={{
                                                padding: "8px 10px",
                                                background: i === hi ? "#17202b" : "transparent",
                                                cursor: "pointer",
                                                whiteSpace: "nowrap",
                                                overflow: "visible",
                                                textOverflow: "visible",
                                            }}
                                            title={`${s.first_name} ${s.last_name}`}
                                        >
                                            {s.first_name} {s.last_name}
                                            {s.department ? ` — ${s.department}` : ""}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={() => run()} disabled={!sugs.length && !q}>
                            Load
                        </button>

                        {/* reserved status area so header width is stable */}
                        <div style={{ width: 260, textAlign: "right" }}>
                            {loading ? (
                                <span className="muted">Loading…</span>
                            ) : err ? (
                                <span style={{ color: "#ff8a8a" }}>{err}</span>
                            ) : prof ? (
                                <span className="muted">
                                    {prof.first_name} {prof.last_name} • RMP {fmt(prof.avg_rating, 2)} / Diff {fmt(prof.avg_difficulty, 2)} • WTA{" "}
                                    {asPct(prof.would_take_again_pct)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content grid: constant height; every card uses internal scrollers */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr",
                    gap: 12,
                    minHeight: 0,
                    overflow: "visible",
                }}
            >
                {/* Left column */}
                <div className="card" style={{ minWidth: 0, display: "grid", gridTemplateRows: "auto auto 1fr", gap: 12, overflow: "visible" }}>
                    {/* Profile summary row */}
                    <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <h3 style={{ margin: 0 }}>All Sections</h3>
                        {prof?.legacy_id ? (
                            <a href={("#" as any) || ""} style={{ color: "#7ab7ff", pointerEvents: "none" }}>
                                {/* Placeholder; could link to RMP */}
                                {prof?.legacy_id ? `TID ${prof.legacy_id}` : ""}
                            </a>
                        ) : (
                            <span className="muted">Pick a professor to load data</span>
                        )}
                    </div>

                    {/* Sections table (internal scroller) */}
                    <div style={{ overflow: "auto", maxHeight: 380, borderTop: "1px solid #1e242e", borderBottom: "1px solid #1e242e" }}>
                        <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                            <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                                <th style={{ padding: 6 }}>Year</th>
                                <th style={{ padding: 6 }}>Sess</th>
                                <th style={{ padding: 6 }}>Campus</th>
                                <th style={{ padding: 6 }}>Course</th>
                                <th style={{ padding: 6 }}>Section</th>
                                <th style={{ padding: 6 }}>Title</th>
                                <th style={{ padding: 6, textAlign: "right" }}>Enrolled</th>
                                <th style={{ padding: 6, textAlign: "right" }}>Avg %</th>
                            </tr>
                            </thead>
                            <tbody>
                            {sections.map((r, i) => (
                                <tr key={`${r.year}-${r.session}-${r.subject}-${r.course}-${r.section}-${i}`} style={{ borderTop: "1px solid #1e242e" }}>
                                    <td style={{ padding: 6 }}>{r.year}</td>
                                    <td style={{ padding: 6 }}>{r.session}</td>
                                    <td style={{ padding: 6 }}>{r.campus ?? "—"}</td>
                                    <td style={{ padding: 6 }}>
                                        {r.subject} {r.course}
                                    </td>
                                    <td style={{ padding: 6 }}>{r.section}</td>
                                    <td style={{ padding: 6, maxWidth: 260, overflow: "visible", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {r.title}
                                    </td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg, 2)}</td>
                                </tr>
                            ))}
                            {!sections.length && (
                                <tr>
                                    <td colSpan={8} className="muted" style={{ padding: 10 }}>
                                        No sections loaded.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    {/* Per-course summary (internal scroller) */}
                    <div className="card" style={{ marginTop: 12, minWidth: 0, overflow: "visible" }}>
                        <div className="card-h" style={{ display: "flex", justifyContent: "space-between" }}>
                            <h3 style={{ margin: 0 }}>Per-Course Summary</h3>
                            <span className="muted">{perCourse.length} courses</span>
                        </div>
                        <div style={{ overflow: "auto", maxHeight: 220, borderTop: "1px solid #1e242e", borderBottom: "1px solid #1e242e" }}>
                            <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                                    <th style={{ padding: 6 }}>Course</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>Avg %</th>
                                    <th style={{ padding: 6, textAlign: "right" }}># Sections</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>Enrolled</th>
                                    <th style={{ padding: 6 }}>Years</th>
                                </tr>
                                </thead>
                                <tbody>
                                {perCourse.map((c) => (
                                    <tr key={c.course_code} style={{ borderTop: "1px solid #1e242e" }}>
                                        <td style={{ padding: 6 }}>{c.course_code}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{fmt(c.avg_of_avg, 2)}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{c.n_sections}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{c.total_enrolled ?? "—"}</td>
                                        <td style={{ padding: 6 }}>
                                            {c.first_year != null && c.last_year != null ? `${c.first_year}–${c.last_year}` : "—"}
                                        </td>
                                    </tr>
                                ))}
                                {!perCourse.length && (
                                    <tr>
                                        <td colSpan={5} className="muted" style={{ padding: 10 }}>
                                            No per-course data.
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <div className="card" style={{ minWidth: 0, overflow: "visible" }}>
                        <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h3 style={{ margin: 0 }}>Overall Grade Distribution</h3>
                            <div className="muted">{bins?.length ? "CSV bins" : hist?.length ? "Histogram (avg)" : ""}</div>
                        </div>
                        <DistributionPanel bins={bins} hist={hist} />
                    </div>

                    <div className="card" style={{ minWidth: 0, overflow: "visible" }}>
                        <div className="card-h">
                            <h3 style={{ margin: 0 }}>Course Scatter</h3>
                        </div>
                        <MiniCourseScatter rows={perCourse} xKey={xKey} yKey={yKey} onX={setXKey} onY={setYKey} />
                    </div>
                </div>
            </div>
        </div>
    );
}
