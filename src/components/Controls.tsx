import { useEffect, useMemo, useState } from "react";
import { Professor } from "../lib/types";

type Props = {
    all: Professor[];
    onChange: (rows: Professor[]) => void;
    onPick: (p: Professor | null) => void;
};

export default function Controls({ all, onChange }: Props) {
    const [q, setQ] = useState("");
    const [department, setDepartment] = useState("All Departments");
    const [courseQ, setCourseQ] = useState("");
    const departments = useMemo(
        () => ["All Departments", ...Array.from(new Set(all.map(p => p.department))).sort()],
        [all]
    );
    const [courseOpts, setCourseOpts] = useState<{courseCode:string, professorIds:string[]}[]>([]);
    useEffect(()=>{ fetch("/api/courses?q=").then(r=>r.json()).then(setCourseOpts); },[]);

    useEffect(() => {
        let rows = all;
        if (q) rows = rows.filter(p => (`${p.firstName} ${p.lastName}`).toLowerCase().includes(q.toLowerCase()));
        if (department !== "All Departments") rows = rows.filter(p => p.department === department);
        if (courseQ) {
            const code = courseQ.replace(/\s+/g,"").toUpperCase();
            const hit = courseOpts.find(c => c.courseCode === code);
            rows = hit ? rows.filter(p => hit.professorIds.includes(p.legacyId)) : [];
        }
        onChange(rows);
    }, [q, department, courseQ, all, courseOpts, onChange]);

    return (
        <div style={{ border:"1px solid #e2e8f0", padding:12, borderRadius:8, position:"sticky", top:12, height:"calc(100vh - 24px)", overflow:"auto" }}>
    <h3 style={{marginTop:0}}>Controls</h3>

    <label>Search professor</label>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. Jane Doe" style={{width:"100%",padding:8,marginBottom:8}}/>

    <label>Search course</label>
    <input value={courseQ} onChange={e=>setCourseQ(e.target.value)} placeholder="e.g. CPSC 110" style={{width:"100%",padding:8,marginBottom:8}}/>

    <label>Department</label>
    <select value={department} onChange={e=>setDepartment(e.target.value)} style={{width:"100%",padding:8}}>
    {departments.map(d=> <option key={d} value={d}>{d}</option>)}
        </select>
        </div>
    );
    }
