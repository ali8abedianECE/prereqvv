export default function Histogram({ values }: { values: number[] }) {
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
