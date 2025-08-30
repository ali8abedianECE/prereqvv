export default function RatingDistribution({ dist }: { dist: Record<string, number> }) {
    const bins = ["<50","50-54","55-59","60-63","64-67","68-71","72-75","76-79","80-84","85-89","90-100"];
    const vals = bins.map(b=> dist?.[b] ?? 0);
    const max = Math.max(1, ...vals);
    return (
        <div style={{ display:"flex", gap:6, alignItems:"end", height:120, border:"1px solid #e2e8f0", padding:8, borderRadius:6, overflowX:"auto" }}>
            {vals.map((v,i)=>(
                <div key={i} title={`${bins[i]}: ${v}`} style={{ width:28, height:Math.round((v/max)*100), background:"#003145" }}>
                    <div style={{ transform:"translateY(110%)", fontSize:10, whiteSpace:"nowrap" }}>{bins[i]}</div>
                </div>
            ))}
        </div>
    );
}
