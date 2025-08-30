import { useEffect, useMemo, useState } from "react";
import { CourseData, Professor } from "../lib/types";
import RatingDistribution from "./RatingDistribution";

export default function ProfessorPanel({ prof }: { prof: Professor | null }) {
    const [rows, setRows] = useState<CourseData[]>([]);
    useEffect(()=>{ if(!prof){setRows([]);return;} fetch(`/api/professors/${prof.legacyId}/sections`).then(r=>r.json()).then(setRows); },[prof]);

    const overallAvg = useMemo(()=>{
        const xs = rows.map(r=>r.avg).filter((n):n is number => typeof n==="number");
        if (!xs.length) return null;
        return xs.reduce((a,b)=>a+b,0)/xs.length;
    },[rows]);

    const dist = useMemo(()=>{
        const acc:Record<string,number> = {};
        for (const r of rows) for (const [k,v] of Object.entries(r.gradeDistribution||{})) acc[k]=(acc[k]||0)+(v||0);
        return acc;
    },[rows]);

    return (
        <div style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:12, height:"calc(100vh - 24px)", overflow:"auto" }}>
            {!prof ? <p style={{color:"#64748b"}}>Click a point to open professor details.</p> :
                <>
                    <h3 style={{marginTop:0}}>{prof.firstName} {prof.lastName}</h3>
                    <div style={{fontSize:13, color:"#334155"}}>
                        <div>Dept: {prof.department}</div>
                        <div>Rating: {prof.avgRating.toFixed(1)} • Diff: {prof.avgDifficulty.toFixed(1)} • WTA: {prof.wouldTakeAgainPercent.toFixed(1)}%</div>
                        <div>Ratings: {prof.numRatings}</div>
                        {prof.rmpUrl && <a href={prof.rmpUrl} target="_blank" rel="noreferrer">RateMyProfessors</a>}
                        {overallAvg!=null && <div>Overall Average: {overallAvg.toFixed(2)}</div>}
                    </div>

                    <h4 style={{marginTop:16}}>Overall Grade Distribution</h4>
                    <RatingDistribution dist={dist} />

                    <h4 style={{marginTop:16}}>Sections</h4>
                    <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                            <thead>
                            <tr>
                                {["Campus","Year","Session","Subject","Course","Section","Professor","Enrolled","Avg","Std Dev","Title"].map(h=>
                                    <th key={h} style={{ textAlign:"left", borderBottom:"1px solid #e2e8f0", padding:"6px 8px" }}>{h}</th>
                                )}
                            </tr>
                            </thead>
                            <tbody>
                            {rows.map((r,i)=>(
                                <tr key={i}>
                                    <td style={td}>{r.campus}</td>
                                    <td style={td}>{r.year}</td>
                                    <td style={td}>{r.session}</td>
                                    <td style={td}>{r.subject}</td>
                                    <td style={td}>{r.course}</td>
                                    <td style={td}>{r.section}</td>
                                    <td style={td}>{r.professorName}</td>
                                    <td style={td}>{r.enrolled}</td>
                                    <td style={td}>{r.avg==null?"N/A":r.avg.toFixed(2)}</td>
                                    <td style={td}>{r.stdDev==null?"N/A":r.stdDev.toFixed(2)}</td>
                                    <td style={td}>{r.title}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </>}
        </div>
    );
}
const td: React.CSSProperties = { padding:"6px 8px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" };
