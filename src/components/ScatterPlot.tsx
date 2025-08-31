import React from "react";

export type ScatterDatum = {
    id: string;
    label: string;
    x: number;     // difficulty
    y: number;     // rating
    size: number;  // #ratings
    faculty?: string | null;
    department?: string | null;
};

function colorByRating(r: number) {
    const t = Math.max(1, Math.min(5, r));
    const f = (t - 1) / 4;
    const rC = Math.round(230 + (89 - 230) * f);
    const gC = Math.round(78 + (201 - 78) * f);
    const bC = Math.round(57 + (79 - 57) * f);
    return `rgb(${rC},${gC},${bC})`;
}

export default function ScatterPlot({
                                        data,
                                        width = 980,
                                        height = 560,
                                        onPointClick,
                                        xLabel = "Difficulty",
                                        yLabel = "Average Rating",
                                    }: {
    data: ScatterDatum[];
    width?: number; height?: number;
    onPointClick?: (ds: ScatterDatum[]) => void;
    xLabel?: string; yLabel?: string;
}) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const [tip, setTip] = React.useState<{ items: ScatterDatum[]; x: number; y: number } | null>(null);
    const [view, setView] = React.useState({ xMin: 0.5, xMax: 5.5, yMin: 0.5, yMax: 5.5 });

    const padding = { l: 56, b: 44, t: 10, r: 12 };

    // Helpers using current view
    const xScale = React.useCallback((x: number, w: number) => {
        const t = (x - view.xMin) / (view.xMax - view.xMin);
        return padding.l + t * (w - padding.l - padding.r);
    }, [view]);
    const yScale = React.useCallback((y: number, h: number) => {
        const t = (y - view.yMin) / (view.yMax - view.yMin);
        return h - padding.b - t * (h - padding.t - padding.b);
    }, [view]);

    // HiDPI canvas setup + render
    React.useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        const ctx = c.getContext("2d")!;
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        // physical pixels
        c.width  = Math.floor(width * dpr);
        c.height = Math.floor(height * dpr);
        // css pixels
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;

        // scale drawing
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // clear
        ctx.clearRect(0, 0, width, height);

        // axes (very dark so no “white lines” vibe)
        ctx.strokeStyle = "#1b2430";
        ctx.lineWidth = 1;
        ctx.beginPath();
        // left axis
        ctx.moveTo(Math.round(padding.l) + 0.5, padding.t);
        ctx.lineTo(Math.round(padding.l) + 0.5, height - padding.b);
        // bottom axis
        ctx.moveTo(padding.l, Math.round(height - padding.b) + 0.5);
        ctx.lineTo(width - padding.r, Math.round(height - padding.b) + 0.5);
        ctx.stroke();

        // ticks & labels (no grid lines)
        ctx.fillStyle = "#8b99a6";
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
        const ticks = [1, 2, 3, 4, 5];
        for (const v of ticks) {
            const X = Math.round(xScale(v, width)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(X, height - padding.b);
            ctx.lineTo(X, height - padding.b + 5);
            ctx.stroke();
            ctx.fillText(String(v), X - 3, height - padding.b + 18);
        }
        for (const v of ticks) {
            const Y = Math.round(yScale(v, height)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(padding.l - 5, Y);
            ctx.lineTo(padding.l, Y);
            ctx.stroke();
            ctx.fillText(String(v), padding.l - 24, Y + 4);
        }
        // axis titles
        ctx.fillText(yLabel, 12, padding.t + 8);
        ctx.fillText(xLabel, width / 2 - 24, height - 10);

        // points
        for (const d of data) {
            if (d.x < view.xMin || d.x > view.xMax || d.y < view.yMin || d.y > view.yMax) continue;
            const X = xScale(d.x, width);
            const Y = yScale(d.y, height);
            const r = Math.max(2, Math.min(6, Math.sqrt(Math.max(1, d.size))));
            ctx.beginPath();
            ctx.arc(X, Y, r, 0, Math.PI * 2);
            ctx.fillStyle = colorByRating(d.y);
            ctx.fill();
        }
    }, [data, view, width, height, xScale, yScale, xLabel, yLabel]);

    // hit-test, hover, click
    React.useEffect(() => {
        const c = canvasRef.current; const wrap = wrapRef.current;
        if (!c || !wrap) return;
        const w = width, h = height;

        function groupAt(mx: number, my: number) {
            const within: { d: ScatterDatum; dist2: number }[] = [];
            for (const d of data) {
                const X = xScale(d.x, w), Y = yScale(d.y, h);
                const dx = X - mx, dy = Y - my, d2 = dx * dx + dy * dy;
                const rr = Math.max(6, Math.sqrt(Math.max(1, d.size)) + 6);
                if (d2 <= rr * rr) within.push({ d, dist2: d2 });
            }
            within.sort((a, b) => a.dist2 - b.dist2);
            if (!within.length) return null;

            const anchor = within[0].d;
            const group = within
                .map(x => x.d)
                .filter(d => Math.abs(d.x - anchor.x) <= 0.08 && Math.abs(d.y - anchor.y) <= 0.08)
                .slice(0, 16);
            return group;
        }

        function onMove(e: MouseEvent) {
            const r = c.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            const g = groupAt(mx, my);
            if (g) setTip({ items: g, x: mx, y: my });
            else setTip(null);
        }
        function onClick() {
            if (tip?.items && onPointClick) onPointClick(tip.items);
        }

        c.addEventListener("mousemove", onMove);
        c.addEventListener("click", onClick);
        return () => {
            c.removeEventListener("mousemove", onMove);
            c.removeEventListener("click", onClick);
        };
    }, [data, width, height, xScale, yScale, tip, onPointClick]);

    // wheel zoom
    React.useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        function onWheel(e: WheelEvent) {
            e.preventDefault();
            const zoom = Math.exp(-e.deltaY * 0.001);
            const cx = (view.xMin + view.xMax) / 2;
            const cy = (view.yMin + view.yMax) / 2;
            const nx = (view.xMax - view.xMin) * zoom;
            const ny = (view.yMax - view.yMin) * zoom;
            const xMin = Math.max(0.2, cx - nx / 2), xMax = Math.min(5.8, cx + nx / 2);
            const yMin = Math.max(0.2, cy - ny / 2), yMax = Math.min(5.8, cy + ny / 2);
            setView({ xMin, xMax, yMin, yMax });
        }
        c.addEventListener("wheel", onWheel, { passive: false });
        return () => c.removeEventListener("wheel", onWheel as any);
    }, [view]);

    // Tooltip position near cursor (keeps in-bounds)
    const tipStyle: React.CSSProperties | undefined = React.useMemo(() => {
        if (!tip) return undefined;
        const pad = 10;
        const maxW = 360;
        let left = tip.x + 14;
        let top = tip.y + 14;
        if (left + maxW > width) left = Math.max(8, width - maxW - pad);
        if (top + 160 > height) top = Math.max(8, height - 160);
        return {
            position: "absolute",
            left, top,
            maxWidth: maxW,
            background: "#0b0d10",
            border: "1px solid #2a3240",
            borderRadius: 12,
            padding: 12,
            color: "#e8edf2",
            pointerEvents: "none",
            boxShadow: "0 8px 20px rgba(0,0,0,.35)",
            zIndex: 2,
        };
    }, [tip, width, height]);

    return (
        <div ref={wrapRef} style={{ position: "relative" }}>
            <canvas ref={canvasRef} />
            {tip && (
                <div style={tipStyle}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        {tip.items.slice(0, 3).map(h => h.label).join(", ")}
                        {tip.items.length > 3 ? `, +${tip.items.length - 3}…` : ""}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                        <div>Rating</div>    <div style={{ textAlign: "right" }}>{tip.items[0].y.toFixed(1)} / 5</div>
                        <div>Difficulty</div> <div style={{ textAlign: "right" }}>{tip.items[0].x.toFixed(1)} / 5</div>
                        <div># Ratings</div>  <div style={{ textAlign: "right" }}>{tip.items.reduce((s,d)=>s+d.size,0)}</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: .75 }}>click to focus this cluster</div>
                </div>
            )}
        </div>
    );
}
