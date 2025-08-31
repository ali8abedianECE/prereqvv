// src/components/ProfScatter.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON2 } from "../api/http";

export type VizProfessor = {
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

type ScatterPoint = {
    id: string;
    label: string;
    x: number;      // difficulty
    y: number;      // rating
    size: number;   // num ratings
    dept?: string | null;
    fac?: string | null;
};

const API = (import.meta as any).env?.VITE_API_BASE || "";

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function colorByRating(r: number) {
    // 1..5 → red→yellow→green
    const t = clamp((r - 1) / 4, 0, 1);
    const rC = Math.round(230 + (89 - 230) * t);
    const gC = Math.round(78  + (201 - 78) * t);
    const bC = Math.round(57  + (79  - 57) * t);
    return `rgb(${rC},${gC},${bC})`;
}

function MiniHistogram({ values }: { values: number[] }) {
    const bins = new Array(20).fill(0);
    for (const v of values) {
        if (Number.isFinite(v)) {
            const idx = clamp(Math.floor(((v - 1) / 4) * 20), 0, 19); // ratings 1..5
            bins[idx]++;
        }
    }
    const max = Math.max(1, ...bins);
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20,1fr)", gap: 2, height: 60, alignItems: "end" }}>
            {bins.map((b, i) => (
                <div key={i} style={{ height: `${(b / max) * 100}%`, background: "#4b7fd6", borderRadius: 2 }} title={`bin ${i+1}: ${b}`} />
            ))}
        </div>
    );
}

