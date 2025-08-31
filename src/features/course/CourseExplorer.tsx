import React from "react";
import { VizCourseStat, VizSection, fetchCourseStats, fetchVizSections, toBase } from "../../api/viz";

function tiny(n: number | null | undefined, d = 1) {
    if (n == null) return "—";
    return Number(n).toFixed(d);
}
function Histogram({ values }: { values: number[] }) {
    const bins = new Array(20).fill(0);
    for (const v of values) {
        if (v == null || Number.isNaN(v)) continue;
        bins[Math.min(19, Math.max(0, Math.floor(v / 5)))]++;
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

export default function CourseExplorer({ courseCode }: { courseCode: string }) {
    const normalized = toBase(courseCode);
    const [subject, number] = normalized.split(" ");

    const [rows, setRows] = React.useState<VizSection[]>([]);
    const [stats, setStats] = React.useState<VizCourseStat[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        let stop = false;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [a, b] = await Promise.all([
                    fetchVizSections(subject, number),
                    fetchCourseStats(normalized),
                ]);
                if (!stop) { setRows(a); setStats(b); }
            } catch (e: any) {
                setErr(e?.message || String(e));
            } finally { if (!stop) setLoading(false); }
        })();
        return () => { stop = true; };
    }, [subject, number]);

    const ratings = rows.filter(r => r.section !== "OVERALL").map(r => r.avg ?? NaN).filter(v => !Number.isNaN(v));

    return (
        <div className="grid-2">
            <div className="card">
                <div className="card-h">
                    <h3>{normalized} — Sections & Instructors (+ RMP)</h3>
                    {loading ? <span className="muted">Loading…</span> : err && <span className="error">{err}</span>}
                </div>
                <div className="scroller">
                    <table className="table">
                        <thead>
                        <tr>
                            <th>Year</th><th>Sess</th><th>Section</th><th>Instructor</th>
                            <th className="num">Enrolled</th>
                            <th className="num">Grade Avg</th>
                            <th className="num">RMP Avg</th>
                            <th className="num">Diff</th>
                            <th className="num">WTA %</th>
                            <th className="num"># Ratings</th>
                            <th>Link</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((r,i) => (
                            <tr key={i}>
                                <td>{r.year}</td>
                                <td>{r.session}</td>
                                <td>{r.section}</td>
                                <td>{r.instructor || "—"}</td>
                                <td className="num">{r.enrolled ?? "—"}</td>
                                <td className="num">{tiny(r.avg, 2)}</td>
                                <td className="num">{tiny(r.avg_rating, 1)}</td>
                                <td className="num">{tiny(r.avg_difficulty, 1)}</td>
                                <td className="num">{tiny(r.would_take_again_pct, 1)}</td>
                                <td className="num">{r.num_ratings ?? "—"}</td>
                                <td>{r.rmp_tid ? <a href={`https://www.ratemyprofessors.com/professor/${r.rmp_tid}`} target="_blank">RMP</a> : "—"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card">
                <div className="card-h"><h3>Course-level RMP (per matched prof)</h3></div>
                <div className="scroller" style={{ maxHeight: 280 }}>
                    <table className="table">
                        <thead>
                        <tr>
                            <th>RMP Prof (tid)</th>
                            <th className="num">#Ratings</th>
                            <th className="num">Diff</th>
                            <th className="num">WTA %</th>
                            <th>Link</th>
                        </tr>
                        </thead>
                        <tbody>
                        {stats.map((s, i) => (
                            <tr key={i}>
                                <td>{s.tid ?? "—"}</td>
                                <td className="num">{s.num_ratings ?? "—"}</td>
                                <td className="num">{tiny(s.avg_difficulty, 2)}</td>
                                <td className="num">{tiny(s.would_take_again_pct, 1)}</td>
                                <td>{s.tid ? <a href={`https://www.ratemyprofessors.com/professor/${s.tid}`} target="_blank">RMP</a> : "—"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                    <div className="card-h"><h3>Overall Grade Distribution</h3></div>
                    <Histogram values={ratings} />
                    <div className="muted" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
