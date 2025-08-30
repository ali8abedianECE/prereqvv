// src/components/CourseStatsTable.tsx
import { CourseStatRow, rmpLink } from "../api/viz";

function fmtNum(n: number | null | undefined, d = 1) {
    return n == null ? "—" : Number(n).toFixed(d);
}
function fmtPct(n: number | null | undefined) {
    return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}

export default function CourseStatsTable({ rows }: { rows: CourseStatRow[] }) {
    if (!rows?.length) return null;

    return (
        <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
            <h4 style={{ marginTop:0 }}>Course-level RMP (per matched prof)</h4>
            <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                    <tr>
                        <th style={th}>RMP Prof (tid)</th>
                        <th style={th}>#Ratings</th>
                        <th style={th}>Rating</th>
                        <th style={th}>Difficulty</th>
                        <th style={th}>WTA %</th>
                        <th style={th}>Link</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((r, i) => (
                        <tr key={`${r.tid ?? "none"}-${i}`}>
                            <td style={tdMono}>{r.tid ?? "—"}</td>
                            <td style={tdRight}>{r.num_ratings ?? "—"}</td>
                            <td style={tdRight}>{fmtNum(r.avg_rating)}</td>
                            <td style={tdRight}>{fmtNum(r.avg_difficulty)}</td>
                            <td style={tdRight}>{fmtPct(r.would_take_again_pct)}</td>
                            <td style={tdLink}>
                                {r.tid ? <a href={rmpLink(r.tid)} target="_blank" rel="noreferrer">RMP</a> : "—"}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const th: React.CSSProperties = {
    textAlign:"left", padding:"8px 10px", borderBottom:"1px solid #1e242e", fontWeight:600
};
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid #1e242e" };
const tdRight: React.CSSProperties = { ...td, textAlign:"right" };
const tdMono: React.CSSProperties = { ...td, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdLink: React.CSSProperties = { ...td, textAlign:"center" };
