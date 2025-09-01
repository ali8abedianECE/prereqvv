// src/features/course/CourseExplorer.tsx
import React from "react";
import {
    fetchCourseStats,
    fetchVizSections,
    searchBases,
    VizCourseStat,
    VizSection,
} from "../../api/viz";

/* -------------------- helpers -------------------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (n: number | null | undefined, d = 2) =>
    n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);
const isLecture = (s?: string | null) => !!s && /^[0-9]{3}[A-Z]?$/.test(s) && s !== "OVERALL";
const hueFromPct = (p: number) => 10 + (115 - 10) * clamp((p - 50) / 50, 0, 1);
const colFromPct = (p: number) => `hsl(${hueFromPct(p)}deg 70% 55%)`;

/* -------------------- responsive measure hook -------------------- */
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

/* =========================================================
   GRADE PANEL (responsive)
   ========================================================= */
type Mode = "year" | "hist";

function GradePanel({
                        yearRows,
                        uniqRows,
                        mode,
                    }: {
    yearRows: VizSection[];
    uniqRows: VizSection[];
    mode: Mode;
}) {
    const [wrapRef, size] = useMeasure<HTMLDivElement>();
    // fixed height inside card; width from measure
    const OUT_H = 290;
    const OUT_W = size.w || 0;
    const PAD_LR = 24,
        PAD_T = 34,
        PAD_B = 28;
    const W = Math.max(0, OUT_W - PAD_LR * 2);
    const H = OUT_H - PAD_T - PAD_B;

    const rows = mode === "year" ? yearRows : uniqRows;
    const grades = rows.filter((r) => r.avg != null).map((r) => r.avg as number);
    const gmin = grades.length ? Math.min(...grades) : 0;
    const gmax = grades.length ? Math.max(...grades) : 100;
    const yMin = Math.max(0, Math.floor(gmin - 1));
    const yMax = Math.min(100, Math.ceil(gmax + 1));
    const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;

    const yToPx = (v: number) => PAD_T + H - ((v - yMin) / Math.max(1e-6, yMax - yMin)) * H;

    return (
        <div ref={wrapRef} style={{ width: "100%", height: OUT_H, overflow: "hidden" }}>
            {OUT_W > 0 && (
                <svg width={OUT_W} height={OUT_H} style={{ display: "block" }}>
                    {/* axes */}
                    <line x1={PAD_LR} y1={PAD_T} x2={PAD_LR} y2={PAD_T + H} stroke="#263041" />
                    <line x1={PAD_LR} y1={PAD_T + H} x2={PAD_LR + W} y2={PAD_T + H} stroke="#263041" />

                    {/* avg label stays visible */}
                    {avg != null && (
                        <text x={PAD_LR + W - 6} y={16} fill="#7bd17b" fontSize={12} textAnchor="end">
                            Average: {fmt(avg, 2)}%
                        </text>
                    )}

                    {mode === "year" &&
                        (() => {
                            const gap = 6;
                            const n = grades.length;
                            const bw = n ? (W - gap * (n - 1)) / n : 0;
                            return rows.map((r, i) => {
                                const g = r.avg as number;
                                const x = PAD_LR + i * (bw + gap);
                                const y = yToPx(g);
                                const h = PAD_T + H - y;
                                return (
                                    <g key={i}>
                                        <rect
                                            x={x}
                                            y={y}
                                            width={Math.max(2, bw)}
                                            height={Math.max(1, h)}
                                            rx={4}
                                            fill={colFromPct(g)}
                                        />
                                        <text
                                            x={x + bw / 2}
                                            y={PAD_T + H + 14}
                                            fill="#94a3b8"
                                            fontSize={10}
                                            textAnchor="middle"
                                        >
                                            {r.year}
                                        </text>
                                    </g>
                                );
                            });
                        })()}

                    {mode === "hist" &&
                        (() => {
                            // 12 bins across [yMin..yMax], each UNIQUE (year, sess, section) counts 1
                            const NB = 12,
                                span = Math.max(1e-6, (yMax - yMin) / NB);
                            const bins = new Array(NB).fill(0) as number[];
                            for (const r of uniqRows) {
                                if (r.avg == null) continue;
                                const g = r.avg as number;
                                const idx = clamp(Math.floor((g - yMin) / span), 0, NB - 1);
                                bins[idx] += 1;
                            }
                            const maxC = Math.max(1, ...bins);
                            return bins.map((c, i) => {
                                const cellW = W / NB;
                                const w = Math.max(6, cellW - 4);
                                const x = PAD_LR + i * cellW + 2;
                                const h = (c / maxC) * H;
                                const y = PAD_T + H - h;
                                const bucketMid = yMin + i * span + span / 2;
                                return (
                                    <g key={i}>
                                        <rect x={x} y={y} width={w} height={Math.max(1, h)} rx={3} fill={colFromPct(bucketMid)} />
                                        <text
                                            x={x + w / 2}
                                            y={PAD_T + H + 14}
                                            fill="#94a3b8"
                                            fontSize={10}
                                            textAnchor="middle"
                                        >
                                            {Math.round(yMin + i * span)}
                                        </text>
                                    </g>
                                );
                            });
                        })()}

                    {/* y ticks */}
                    <text x={PAD_LR - 6} y={yToPx(yMin)} fill="#94a3b8" fontSize={10} textAnchor="end">
                        {yMin}
                    </text>
                    <text x={PAD_LR - 6} y={yToPx(yMax)} fill="#94a3b8" fontSize={10} textAnchor="end">
                        {yMax}
                    </text>

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
                        {mode === "hist" ? "Count" : "Grade %"}
                    </text>
                </svg>
            )}
        </div>
    );
}

