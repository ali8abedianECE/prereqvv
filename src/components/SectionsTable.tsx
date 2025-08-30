// src/components/SectionsTable.tsx
import { useMemo, useState } from "react";
import { SectionRow, rmpLink } from "../api/viz";

function fmtNum(n: number | null | undefined, d = 2) {
    return n == null ? "—" : Number(n).toFixed(d);
}
function fmtOne(n: number | null | undefined, d = 1) {
    return n == null ? "—" : Number(n).toFixed(d);
}
function fmtPct(n: number | null | undefined) {
    return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}
function isLabOrTut(section: string) {
    // UBC patterns: L1A, L1B, T1A, etc. Keep pure numerics like 101; hide L*/T* by default
    return /^[LT]/i.test(section);
}

type Props = {
    rows: SectionRow[];
    courseCode: string; // e.g. "CPEN 211"
};

export default function SectionsTable({ rows, courseCode }: Props) {
    const [hideOverall, setHideOverall] = useState(true);
    const [hideLabs, setHideLabs] = useState(true);
    const [collapseBySection, setCollapseBySection] = useState(true);

    const filtered = useMemo(() => {
        let out = rows.slice();
        if (hideOverall) out = out.filter(r => r.section !== "OVERALL");
        if (hideLabs) out = out.filter(r => !isLabOrTut(r.section));
        if (collapseBySection) {
            // choose 1 "representative" row per (year, session, section)
            const best: Record<string, SectionRow> = {};
            for (const r of out) {
                const key = `${r.year}-${r.session}-${r.section}`;
                const existing = best[key];
                if (!existing) { best[key] = r; continue; }
                // prefer: has RMP, then higher #ratings, then higher enrolled
                const score = (x: SectionRow) =>
                    (x.rmp_tid ? 1 : 0) * 1_000_000 +
                    (x.num_ratings ?? 0) * 1_000 +
                    (x.enrolled ?? 0);
                if (score(r) > score(existing)) best[key] = r;
            }
            out = Object.values(best).sort((a,b) =>
                (b.year - a.year) ||
                (a.session.localeCompare(b.session)) ||
                (a.section.localeCompare(b.section)) ||
                (a.instructor.localeCompare(b.instructor))
            );
        } else {
            out.sort((a,b) =>
                (b.year - a.year) ||
                (a.session.localeCompare(b.session)) ||
                (a.section.localeCompare(b.section)) ||
                (a.instructor.localeCompare(b.instructor))
            );
        }
        return out;
    }, [rows, hideOverall, hideLabs, collapseBySection]);

    const header = useMemo(() => {
        const m = courseCode.toUpperCase().match(/^([A-Z]{2,5})\s+(\d{3}[A-Z]?)$/);
        return m ? `${m[1]} ${m[2]}` : courseCode.toUpperCase();
    }, [courseCode]);

    return (
        <div style={{ background:"#141820", border:"1px solid #1e242e", borderRadius:12, padding:12 }}>
            <h4 style={{ marginTop:0 }}>Sections &amp; Instructors (+ RMP)</h4>
            <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:8 }}>
                <span style={{ opacity:.8 }}>{header}</span>
                <label style={chip}><input type="checkbox" checked={hideOverall} onChange={e=>setHideOverall(e.target.checked)} /> hide OVERALL</label>
                <label style={chip}><input type="checkbox" checked={hideLabs} onChange={e=>setHideLabs(e.target.checked)} /> hide labs/tutorials</label>
                <label style={chip}><input type="checkbox" checked={collapseBySection} onChange={e=>setCollapseBySection(e.target.checked)} /> collapse duplicates</label>
            </div>

            <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                    <tr>
                        <th style={thSm}>Year</th>
                        <th style={thSm}>Sess</th>
                        <th style={thSm}>Section</th>
                        <th style={th}>Instructor</th>
                        <th style={thNum}>Enrolled</th>
                        <th style={thNum}>Grade Avg</th>
                        <th style={thNum}>RMP Rating</th>
                        <th style={thNum}>Difficulty</th>
                        <th style={thNum}>WTA %</th>
                        <th style={thNum}>#Ratings</th>
                        <th style={thSm}>Link</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filtered.map((r, i) => (
                        <tr key={`${r.year}-${r.session}-${r.section}-${r.instructor}-${i}`}>
                            <td style={tdSm}>{r.year}</td>
                            <td style={tdSm}>{r.session}</td>
                            <td style={tdSmMono}>{r.section}</td>
                            <td style={td}>{r.instructor || "—"}</td>
                            <td style={tdNum}>{r.enrolled ?? "—"}</td>
                            <td style={tdNum}>{fmtNum(r.avg, 2)}</td>
                            <td style={tdNum}>{fmtOne(r.avg_rating, 1)}</td>
                            <td style={tdNum}>{fmtOne(r.avg_difficulty, 1)}</td>
                            <td style={tdNum}>{fmtPct(r.would_take_again_pct)}</td>
                            <td style={tdNum}>{r.num_ratings ?? "—"}</td>
                            <td style={tdLink}>{r.rmp_tid ? <a href={rmpLink(r.rmp_tid)} target="_blank" rel="noreferrer">RMP</a> : "—"}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid #1e242e", fontWeight:600 };
const thSm: React.CSSProperties = { ...th, width:72 };
const thNum: React.CSSProperties = { ...th, textAlign:"right", width:110 };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid #1e242e" };
const tdSm: React.CSSProperties = { ...td, width:72 };
const tdSmMono: React.CSSProperties = { ...td, width:72, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdNum: React.CSSProperties = { ...td, textAlign:"right" };
const tdLink: React.CSSProperties = { ...td, textAlign:"center" };
const chip: React.CSSProperties = {
    display:"inline-flex", gap:8, alignItems:"center",
    padding:"4px 8px", borderRadius:999, border:"1px solid #2a3240", background:"#141820"
};
