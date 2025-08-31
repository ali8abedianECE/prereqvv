export default function RatingDistribution({ values }: { values: number[] }) {
    const bins = new Array(20).fill(0); // 1..5 in 0.2 steps
    for (const v of values) {
        if (v == null || Number.isNaN(v)) continue;
        const clamped = Math.max(1, Math.min(5, v));
        const idx = Math.min(19, Math.floor((clamped - 1) / 0.2));
        bins[idx]++;
    }
    const max = Math.max(1, ...bins);
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20,1fr)", gap: 2, alignItems: "end", height: 90 }}>
            {bins.map((b, i) => (
                <div key={i}
                     title={`${(1 + i * 0.2).toFixed(1)}–${(1 + (i + 1) * 0.2).toFixed(1)}: ${b}`}
                     style={{ height: `${(b / max) * 100}%`, background: "#5e8df5", borderRadius: 2 }} />
            ))}
        </div>
    );
}