/* =========================================================
   MINI SCATTER (responsive, clamped tooltip)
   ========================================================= */
type AxisKey = "avg_rating" | "avg_difficulty" | "would_take_again_pct" | "num_ratings";
const AXIS_LABEL: Record<AxisKey, string> = {
    avg_rating: "RMP Avg",
    avg_difficulty: "RMP Diff",
    would_take_again_pct: "WTA %",
    num_ratings: "# Ratings",
};

type MiniPoint = {
    id: string;
    name: string;
    avg_rating: number;
    avg_difficulty: number;
    would_take_again_pct: number;
    num_ratings: number;
};

function MiniScatter({
                         points,
                         xKey,
                         yKey,
                         onX,
                         onY,
                     }: {
    points: MiniPoint[];
    xKey: AxisKey;
    yKey: AxisKey;
    onX: (k: AxisKey) => void;
    onY: (k: AxisKey) => void;
}) {
    const [wrapRef, size] = useMeasure<HTMLDivElement>();
    const OUT_W = size.w || 0;
    const OUT_H = 260;
    const PAD = 28;
    const W = Math.max(0, OUT_W - PAD * 2);
    const H = OUT_H - PAD * 2;

    const xs = points.map((p) => p[xKey]).filter(Number.isFinite);
    const ys = points.map((p) => p[yKey]).filter(Number.isFinite);
    const xMin = Math.min(...xs),
        xMax = Math.max(...xs);
    const yMin = Math.min(...ys),
        yMax = Math.max(...ys);
    const xTo = (v: number) => PAD + ((v - xMin) / Math.max(1e-6, xMax - xMin)) * W;
    const yTo = (v: number) => PAD + H - ((v - yMin) / Math.max(1e-6, yMax - yMin)) * H;

    const holderRef = React.useRef<SVGSVGElement | null>(null);
    const [hover, setHover] = React.useState<{ p: MiniPoint; cx: number; cy: number } | null>(null);

    function nearest(e: React.MouseEvent) {
        if (!holderRef.current) return null;
        const r = holderRef.current.getBoundingClientRect();
        const px = e.clientX - r.left,
            py = e.clientY - r.top;
        let best: any = null,
            dBest = Infinity;
        for (const p of points) {
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
        const TW = 240,
            TH = 110,
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
                <select value={xKey} onChange={(e) => onX(e.target.value as AxisKey)}>
                    {Object.keys(AXIS_LABEL).map((k) => (
                        <option key={k} value={k}>
                            {AXIS_LABEL[k as AxisKey]}
                        </option>
                    ))}
                </select>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>Y:</span>
                <select value={yKey} onChange={(e) => onY(e.target.value as AxisKey)}>
                    {Object.keys(AXIS_LABEL).map((k) => (
                        <option key={k} value={k}>
                            {AXIS_LABEL[k as AxisKey]}
                        </option>
                    ))}
                </select>
            </div>

            <div ref={wrapRef} style={{ width: "100%", height: OUT_H, position: "relative", overflow: "hidden" }}>
                {OUT_W > 0 && (
                    <svg
                        ref={holderRef}
                        width={OUT_W}
                        height={OUT_H}
                        style={{ display: "block" }}
                        onMouseMove={(e) => setHover(nearest(e))}
                        onMouseLeave={() => setHover(null)}
                    >
                        {/* axes */}
                        <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + H} stroke="#263041" />
                        <line x1={PAD} y1={PAD + H} x2={PAD + W} y2={PAD + H} stroke="#263041" />
                        <text x={PAD + W / 2} y={PAD + H + 24} fill="#94a3b8" fontSize={11} textAnchor="middle">
                            {AXIS_LABEL[xKey]}
                        </text>
                        <text
                            x={12}
                            y={PAD + H / 2}
                            fill="#94a3b8"
                            fontSize={11}
                            textAnchor="middle"
                            transform={`rotate(-90 12 ${PAD + H / 2})`}
                        >
                            {AXIS_LABEL[yKey]}
                        </text>

                        {/* points */}
                        {points.map((p) => {
                            const cx = xTo(p[xKey]);
                            const cy = yTo(p[yKey]);
                            return (
                                <circle
                                    key={p.id}
                                    cx={cx}
                                    cy={cy}
                                    r={6}
                                    fill={colFromPct((p.avg_rating / 5) * 100)}
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
                                }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{hover.p.name}</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: 12 }}>
                                    <span>RMP Avg</span>
                                    <span>{fmt(hover.p.avg_rating, 2)}</span>
                                    <span>RMP Diff</span>
                                    <span>{fmt(hover.p.avg_difficulty, 2)}</span>
                                    <span>WTA %</span>
                                    <span>{fmt(hover.p.would_take_again_pct, 1)}</span>
                                    <span># Ratings</span>
                                    <span>{hover.p.num_ratings}</span>
                                </div>
                            </div>
                        );
                    })()}
            </div>
        </div>
    );
}

