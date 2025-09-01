import React from "react";

export type Pt = { x: number; y: number; label: string; ratings?: number };

type Props = {
    data: Pt[];                       // already filtered to course instructors
    height?: number;
    xLabel?: string;
    yLabel?: string;
};

const PAD = 28;

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function heat01(t: number) { return `hsl(${lerp(0,120,clamp(t,0,1))}deg 70% 55%)`; }

export default function MiniProfScatter({ data, height = 240, xLabel = "RMP Diff", yLabel = "RMP Avg" }: Props) {
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    const pts = data.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.ratings ?? 1) > 0);

    const xs = pts.map(d => d.x), ys = pts.map(d => d.y);
    const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 5);
    const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 5);

    function redraw() {
        const wrap = wrapRef.current, cvs = canvasRef.current;
        if (!wrap || !cvs) return;

        const cssW = wrap.clientWidth, cssH = height;
        cvs.style.width = cssW + "px";
        cvs.style.height = cssH + "px";
        cvs.width = Math.round(cssW * dpr);
        cvs.height = Math.round(cssH * dpr);

        const ctx = cvs.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        // axes box
        ctx.strokeStyle = "#233040";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, PAD);
        ctx.lineTo(PAD, cssH - PAD);
        ctx.lineTo(cssW - PAD, cssH - PAD);
        ctx.stroke();

        // labels
        ctx.fillStyle = "#9aa7b1";
        ctx.font = "12px Inter, system-ui, sans-serif";
        // y
        ctx.save();
        ctx.translate(12, cssH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(yLabel, 0, 0);
        ctx.restore();
        // x
        ctx.textAlign = "center";
        ctx.fillText(xLabel, cssW / 2, cssH - 6);

        // early exit
        if (!pts.length) {
            ctx.fillStyle = "#9aa7b1";
            ctx.textAlign = "center";
            ctx.fillText("No RMP points", cssW / 2, cssH / 2);
            return;
        }

        // plot
        const W = cssW - PAD * 2, H = cssH - PAD * 2;
        for (const p of pts) {
            const sx = PAD + ((p.x - xMin) / Math.max(1e-6, xMax - xMin)) * W;
            const sy = PAD + (1 - (p.y - yMin) / Math.max(1e-6, yMax - yMin)) * H;
            const t = (p.y - yMin) / Math.max(1e-6, yMax - yMin); // color by avg
            ctx.beginPath();
            ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = heat01(t);
            ctx.globalAlpha = 0.95;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    React.useEffect(() => {
        redraw();
        const onResize = () => redraw();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, height]);

    return (
        <div ref={wrapRef} style={{ width: "100%", height, overflow: "hidden" }}>
            <canvas
                ref={canvasRef}
                style={{ width: "100%", height, display: "block", background: "#0b1017", borderRadius: 10 }}
            />
        </div>
    );
}
