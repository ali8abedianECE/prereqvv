import { useEffect, useMemo, useRef, useState } from "react";
import { fetchVizProfessors, type VizProfessor } from "../api/viz";

type Pt = VizProfessor & { x: number; y: number };

export default function ProfScatter() {
    const [rows, setRows] = useState<VizProfessor[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hover, setHover] = useState<Pt | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setErr(null);
            try {
                const data = await fetchVizProfessors({ limit: 1000 });
                if (!cancelled) setRows(data.filter(d => d.avg_rating != null && d.avg_difficulty != null));
            } catch (e: any) {
                if (!cancelled) setErr(e?.message || String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // scales
    const pts = useMemo<Pt[]>(() => {
        const xs = rows.map(r => r.avg_difficulty ?? 0);
        const ys = rows.map(r => r.avg_rating ?? 0);
        const xMin = Math.min(1.0, ...xs), xMax = Math.max(5.0, ...xs);
        const yMin = Math.min(1.0, ...ys), yMax = Math.max(5.0, ...ys);
        return rows.map(r => ({
            ...r,
            x: ( (r.avg_difficulty ?? 0) - xMin ) / (xMax - xMin + 1e-6),
            y: ( (r.avg_rating ?? 0)    - yMin ) / (yMax - yMin + 1e-6),
        }));
    }, [rows]);

    // render
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;

        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }

        ctx.clearRect(0, 0, c.width, c.height);

        // plot area margins
        const L = 56, R = 20, T = 24, B = 44;
        const pw = w - L - R, ph = h - T - B;

        // axes
        ctx.strokeStyle = "#99a3ad";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph);
        ctx.stroke();

        // ticks
        const xticks = [1,2,3,4,5], yticks = [1,2,3,4,5];
        ctx.fillStyle = "#cfd6dc";
        ctx.font = "12px ui-sans-serif, system-ui";
        xticks.forEach(v => {
            const x = L + ((v - 1) / 4) * pw;
            ctx.fillRect(x, T + ph, 1, 6);
            ctx.fillText(String(v), x - 4, T + ph + 18);
        });
        yticks.forEach(v => {
            const y = T + ph - ((v - 1) / 4) * ph;
            ctx.fillRect(L - 6, y, 6, 1);
            ctx.fillText(String(v), L - 24, y + 4);
        });

        // points
        for (const p of pts) {
            const x = L + p.x * pw;
            const y = T + (1 - p.y) * ph;

            // color by rating: red -> yellow -> green
            const t = Math.max(0, Math.min(1, ((p.avg_rating ?? 0) - 1) / 4));
            const r = Math.round(255 * (1 - t));
            const g = Math.round(200 * t);
            const b = 40;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [pts]);

    // mouse hover
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const L = 56, R = 20, T = 24, B = 44;
        const onMove = (ev: MouseEvent) => {
            const rect = c.getBoundingClientRect();
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            const pw = c.width - L - R, ph = c.height - T - B;

            let found: Pt | null = null;
            let best = 16;
            for (const p of pts) {
                const x = L + p.x * pw;
                const y = T + (1 - p.y) * ph;
                const d2 = (x - mx) ** 2 + (y - my) ** 2;
                if (d2 < best) { best = d2; found = p; }
            }
            setHover(found);
        };
        c.addEventListener("mousemove", onMove);
        c.addEventListener("mouseleave", () => setHover(null));
        return () => {
            c.removeEventListener("mousemove", onMove);
            c.removeEventListener("mouseleave", () => setHover(null));
        };
    }, [pts]);

    return (
        <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:12, height:"70vh" }}>
            <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
                <h3 style={{ marginTop:0 }}>Professor Scatter Plot</h3>
                <div style={{ color:"#9aa7b1", fontSize:13 }}>
                    X: Difficulty (1–5)<br/>
                    Y: Average Rating (1–5)<br/>
                    Points sized & colored by rating
                </div>
                {loading && <div style={{ marginTop:8, color:"#9aa7b1" }}>Loading…</div>}
                {err && <div style={{ marginTop:8, color:"#ffb4b4" }}>{err}</div>}
                <div style={{ marginTop:8, fontSize:12, color:"#9aa7b1" }}>
                    Loaded: {rows.length} professors
                </div>
            </div>

            <div style={{ position:"relative", background:"#0b0d10", border:"1px solid #1e242e", borderRadius:12 }}>
                <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block", borderRadius:12 }} />
                {hover && (
                    <div
                        style={{
                            position:"absolute",
                            left: 12, bottom: 12,
                            background:"#11161e", border:"1px solid #293040", borderRadius:8, padding:"8px 10px",
                            color:"#e8edf2", pointerEvents:"none", fontSize:13
                        }}
                    >
                        <div><b>{hover.first_name} {hover.last_name}</b></div>
                        <div>Rating: {hover.avg_rating?.toFixed(2) ?? "—"} / 5</div>
                        <div>Difficulty: {hover.avg_difficulty?.toFixed(2) ?? "—"} / 5</div>
                        <div>Would take again: {hover.would_take_again_pct != null ? `${hover.would_take_again_pct.toFixed(1)}%` : "—"}</div>
                        <div>#Ratings: {hover.num_ratings ?? "—"}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