/* =========================================================
   MAIN
   ========================================================= */
export default function CourseExplorer({ courseCode }: { courseCode?: string }) {
    // Prefill but require clicking Search
    const [entry, setEntry] = React.useState<string>(courseCode ?? "");
    const [subject, number] = React.useMemo(() => {
        const s = entry.toUpperCase().replace(/\s+/g, " ").trim();
        const m = s.match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)$/);
        return m ? [m[1], m[2]] : ["", ""];
    }, [entry]);

    const [rows, setRows] = React.useState<VizSection[]>([]);
    const [stats, setStats] = React.useState<VizCourseStat[]>([]);
    const [onlyRmp, setOnlyRmp] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    // distribution mode toggle
    const [mode, setMode] = React.useState<Mode>("year");

    // mini scatter axis
    const [xKey, setXKey] = React.useState<"avg_difficulty" | "avg_rating" | "would_take_again_pct" | "num_ratings">(
        "avg_difficulty",
    );
    const [yKey, setYKey] = React.useState<"avg_difficulty" | "avg_rating" | "would_take_again_pct" | "num_ratings">(
        "avg_rating",
    );

    /* ---------- typeahead suggestions (fixed width; no shifting) ---------- */
    const [sugs, setSugs] = React.useState<string[]>([]);
    const [showSugs, setShowSugs] = React.useState(false);
    const [hi, setHi] = React.useState(0);
    const debRef = React.useRef<number | null>(null);

    function fetchSugs(q: string) {
        if (!q || q.length < 2) {
            setSugs([]);
            return;
        }
        searchBases(q).then(setSugs).catch(() => {});
    }
    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setEntry(v);
        setShowSugs(true);
        if (debRef.current) window.clearTimeout(debRef.current);
        debRef.current = window.setTimeout(() => fetchSugs(v), 120);
    }
    function choose(val: string) {
        setEntry(val);
        setShowSugs(false);
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
            choose(sugs[hi]);
        } else if (e.key === "Escape") {
            setShowSugs(false);
        }
    }

    async function run() {
        if (!subject || !number) return;
        setLoading(true);
        setErr(null);
        try {
            const [a, b] = await Promise.all([
                fetchVizSections(subject, number),
                fetchCourseStats(`${subject} ${number}`),
            ]);
            setRows(a);
            setStats(b);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    // Explorer table (lectures; optional RMP-only)
    const tableRows = React.useMemo(
        () =>
            rows
                .filter((r) => isLecture(r.section))
                .filter((r) => (onlyRmp ? !!r.rmp_tid : true))
                .sort((a, b) => b.year - a.year || String(b.section).localeCompare(String(a.section))),
        [rows, onlyRmp],
    );

    // Representative lecture per year (largest enrollment) — for "By year"
    const perYear = React.useMemo(() => {
        const best = new Map<string, VizSection>(); // `${year}`
        for (const r of rows) {
            if (!isLecture(r.section)) continue;
            if (onlyRmp && !r.rmp_tid) continue;
            if (r.avg == null) continue;
            const key = `${r.year}`;
            const cur = best.get(key);
            if (!cur || (r.enrolled ?? 0) > (cur.enrolled ?? 0)) best.set(key, r);
        }
        return Array.from(best.values()).sort((a, b) => a.year - b.year);
    }, [rows, onlyRmp]);

    // UNIQUE (year, session, section) lecture exactly once — for Distribution
    const uniqYearSessSection = React.useMemo(() => {
        const pick = new Map<string, VizSection>();
        for (const r of rows) {
            if (!isLecture(r.section)) continue;
            if (onlyRmp && !r.rmp_tid) continue;
            if (r.avg == null) continue;
            const key = `${r.year}-${r.session}-${r.section}`;
            const cur = pick.get(key);
            if (!cur || (r.enrolled ?? 0) > (cur.enrolled ?? 0)) pick.set(key, r);
        }
        return Array.from(pick.values());
    }, [rows, onlyRmp]);

    // Top 5 based on Explorer rows — by RMP average, tie-break by total #ratings
    const top5 = React.useMemo(() => {
        const m = new Map<string, { name: string; sum: number; cnt: number; num: number; tid: string | null }>();
        for (const r of tableRows) {
            if (r.avg_rating == null) continue;
            const name = r.instructor?.trim() || "";
            if (!name) continue;
            const prev = m.get(name);
            const n = Number(r.num_ratings ?? 0);
            if (prev) {
                prev.sum += Number(r.avg_rating);
                prev.cnt++;
                prev.num += n;
                if (!prev.tid) prev.tid = r.rmp_tid;
            } else m.set(name, { name, sum: Number(r.avg_rating), cnt: 1, num: n, tid: r.rmp_tid });
        }
        return Array.from(m.values())
            .map((v) => ({ name: v.name, avg: v.sum / Math.max(1, v.cnt), num: v.num, tid: v.tid }))
            .sort((a, b) => b.avg - a.avg || b.num - a.num)
            .slice(0, 5);
    }, [tableRows]);

    // Points for mini-scatter (one per prof; row with most ratings)
    const miniPoints = React.useMemo(() => {
        const keep = new Map<string, MiniPoint>();
        for (const r of tableRows) {
            const nm = r.instructor?.trim() || "";
            if (!nm) continue;
            const cand: MiniPoint = {
                id: nm,
                name: nm,
                avg_rating: Number(r.avg_rating ?? NaN),
                avg_difficulty: Number(r.avg_difficulty ?? NaN),
                would_take_again_pct: Number(r.would_take_again_pct ?? NaN),
                num_ratings: Number(r.num_ratings ?? 0),
            };
            const prev = keep.get(nm);
            if (!prev || cand.num_ratings > prev.num_ratings) keep.set(nm, cand);
        }
        return Array.from(keep.values()).filter(
            (p) => Number.isFinite(p.avg_rating) || Number.isFinite(p.avg_difficulty),
        );
    }, [tableRows]);

    /* -------- FIXED HEIGHT BEHAVIOUR ----------
       Measure right column once, then freeze that height.
       Left "Explorer" card adopts this fixed height; its inner area scrolls.
    ------------------------------------------- */
    const [rightRef, rightSize] = useMeasure<HTMLDivElement>();
    const [fixedH, setFixedH] = React.useState<number | null>(null);
    React.useEffect(() => {
        if (rightSize.h > 0 && fixedH == null) setFixedH(rightSize.h);
    }, [rightSize.h, fixedH]);

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr", // equal columns
                gap: 12,
                alignItems: "stretch",
                gridAutoRows: "minmax(0, auto)",
            }}
        >
            {/* Left column: Explorer uses a CONSTANT height (frozen from right column) and scrolls internally */}
            <div
                className="card"
                style={{
                    minWidth: 0,
                    height: fixedH ?? "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden", // prevent outer growth
                }}
            >
                <div
                    className="card-h"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                    <h3 style={{ margin: 0 }}>Explorer</h3>
                    {/* Controls (fixed widths so nothing shifts) */}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                        <div style={{ position: "relative", width: 280 /* fixed so header never expands */ }}>
                            <input
                                placeholder="e.g., CPEN 211"
                                value={entry}
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
                                            key={s}
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
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={run} disabled={!subject || !number}>
                            Search
                        </button>

                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={onlyRmp} onChange={(e) => setOnlyRmp(e.target.checked)} />
                            <span>Only RMP sections</span>
                        </label>

                        {/* reserved status area so header width is stable */}
                        <div style={{ width: 160, textAlign: "right" }}>
                            {loading ? (
                                <span className="muted">Loading…</span>
                            ) : err ? (
                                <span style={{ color: "#ff8a8a" }}>{err}</span>
                            ) : subject && number ? (
                                <span className="muted">
                  Showing: {subject} {number}
                </span>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* INTERNAL SCROLLER: keeps the Explorer card a constant height */}
                <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                        {tableRows.map((r, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                <td style={{ padding: 6 }}>{r.year}</td>
                                <td style={{ padding: 6 }}>{r.session}</td>
                                <td style={{ padding: 6 }}>{r.section}</td>
                                <td style={{ padding: 6 }}>{r.instructor || "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg, 2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_rating, 2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_difficulty, 2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.would_take_again_pct, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.num_ratings ?? "—"}</td>
                                <td style={{ padding: 6 }}>
                                    {r.rmp_tid ? (
                                        <a
                                            href={`https://www.ratemyprofessors.com/professor/${r.rmp_tid}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: "#7ab7ff" }}
                                        >
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

                    {/* Top 5 — compact, inside same scroller */}
                    <div className="card" style={{ marginTop: 12 }}>
                        <div className="card-h">
                            <h3 style={{ margin: 0 }}>
                                Top 5 Professors — {subject && number ? `${subject} ${number}` : ""}
                            </h3>
                        </div>
                        <div>
                            {top5.map((p, i) => (
                                <div
                                    key={i}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr auto auto",
                                        gap: 8,
                                        padding: "10px 8px",
                                        borderTop: i === 0 ? "none" : "1px solid #1e242e",
                                        alignItems: "center",
                                    }}
                                >
                                    <div style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {p.name}
                                    </div>
                                    <div style={{ color: "#9aa7b1" }}>
                                        Avg <span style={{ color: "#dce7f5" }}>{fmt(p.avg, 2)}</span> &nbsp; #{" "}
                                        <span style={{ color: "#dce7f5" }}>{p.num}</span>
                                    </div>
                                    {p.tid ? (
                                        <a
                                            href={`https://www.ratemyprofessors.com/professor/${p.tid}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: "#7ab7ff", justifySelf: "end" }}
                                        >
                                            RMP
                                        </a>
                                    ) : (
                                        <span style={{ color: "#64748b", justifySelf: "end" }}>—</span>
                                    )}
                                </div>
                            ))}
                            {!top5.length && <div className="muted" style={{ padding: 10 }}>No RMP data found.</div>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right column (measured once to set the fixed height) */}
            <div ref={rightRef} style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
                    <div
                        className="card-h"
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                        <h3 style={{ margin: 0 }}>Overall Grade Distribution</h3>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input type="radio" name="m" checked={mode === "year"} onChange={() => setMode("year")} />
                                <span>By year</span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input type="radio" name="m" checked={mode === "hist"} onChange={() => setMode("hist")} />
                                <span>Distribution</span>
                            </label>
                        </div>
                    </div>
                    <GradePanel yearRows={perYear} uniqRows={uniqYearSessSection} mode={mode} />
                </div>

                <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
                    <div className="card-h">
                        <h3 style={{ margin: 0 }}>Mini Professor Scatter (this course)</h3>
                    </div>
                    <MiniScatter
                        points={miniPoints}
                        xKey={xKey}
                        yKey={yKey}
                        onX={setXKey}
                        onY={setYKey}
                    />
                </div>
            </div>
        </div>
    );
}
