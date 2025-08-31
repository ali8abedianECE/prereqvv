import React from "react";
import { Card, H, Button, tinyFmt } from "../components/ui";
import Histogram from "../components/Histogram";
import { fetchCourseStats, fetchVizSections } from "../api/viz";
import { toBase } from "../types";
import type { VizCourseStat, VizSection } from "../types";

export default function CourseTab({ courseCode }: { courseCode: string }) {
    const normalized = toBase(courseCode);
    const [subject, course] = normalized.split(" ");
    const [rows, setRows] = React.useState<VizSection[]>([]);
    const [stats, setStats] = React.useState<VizCourseStat[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        let stop = false;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [a, b] = await Promise.all([fetchVizSections(subject, course), fetchCourseStats(normalized)]);
                if (!stop) { setRows(a); setStats(b); }
            } catch (e:any) {
                setErr(e?.message || String(e));
            } finally { if (!stop) setLoading(false); }
        })();
        return () => { stop = true; };
    }, [subject, course]);

    const ratings = rows.filter(r => r.section !== "OVERALL").map(r => r.avg ?? NaN).filter(v => !isNaN(v));

    function exportCSV() {
        const head = ["Year","Sess","Section","Instructor","Enrolled","GradeAvg","RMP_Avg","Diff","WTA%","#Ratings","RMP_Link"];
        const lines = rows.map(r => [
            r.year, r.session, r.section, `"${r.instructor || ""}"`, r.enrolled ?? "",
            r.avg ?? "", r.avg_rating ?? "", r.avg_difficulty ?? "", r.would_take_again_pct ?? "", r.num_ratings ?? "",
            r.rmp_tid ? `https://www.ratemyprofessors.com/professor/${r.rmp_tid}` : ""
        ].join(","));
        const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${normalized}_sections.csv`;
        a.click();
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
            <Card>
                <H right={loading ? <span style={{ color: "#9aa7b1" }}>Loading…</span> : err && <span style={{ color: "#ff8a8a" }}>{err}</span>}>
                    {normalized} — Sections & Instructors (+ RMP)
                </H>
                <div style={{ overflow: "auto", maxHeight: "70vh" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                        <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                            <th style={{ padding: 6 }}>Year</th>
                            <th style={{ padding: 6 }}>Sess</th>
                            <th style={{ padding: 6 }}>Section</th>
                            <th style={{ padding: 6 }}>Instructor</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Enrolled</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Grade Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>RMP Avg</th>
                            <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                            <th style={{ padding: 6, textAlign: "right" }}>WTA %</th>
                            <th style={{ padding: 6, textAlign: "right" }}># Ratings</th>
                            <th style={{ padding: 6 }}>
                                <Button onClick={exportCSV} style={{ padding: "4px 8px" }}>Export CSV</Button>
                            </th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                <td style={{ padding: 6 }}>{r.year}</td>
                                <td style={{ padding: 6 }}>{r.session}</td>
                                <td style={{ padding: 6 }}>{r.section}</td>
                                <td style={{ padding: 6 }}>{r.instructor || "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.enrolled ?? "—"}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg, 2)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg_rating, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.avg_difficulty, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(r.would_take_again_pct, 1)}</td>
                                <td style={{ padding: 6, textAlign: "right" }}>{r.num_ratings ?? "—"}</td>
                                <td style={{ padding: 6 }}>
                                    {r.rmp_tid ? (
                                        <a href={`https://www.ratemyprofessors.com/professor/${r.rmp_tid}`} target="_blank" rel="noreferrer" style={{ color: "#7ab7ff" }}>RMP</a>
                                    ) : "—"}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div style={{ display: "grid", gap: 12 }}>
                <Card>
                    <H>Course-level RMP (per matched prof)</H>
                    <div style={{ overflow: "auto", maxHeight: 280 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                            <tr style={{ textAlign: "left", color: "#9aa7b1" }}>
                                <th style={{ padding: 6 }}>RMP Prof (tid)</th>
                                <th style={{ padding: 6, textAlign: "right" }}>#Ratings</th>
                                <th style={{ padding: 6, textAlign: "right" }}>Diff</th>
                                <th style={{ padding: 6, textAlign: "right" }}>WTA %</th>
                                <th style={{ padding: 6 }}>Link</th>
                            </tr>
                            </thead>
                            <tbody>
                            {stats.map((s, i) => (
                                <tr key={i} style={{ borderTop: "1px solid #1e242e" }}>
                                    <td style={{ padding: 6 }}>{s.tid ?? "—"}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{s.num_ratings ?? "—"}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(s.avg_difficulty, 2)}</td>
                                    <td style={{ padding: 6, textAlign: "right" }}>{tinyFmt(s.would_take_again_pct, 1)}</td>
                                    <td style={{ padding: 6 }}>
                                        {s.tid ? <a href={`https://www.ratemyprofessors.com/professor/${s.tid}`} target="_blank" rel="noreferrer" style={{ color: "#7ab7ff" }}>RMP</a> : "—"}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card>
                    <H>Overall Grade Distribution</H>
                    <Histogram values={ratings} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#9aa7b1", fontSize: 12, marginTop: 6 }}>
                        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                    </div>
                </Card>
            </div>
        </div>
    );
}