export default function ProfScatter({
                                        onOpenProfessor,
                                    }: {
    onOpenProfessor: (payload: { tid: string; name: string }) => void;
}) {
    // ── data ───────────────────────────────────────────────────────────────────
    const [all, setAll] = useState<VizProfessor[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // live search box
    const [q, setQ] = useState("");
    const [suggest, setSuggest] = useState<VizProfessor[]>([]);
    const [showSuggest, setShowSuggest] = useState(false);

    // filters (match Swing: X=Difficulty, Y=Average Rating by default)
    const [metricX, setMetricX] = useState<"difficulty" | "rating" | "would_take" | "ratings">("difficulty");
    const [metricY, setMetricY] = useState<"rating" | "difficulty" | "would_take" | "ratings">("rating");
    const [facultyFilter, setFacultyFilter] = useState<string>("ALL");
    const [deptFilter, setDeptFilter] = useState<string>("ALL");

    // canvas viewport
    const [view, setView] = useState({ xMin: 0.7, xMax: 5.3, yMin: 0.7, yMax: 5.3 });

    // hover cluster near cursor
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
    const [cluster, setCluster] = useState<ScatterPoint[] | null>(null);

    const wrap = useRef<HTMLDivElement | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);

    // initial load: ALL (raise the limit so you see the whole cloud)
    useEffect(() => {
        let dead = false;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const list = await getJSON2<VizProfessor[]>(`${API}/api/viz/professors?limit=5000`);
                if (!dead) setAll(list);
            } catch (e: any) {
                if (!dead) setErr(e?.message || String(e));
            } finally { if (!dead) setLoading(false); }
        })();
        return () => { dead = true; };
    }, []);

    // live suggestions (DB-backed)
    useEffect(() => {
        const t = setTimeout(async () => {
            const term = q.trim();
            if (term.length < 2) { setSuggest([]); return; }
            try {
                const rows = await getJSON2<VizProfessor[]>(`${API}/api/viz/professors?q=${encodeURIComponent(term)}&limit=20`);
                setSuggest(rows);
                setShowSuggest(true);
            } catch { /* ignore */ }
        }, 150);
        return () => clearTimeout(t);
    }, [q]);

    // map → points
    const points: ScatterPoint[] = useMemo(() => {
        const toX = (p: VizProfessor) =>
            metricX === "difficulty" ? Number(p.avg_difficulty) :
                metricX === "rating"     ? Number(p.avg_rating) :
                    metricX === "would_take" ? Number(p.would_take_again_pct ?? 0) / 20 /* 0..5 */ :
                        Math.min(5, Math.max(0.5, Math.log10(Math.max(1, Number(p.num_ratings ?? 1))) + 1));

        const toY = (p: VizProfessor) =>
            metricY === "difficulty" ? Number(p.avg_difficulty) :
                metricY === "rating"     ? Number(p.avg_rating) :
                    metricY === "would_take" ? Number(p.would_take_again_pct ?? 0) / 20 :
                        Math.min(5, Math.max(0.5, Math.log10(Math.max(1, Number(p.num_ratings ?? 1))) + 1));

        let rows = all;
        if (facultyFilter !== "ALL") rows = rows.filter(r => (r.faculty || "") === facultyFilter);
        if (deptFilter !== "ALL") rows = rows.filter(r => (r.department || "") === deptFilter);

        // text filter (client-side)
        const term = q.trim().toLowerCase();
        if (term) {
            rows = rows.filter(p =>
                `${p.first_name} ${p.last_name}`.toLowerCase().includes(term)
                || (p.department || "").toLowerCase().includes(term)
                || (p.faculty || "").toLowerCase().includes(term)
            );
        }

        return rows
            .filter(p => Number.isFinite(toX(p)) && Number.isFinite(toY(p)))
            .map(p => ({
                id: p.legacy_id,
                label: `${p.first_name} ${p.last_name}`,
                x: toX(p),
                y: toY(p),
                size: Math.max(1, Number(p.num_ratings ?? 1)),
                dept: p.department ?? null,
                fac: p.faculty ?? null,
            }));
    }, [all, q, metricX, metricY, facultyFilter, deptFilter]);

    const faculties = useMemo(() => {
        const s = new Set((all.map(p => p.faculty || "").filter(Boolean)));
        return ["ALL", ...Array.from(s).sort((a,b)=>a.localeCompare(b))];
    }, [all]);

    const departments = useMemo(() => {
        const s = new Set(
            all
                .filter(p => facultyFilter === "ALL" || (p.faculty || "") === facultyFilter)
                .map(p => p.department || "")
                .filter(Boolean)
        );
        return ["ALL", ...Array.from(s).sort((a,b)=>a.localeCompare(b))];
    }, [all, facultyFilter]);

    // ── draw ───────────────────────────────────────────────────────────────────
    useEffect(() => {
        const c = canvas.current;
        const host = wrap.current;
        if (!c || !host) return;

        // DPI scaling to kill white seams/hairlines
        const dpr = window.devicePixelRatio || 1;
        const cssW = host.clientWidth - 32;        // padding in card
        const cssH = Math.max(420, Math.round(cssW * 0.5));
        c.style.width = `${cssW}px`;
        c.style.height = `${cssH}px`;
        c.width = Math.floor(cssW * dpr);
        c.height = Math.floor(cssH * dpr);

        const ctx = c.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels

        const w = cssW, h = cssH;
        const pad = 56;

        const xScale = (x: number) => pad + ((x - view.xMin) / (view.xMax - view.xMin)) * (w - pad * 2);
        const yScale = (y: number) => h - pad - ((y - view.yMin) / (view.yMax - view.yMin)) * (h - pad * 2);

        // bg
        ctx.fillStyle = "#0b0f15";
        ctx.fillRect(0, 0, w, h);

        // axes (subtle, not white)
        ctx.strokeStyle = "#263043";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad + 0.5, pad);
        ctx.lineTo(pad + 0.5, h - pad + 0.5);
        ctx.lineTo(w - pad, h - pad + 0.5);
        ctx.stroke();

        // ticks
        ctx.fillStyle = "#9aa7b1";
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
        const ticks = [1, 2, 3, 4, 5];
        ticks.forEach(t => {
            const X = Math.round(xScale(t)) + 0.5;
            ctx.strokeStyle = "#20283a";
            ctx.beginPath();
            ctx.moveTo(X, h - pad);
            ctx.lineTo(X, h - pad + 6);
            ctx.stroke();
            ctx.fillText(String(t), X - 3, h - pad + 18);
        });
        ticks.forEach(t => {
            const Y = Math.round(yScale(t)) + 0.5;
            ctx.strokeStyle = "#20283a";
            ctx.beginPath();
            ctx.moveTo(pad - 6, Y);
            ctx.lineTo(pad, Y);
            ctx.stroke();
            ctx.fillText(String(t), pad - 24, Y + 4);
        });

        // points
        for (const p of points) {
            const X = xScale(p.x), Y = yScale(p.y);
            if (X < pad || X > w - pad || Y < pad || Y > h - pad) continue;

            const r = clamp(2 + Math.log10(p.size + 9), 2, 7); // soft size
            ctx.beginPath();
            ctx.arc(X, Y, r, 0, Math.PI * 2);
            ctx.fillStyle = colorByRating(metricY === "rating" ? p.y : 3 + (p.y - 3) * 0.2);
            ctx.fill();
        }
    }, [points, metricY, view]);

    // hit-testing for cluster tooltip
    useEffect(() => {
        const c = canvas.current;
        if (!c) return;

        const hostRect = () => c.getBoundingClientRect();
        const pad = 56;

        const getScales = () => {
            const w = c.clientWidth, h = c.clientHeight;
            const xScale = (x: number) => pad + ((x - view.xMin) / (view.xMax - view.xMin)) * (w - pad * 2);
            const yScale = (y: number) => h - pad - ((y - view.yMin) / (view.yMax - view.yMin)) * (h - pad * 2);
            return { xScale, yScale, w, h };
        };

        function onMove(e: MouseEvent) {
            const rect = hostRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            setCursor({ x: mx, y: my });

            const { xScale, yScale } = getScales();
            const radius = 18;
            const hits: { d: number; p: ScatterPoint }[] = [];
            for (const p of points) {
                const X = xScale(p.x), Y = yScale(p.y);
                const dx = X - mx, dy = Y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 <= radius * radius) hits.push({ d: d2, p });
            }
            hits.sort((a, b) => a.d - b.d);
            setCluster(hits.slice(0, 20).map(h => h.p));
        }
        function onLeave() { setCluster(null); setCursor(null); }
        function onWheel(e: WheelEvent) {
            e.preventDefault();
            const z = Math.exp(-e.deltaY * 0.0012);
            const cx = (view.xMin + view.xMax) / 2;
            const cy = (view.yMin + view.yMax) / 2;
            const nx = (view.xMax - view.xMin) * z;
            const ny = (view.yMax - view.yMin) * z;
            setView({
                xMin: clamp(cx - nx / 2, 0.2, 5.8),
                xMax: clamp(cx + nx / 2, 0.2, 5.8),
                yMin: clamp(cy - ny / 2, 0.2, 5.8),
                yMax: clamp(cy + ny / 2, 0.2, 5.8),
            });
        }

        c.addEventListener("mousemove", onMove);
        c.addEventListener("mouseleave", onLeave);
        c.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            c.removeEventListener("mousemove", onMove);
            c.removeEventListener("mouseleave", onLeave);
            c.removeEventListener("wheel", onWheel as any);
        };
    }, [points, view]);

    // ── UI ─────────────────────────────────────────────────────────────────────
    const yValuesForHistogram = useMemo(() => {
        // Show histogram for Y metric if it's a 1..5 scale
        if (metricY === "rating") return points.map(p => p.y);
        if (metricY === "difficulty") return points.map(p => p.y);
        return []; // skip for WTA/ratings
    }, [points, metricY]);

    return (
        <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 16 }}>Professor Scatter Plot</b>

                <label>X:</label>
                <select value={metricX} onChange={e => setMetricX(e.target.value as any)} style={sel}>
                    <option value="difficulty">Difficulty</option>
                    <option value="rating">Average Rating</option>
                    <option value="would_take">Would Take Again (→ 1..5)</option>
                    <option value="ratings"># Ratings (log, → 1..5)</option>
                </select>

                <label>Y:</label>
                <select value={metricY} onChange={e => setMetricY(e.target.value as any)} style={sel}>
                    <option value="rating">Average Rating</option>
                    <option value="difficulty">Difficulty</option>
                    <option value="would_take">Would Take Again (→ 1..5)</option>
                    <option value="ratings"># Ratings (log, → 1..5)</option>
                </select>

                <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)} style={sel}>
                    {faculties.map(f => <option key={f} value={f}>{f === "ALL" ? "All Faculties" : f}</option>)}
                </select>

                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={sel}>
                    {departments.map(d => <option key={d} value={d}>{d === "ALL" ? "All Departments" : d}</option>)}
                </select>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                        <input
                            placeholder="Search professor name…"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            onFocus={() => { if (suggest.length) setShowSuggest(true); }}
                            onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                            style={inp}
                        />
                        {showSuggest && suggest.length > 0 && (
                            <div style={suggestBox}>
                                {suggest.map(p => (
                                    <div
                                        key={p.legacy_id}
                                        onMouseDown={() => {
                                            setQ(`${p.first_name} ${p.last_name}`);
                                            setShowSuggest(false);
                                            // lightly zoom to the match
                                            const match = points.find(pt => pt.id === p.legacy_id);
                                            if (match) {
                                                setView({
                                                    xMin: clamp(match.x - 1.2, 0.2, 5.8),
                                                    xMax: clamp(match.x + 1.2, 0.2, 5.8),
                                                    yMin: clamp(match.y - 1.2, 0.2, 5.8),
                                                    yMax: clamp(match.y + 1.2, 0.2, 5.8),
                                                });
                                            }
                                        }}
                                        style={{ padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #1f283a" }}
                                        title={`${p.department || ""} ${p.faculty ? "• " + p.faculty : ""}`}
                                    >
                                        {p.first_name} {p.last_name}
                                        <span style={{ opacity: .6 }}> — {p.department || "—"}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={() => setQ("")} style={btn}>Reset</button>
                    <span style={{ padding: "6px 8px", border: "1px solid #2a3240", borderRadius: 8, color: "#9aa7b1" }}>
            {points.length} / {all.length} profs
          </span>
                </div>
            </div>

            {/* canvas + histogram */}
            <div ref={wrap} style={{ position: "relative", background: "#0b0f15", border: "1px solid #1e242e", borderRadius: 12, padding: 16 }}>
                <canvas ref={canvas} />
                {cluster && cursor && cluster.length > 0 && (
                    <div
                        style={{
                            position: "absolute",
                            left: clamp(cursor.x + 14, 12, (wrap.current?.clientWidth || 800) - 320),
                            top: clamp(cursor.y + 14, 12, (wrap.current?.clientHeight || 400) - 200),
                            width: 300,
                            background: "#0a0e14",
                            border: "1px solid #2a3240",
                            borderRadius: 12,
                            padding: 12,
                            color: "#e8edf2",
                            boxShadow: "0 8px 30px rgba(0,0,0,.35)",
                            pointerEvents: "none",
                        }}
                    >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{cluster[0].label}</div>
                        {cluster.length > 1 && (
                            <div style={{ maxHeight: 96, overflow: "auto", marginBottom: 8, pointerEvents: "auto" }}>
                                {cluster.map((p) => (
                                    <div
                                        key={p.id}
                                        style={{ padding: "4px 0", borderTop: "1px solid #1b2231", cursor: "pointer" }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onOpenProfessor({ tid: p.id, name: p.label });
                                        }}
                                    >
                                        {p.label}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* stats for the *closest* point */}
                        {cluster.length > 0 && (
                            <table style={{ width: "100%", fontSize: 12 }}>
                                <tbody>
                                <tr><td style={tdL}>Rating</td><td style={tdR}>{cluster[0].y.toFixed(1)} / 5</td></tr>
                                <tr><td style={tdL}>Difficulty</td><td style={tdR}>{cluster[0].x.toFixed(1)} / 5</td></tr>
                                <tr><td style={tdL}># Ratings</td><td style={tdR}>{cluster[0].size}</td></tr>
                                <tr><td style={tdL}>Dept</td><td style={tdR}>{cluster[0].dept || "—"}</td></tr>
                                <tr><td style={tdL}>Faculty</td><td style={tdR}>{cluster[0].fac || "—"}</td></tr>
                                </tbody>
                            </table>
                        )}

                        <div style={{ marginTop: 8, fontSize: 12, opacity: .75, pointerEvents: "auto" }}>
                            <a
                                href={`https://www.ratemyprofessors.com/professor/${cluster[0].id}`}
                                target="_blank" rel="noreferrer"
                                style={{ color: "#7ab7ff" }}
                            >
                                RateMyProf page
                            </a>
                            {" • "}
                            <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); onOpenProfessor({ tid: cluster![0].id, name: cluster![0].label }); }}
                                style={{ color: "#7ab7ff" }}
                            >
                                View courses in app
                            </a>
                        </div>
                    </div>
                )}

                {/* footer caption */}
                <div style={{ position: "absolute", left: 16, bottom: 8, color: "#7b8696", fontSize: 11 }}>
                    Y = {metricLabel(metricY)} • X = {metricLabel(metricX)} • circle size ≈ #ratings • wheel = zoom
                </div>
            </div>

            {/* rating distribution (current subset) */}
            {yValuesForHistogram.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "center" }}>
                    <div style={{ color: "#9aa7b1", fontSize: 13 }}>Rating distribution (current filter)</div>
                    <MiniHistogram values={yValuesForHistogram} />
                </div>
            )}

            {loading && <div style={{ color: "#9aa7b1" }}>Loading…</div>}
            {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}
        </div>
    );
}

function metricLabel(k: "rating" | "difficulty" | "would_take" | "ratings") {
    if (k === "rating") return "Average Rating";
    if (k === "difficulty") return "Difficulty";
    if (k === "would_take") return "Would Take Again (scaled)";
    return "# Ratings (log-scaled)";
}

const sel: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2a3240",
    background: "#141820",
    color: "#e8edf2",
};

const inp: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2a3240",
    background: "#141820",
    color: "#e8edf2",
    width: 260,
};

const btn: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2a3240",
    background: "#141820",
    color: "#e8edf2",
    cursor: "pointer",
};

const suggestBox: React.CSSProperties = {
    position: "absolute",
    zIndex: 20,
    left: 0,
    right: 0,
    top: 36,
    background: "#0b0f15",
    border: "1px solid #1e242e",
    borderRadius: 8,
    overflow: "hidden",
};

const tdL: React.CSSProperties = { opacity: .8, padding: "2px 0" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "2px 0" };
