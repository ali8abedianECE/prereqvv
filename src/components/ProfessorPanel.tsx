import { useEffect, useMemo, useState } from "react";
import { fetchProfessor, fetchSectionsByProf as fetchSectionsByProfessor } from "../api/viz";
import RatingDistribution from "./RatingDistribution";

type Props = {
    tid: string;
    anchor: { x: number; y: number } | null; // place near cursor
    onClose: () => void;
};

export default function ProfessorPanel({ tid, anchor, onClose }: Props) {
    const [prof, setProf] = useState<VizProfessor | null>(null);
    const [rows, setRows] = useState<VizSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let stop = false;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [p, s] = await Promise.all([
                    fetchProfessor(tid),
                    fetchSectionsByProfessor(tid),
                ]);
                if (!stop) { setProf(p); setRows(s); }
            } catch (e: any) {
                if (!stop) setErr(e?.message || String(e));
            } finally {
                if (!stop) setLoading(false);
            }
        })();
        return () => { stop = true; };
    }, [tid]);

    const name = prof ? `${prof.first_name} ${prof.last_name}` : `tid ${tid}`;
    const ratingsForHist = useMemo(() => rows.map(r => Number(r.avg_rating ?? NaN)).filter(n => !Number.isNaN(n)), [rows]);

    const style: React.CSSProperties = anchor
        ? { position: "fixed", left: Math.min(anchor.x + 16, window.innerWidth - 420), top: Math.min(anchor.y + 16, window.innerHeight - 560), width: 380, zIndex: 60 }
        : { position: "fixed", right: 20, top: 80, width: 420, zIndex: 60 };

    return (
        <div style={style}>
            <div style={{ background: "#0e1520", border: "1px solid #1e242e", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
                <div style={{ padding: 12, borderBottom: "1px solid #1e242e", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 700 }}>{name}</div>
                    <div style={{ marginLeft: "auto", fontSize: 12, color: "#9aa7b1" }}>
                        {prof?.department || "—"} {prof?.faculty ? `• ${prof.faculty}` : ""}
                    </div>
                    <button onClick={onClose} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #2a3240", background: "#141820", color: "#e8edf2" }}>✕</button>
                </div>

                <div style={{ padding: 12, display: "grid", gap: 10 }}>
                    {err && <div style={{ color: "#ff9c9c" }}>{err}</div>}
                    {loading && <div style={{ color: "#9aa7b1" }}>Loading…</div>}

                    {!!prof && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                            <div>Avg Rating</div><div style={{ textAlign: "right" }}>{fmt(prof.avg_rating)}/5</div>
                            <div>Difficulty</div><div style={{ textAlign: "right" }}>{fmt(prof.avg_difficulty)}/5</div>
                            <div>Would Take Again</div><div style={{ textAlign: "right" }}>{fmt(prof.would_take_again_pct)}%</div>
                            <div># Ratings</div><div style={{ textAlign: "right" }}>{prof.num_ratings ?? "—"}</div>
                            {prof.legacy_id && (
                                <>
                                    <div>RMP</div>
                                    <div style={{ textAlign: "right" }}>
                                        <a style={{ color: "#7ab7ff" }} href={`https://www.ratemyprofessors.com/professor/${prof.legacy_id}`} target="_blank" rel="noreferrer">Open</a>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div style={{ borderTop: "1px solid #1e242e", paddingTop: 10 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Courses Taught (matched via tid)</div>
                        <div style={{ maxHeight: 220, overflow: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                <tr style={{ color: "#9aa7b1", textAlign: "left" }}>
                                    <th style={{ padding: 6 }}>Year</th>
                                    <th style={{ padding: 6 }}>Sess</th>
                                    <th style={{ padding: 6 }}>Course</th>
                                    <th style={{ padding: 6 }}>Sect</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>Enr</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>RMP Avg</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>WTA%</th>
                                    <th style={{ padding: 6, textAlign: "right" }}>#R</th>
                                </tr>
                                </thead>
                                <tbody>
                                {rows.map((r, i) => (
                                    <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                        <td style={{ padding: 6 }}>{r.year}</td>
                                        <td style={{ padding: 6 }}>{r.session}</td>
                                        <td style={{ padding: 6 }}>{`${r.subject} ${r.course}`}</td>
                                        <td style={{ padding: 6 }}>{r.section}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_rating)}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_difficulty)}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.would_take_again_pct)}</td>
                                        <td style={{ padding: 6, textAlign: "right" }}>{r.num_ratings ?? "—"}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ borderTop: "1px solid #1e242e", paddingTop: 10 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Rating Distribution (this prof’s sections)</div>
                        <RatingDistribution values={ratingsForHist} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function fmt(n: number | null | undefined, digits = 1) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toFixed(digits);
}
