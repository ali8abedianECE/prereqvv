import React from "react";

type Props = {
    values: number[];                // e.g. one grade avg per *year* (already deduped upstream)
    height?: number;                 // visual height
    binWidth?: number;               // bucket size, default 1 (% point)
    showAvg?: boolean;
    avgPosition?: "top-right" | "bottom-right";
};

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
/** red(0)…green(1) */
function heat01(t: number) {
    const h = lerp(0, 120, clamp(t, 0, 1)); // 0=red → 120=green
    return `hsl(${h}deg 70% 55%)`;
}

export default function Histogram({
                                      values,
                                      height = 180,
                                      binWidth = 1,
                                      showAvg = true,
                                      avgPosition = "bottom-right",
                                  }: Props) {
    const clean = values.filter(v => Number.isFinite(v));
    const lo = clean.length ? Math.floor(Math.min(...clean)) : 0;
    const hi = clean.length ? Math.ceil(Math.max(...clean)) : 100;
    const bins: { x: number; count: number }[] = [];
    for (let x = lo; x <= hi; x += binWidth) bins.push({ x, count: 0 });
    for (const v of clean) {
        const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / binWidth)));
        bins[idx].count++;
    }
    const max = Math.max(1, ...bins.map(b => b.count));
    const avg = clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : NaN;

    // color scale: map bin center (lo..hi) → 0..1
    const tOf = (x: number) => (x - lo) / Math.max(1e-6, hi - lo);

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height,
                overflow: "hidden",
                padding: 8,
                boxSizing: "border-box",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 8,
                    borderRadius: 10,
                    overflow: "hidden",
                }}
            >
                {/* bars */}
                <div
                    style={{
                        position: "absolute",
                        left: 36,
                        right: 10,
                        top: 10,
                        bottom: 28,
                        display: "grid",
                        gridTemplateColumns: `repeat(${bins.length}, 1fr)`,
                        alignItems: "end",
                        gap: 2,
                    }}
                >
                    {bins.map((b, i) => {
                        const hPct = (b.count / max) * 100;
                        const center = b.x + binWidth / 2;
                        return (
                            <div
                                key={i}
                                title={`${b.x}–${b.x + binWidth - 1}: ${b.count}`}
                                style={{
                                    height: `${hPct}%`,
                                    background: heat01(tOf(center)),
                                    borderRadius: 3,
                                }}
                            />
                        );
                    })}
                </div>

                {/* x ticks (sparse) */}
                <div
                    style={{
                        position: "absolute",
                        left: 36,
                        right: 10,
                        bottom: 6,
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#9aa7b1",
                        fontSize: 11,
                    }}
                >
                    <span>{lo}</span>
                    <span>{Math.round(lerp(lo, hi, 0.25))}</span>
                    <span>{Math.round(lerp(lo, hi, 0.5))}</span>
                    <span>{Math.round(lerp(lo, hi, 0.75))}</span>
                    <span>{hi}</span>
                </div>

                {/* y label (left) */}
                <div
                    style={{
                        position: "absolute",
                        left: 8,
                        top: 0,
                        bottom: 28,
                        display: "flex",
                        alignItems: "center",
                        color: "#9aa7b1",
                        fontSize: 11,
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                    }}
                >
                    Count (per year)
                </div>
            </div>

            {/* average label */}
            {showAvg && Number.isFinite(avg) && (
                <div
                    style={{
                        position: "absolute",
                        right: 12,
                        [avgPosition === "top-right" ? "top" : "bottom"]: 8,
                        color: "#a6f3b0",
                        fontSize: 12,
                        fontWeight: 600,
                    } as React.CSSProperties}
                >
                    Average: {avg.toFixed(2)}%
                </div>
            )}
        </div>
    );
}
