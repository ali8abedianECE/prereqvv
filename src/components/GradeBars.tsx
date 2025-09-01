import React from "react";

export type YearGrade = { year: number; value: number };

type Props = {
    data: YearGrade[];                 // one value per year (already selected upstream)
    height?: number;                   // total component height (card space)
    yLabel?: string;
    showAvg?: boolean;
};

const PAD_L = 36;
const PAD_B = 22;
const PAD_R = 10;
const PAD_T = 10;

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
/** 0 → red, 1 → green (bias toward 100) */
function heatFromPercent(pct: number) {
    const t = clamp((pct - 50) / 50, 0, 1);          // 50%→0 … 100%→1
    const h = lerp(0, 120, t);                       // red→green
    return `hsl(${h}deg 70% 55%)`;
}

export default function GradeBars({ data, height = 220, yLabel = "Grade %", showAvg = true }: Props) {
    const refWrap = React.useRef<HTMLDivElement | null>(null);
    const refCanvas = React.useRef<HTMLCanvasElement | null>(null);
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    const clean = data.filter(d => Number.isFinite(d.value));
    const avg = clean.length ? clean.reduce((a, b) => a + b.value, 0) / clean.length : NaN;
    const vMin = Math.min(50, ...clean.map(d => d.value)); // anchor near 50 to keep red meaningful
    const vMax = Math.max(100, ...clean.map(d => d.value));

    function redraw() {
        const wrap = refWrap.current, cvs = refCanvas.current;
        if (!wrap || !cvs) return;

        const cssW = wrap.clientWidth;
        const cssH = height;

        cvs.style.width = cssW + "px";
        cvs.style.height = cssH + "px";
        cvs.width = Math.round(cssW * dpr);
        cvs.height = Math.round(cssH * dpr);

        const ctx = cvs.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        // frame
        const plotL = PAD_L, plotR = cssW - PAD_R, plotT = PAD_T, plotB = cssH - PAD_B;
        const W = plotR - plotL, H = plotB - plotT;

        // axes
        ctx.strokeStyle = "#233040";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotL, plotT);
        ctx.lineTo(plotL, plotB);
        ctx.lineTo(plotR, plotB);
        ctx.stroke();

        // y ticks (min/avg/max)
        ctx.fillStyle = "#9aa7b1";
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        const yt = (v: number) => plotB - ( (v - vMin) / Math.max(1e-6, vMax - vMin) ) * H;
        for (const v of [vMin, avg, vMax]) {
            if (!Number.isFinite(v)) continue;
            ctx.fillText(String(Math.round(v)), plotL - 6, yt(v) + 4);
        }
        // y label
        ctx.save();
        ctx.translate(12, (plotT + plotB) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(yLabel, 0, 0);
        ctx.restore();

        // bars (one per year)
        const n = clean.length;
        if (n === 0) {
            ctx.fillStyle = "#9aa7b1";
            ctx.textAlign = "center";
            ctx.fillText("No data", cssW / 2, (plotT + plotB) / 2);
            return;
        }

        const gap = Math.max(2, Math.min(10, W / n / 5));
        const barW = Math.max(6, (W - gap * (n - 1)) / n);

        clean
            .sort((a, b) => a.year - b.year)
            .forEach((d, i) => {
                const x = plotL + i * (barW + gap);
                const y = yt(d.value);
                const h = Math.max(0, plotB - y);
                ctx.fillStyle = heatFromPercent(d.value);
                ctx.beginPath();
                ctx.roundRect(x, y, barW, h, 3);
                ctx.fill();

                // year labels
                ctx.fillStyle = "#9aa7b1";
                ctx.textAlign = "center";
                ctx.fillText(String(d.year), x + barW / 2, plotB + 14);
            });

        // average label (top-right inside plot)
        if (showAvg && Number.isFinite(avg)) {
            const label = `Average: ${avg.toFixed(2)}%`;
            ctx.fillStyle = "#a6f3b0";
            ctx.textAlign = "right";
            ctx.fillText(label, plotR, plotT + 14);
        }
    }

    React.useEffect(() => {
        redraw();
        const onResize = () => redraw();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, height]);

    return (
        <div ref={refWrap} style={{ width: "100%", height, overflow: "hidden" }}>
            <canvas
                ref={refCanvas}
                style={{
                    width: "100%",
                    height,
                    display: "block",
                    background: "#0b1017",
                    borderRadius: 10,
                }}
            />
        </div>
    );
}
