// src/components/ProfessorExplorer.tsx
import { useEffect, useMemo, useState } from "react";
import { getJSON2 } from "../api/http";

type VizSection = {
    campus: string | null;
    subject: string;
    course: string;
    section: string;
    year: number;
    session: string;
    title: string;
    instructor: string;
    enrolled: number | null;
    avg: number | null;                 // course grade avg (%)
    rmp_tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

export default function ProfessorExplorer({ tid, name }: { tid: string; name: string }) {
    const [rows, setRows] = useState<VizSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let dead = false;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const data = await getJSON2<VizSection[]>(`/api/viz/sections?tid=${encodeURIComponent(tid)}`);
                if (!dead) setRows(data);
            } catch (e: any) {
                if (!dead) setErr(e?.message || String(e));
            } finally { if (!dead) setLoading(false); }
        })();
        return () => { dead = true; };
    }, [tid]);

    const gradeValues = useMemo(
        () => rows.filter(r => r.section !== "OVERALL").map(r => Number(r.avg)).filter(v => Number.isFinite(v)) as number[],
        [rows]
    );
    const overallAvg = gradeValues.length ? (gradeValues.reduce((a,b)=>a+b,0) / gradeValues.length) : null;

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
            <div style={{ background: "#141820", border: "1px solid #1e242e", borderRadius: 12, padding: 12 }}>
                <div style={{ display:"flex", alignItems:"center" }}>
                    <b style={{ fontSize: 16 }}>{name}</b>
                    <div style={{ marginLeft: "auto", color: "#9aa7b1", fontSize: 12 }}>
                        {loading ? "Loading…" : err ? <span style={{ color: "#ff8a8a" }}>{err}</span> : `${rows.length} rows`}
                    </div>
                </div>
                <div style={{ overflow: "auto", maxHeight: "70vh", marginTop: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                        <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                            <th style={{ padding: 6 }}>Campus</th>
                            <th style={{ padding: 6 }}>Year</th>
                            <th style={{ padding: 6 }}>Session</th>
                            <th style={{ padding: 6 }}>Subject</th>
                            <th style={{ padding: 6 }}>Course</th>
                            <th style={{ padding: 6 }}>Section</th>
                            <th style={{ padding: 6 }}>Instructor</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Enrolled</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Grade Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>RMP Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                            <th style={{ padding: 6, textAlign: "right" }}>WTA %</th>
                            <th style={{ padding: 6, textAlign: "right" }}># Ratings</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                <td style={{ padding: 6 }}>{r.campus || "UBC"}</td>
                                <td style={{ padding: 6 }}>{r.year}</td>
                                <td style={{ padding: 6 }}>{r.session}</td>
                                <td style={{ padding: 6 }}>{r.subject}</td>
                                <td style={{ padding: 6 }}>{r.course}</td>
                                <td style={{ padding: 6 }}>{r.section}</td>
                                <td style={{ padding: 6 }}>{r.instructor}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg,2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_rating,1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.avg_difficulty,1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{fmt(r.would_take_again_pct,1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.num_ratings ?? "—"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: 8, color: "#9aa7b1", fontSize: 12 }}>
                    Overall Average: {overallAvg == null ? "—" : overallAvg.toFixed(2)}
                </div>
            </div>

            <div style={{ background: "#141820", border: "1px solid #1e242e", borderRadius: 12, padding: 12 }}>
                <b style={{ fontSize: 16 }}>Overall Grade Distribution</b>
                <GradesHistogram values={gradeValues} />
                <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa7b1", fontSize: 12, marginTop: 6 }}>
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                </div>
            </div>
        </div>
    );
}

function fmt(n: number | null | undefined, d = 1) {
    return n == null ? "—" : Number(n).toFixed(d);
}

function GradesHistogram({ values }: { values: number[] }) {
    const bins = new Array(20).fill(0);
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        const i = Math.max(0, Math.min(19, Math.floor(v / 5)));
        bins[i]++;
    }
    const max = Math.max(1, ...bins);
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20,1fr)", gap: 2, height: 160, alignItems: "end", marginTop: 12 }}>
            {bins.map((b, i) => (
                <div key={i} style={{ height: `${(b / max) * 100}%`, background: "#c084fc", borderRadius: 2 }} title={`${i*5}-${i*5+4}%: ${b}`} />
            ))}
        </div>
    );
}
