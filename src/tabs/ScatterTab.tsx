import React from "react";
import { H, Card, Input, Button, Badge, Select, tinyFmt } from "../components/ui";
import ScatterPlot, { ScatterDatum } from "../components/ScatterPlot";
import { searchProfessors } from "../api/viz";
import type { VizProfessor } from "../types";

type Field = "avg_difficulty" | "avg_rating" | "num_ratings";

// Quick dropdown row for live DB preview
function RowMini({ p }: { p: VizProfessor }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr .6fr .6fr .6fr .6fr", gap: 8, padding: "6px 8px", borderTop: "1px solid #1f2731" }}>
            <div title={`${p.first_name} ${p.last_name}`}>{p.first_name} {p.last_name}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.avg_rating, 1)}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.avg_difficulty, 1)}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.would_take_again_pct, 0)}%</div>
            <div style={{ textAlign: "right" }}>{p.num_ratings ?? "—"}</div>
        </div>
    );
}

export default function ScatterTab() {
    const [data, setData] = React.useState<VizProfessor[]>([]);
    const [q, setQ] = React.useState("");
    const [xField, setXField] = React.useState<Field>("avg_difficulty");
    const [yField, setYField] = React.useState<Field>("avg_rating");
    const [faculty, setFaculty] = React.useState<string>("All Faculties");
    const [dept, setDept] = React.useState<string>("All Departments");
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    // Live preview
    const [preview, setPreview] = React.useState<VizProfessor[]>([]);
    const [showPreview, setShowPreview] = React.useState(false);

    async function run(limit = 5000) {                 // load *all* by default
        setLoading(true); setErr(null);
        try {
            const res = await searchProfessors(q.trim(), limit);
            setData(res);
        } catch (e:any) { setErr(e?.message || String(e)); }
        finally { setLoading(false); }
    }

    React.useEffect(() => { run(5000); }, []);         // initial full load

    // faculty & dept lists from current data
    const faculties = React.useMemo(() => ["All Faculties", ...Array.from(new Set(data.map(d => d.faculty).filter(Boolean) as string[])).sort()], [data]);
    const depts = React.useMemo(() => ["All Departments", ...Array.from(new Set(data.map(d => d.department).filter(Boolean) as string[])).sort()], [data]);

    // Filtered subset for plotting
    const filtered = data.filter(p => {
        if (faculty !== "All Faculties" && p.faculty !== faculty) return false;
        if (dept !== "All Departments" && p.department !== dept) return false;
        return true;
    });

    const points: ScatterDatum[] = React.useMemo(() => {
        return filtered
            .filter(p => (p as any)[xField] != null && (p as any)[yField] != null)
            .map(p => ({
                id: p.legacy_id,
                label: `${p.first_name} ${p.last_name}`,
                x: Number((p as any)[xField]),
                y: Number((p as any)[yField]),
                size: Math.max(1, Number(p.num_ratings ?? 1)),
                faculty: p.faculty ?? null,
                department: p.department ?? null,
            }));
    }, [filtered, xField, yField]);

    // Debounced server preview (shows exactly what DB would return)
    React.useEffect(() => {
        const t = setTimeout(async () => {
            if (!q.trim()) { setPreview([]); return; }
            try {
                const res = await searchProfessors(q.trim(), 12);
                setPreview(res);
            } catch { /* ignore preview errors */ }
        }, 220);
        return () => clearTimeout(t);
    }, [q]);

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Card>
                <H right={
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
                        <div style={{ position: "relative" }}>
                            <Input
                                placeholder="Search professor name…"
                                value={q}
                                onChange={e => { setQ(e.target.value); setShowPreview(true); }}
                                onFocus={() => setShowPreview(true)}
                                onKeyDown={e => { if (e.key === "Enter") { run(5000); setShowPreview(false); } }}
                                style={{ minWidth: 240 }}
                            />
                            {showPreview && preview.length > 0 && (
                                <div
                                    onMouseLeave={() => setShowPreview(false)}
                                    style={{
                                        position: "absolute", top: 40, left: 0, right: 0, zIndex: 10,
                                        background: "#0f151e", border: "1px solid #1f2731", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 24px rgba(0,0,0,.34)"
                                    }}
                                >
                                    <div style={{ display: "grid", gridTemplateColumns: "1.1fr .6fr .6fr .6fr .6fr", gap: 8, padding: "6px 8px", fontSize: 12, color: "#9aa7b1" }}>
                                        <div>Name</div><div style={{ textAlign:"right" }}>Avg</div><div style={{ textAlign:"right" }}>Diff</div><div style={{ textAlign:"right" }}>WTA</div><div style={{ textAlign:"right" }}>#</div>
                                    </div>
                                    {preview.map(p => (
                                        <div key={p.legacy_id} onClick={() => { setQ(`${p.first_name} ${p.last_name}`); setShowPreview(false); run(5000); }}
                                             style={{ cursor: "pointer" }}>
                                            <RowMini p={p} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Button onClick={() => { run(5000); setShowPreview(false); }}>Search</Button>
                        <Button onClick={() => { setQ(""); setShowPreview(false); run(5000); }} style={{ background:"#152032" }}>Reset</Button>
                        <Badge>{points.length} / {data.length} profs</Badge>
                        {loading && <span style={{ color: "#9aa7b1" }}>Loading…</span>}
                        {err && <span style={{ color: "#ff8a8a", whiteSpace:"nowrap", textOverflow:"ellipsis", overflow:"hidden", maxWidth: 360 }}>{err}</span>}
                    </div>
                }>
                    Professor Scatter Plot
                </H>

                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>X:</span>
                        <Select value={xField} onChange={e => (setXField(e.target.value as Field))}>
                            <option value="avg_difficulty">Difficulty</option>
                            <option value="avg_rating">Average Rating</option>
                            <option value="num_ratings"># Ratings</option>
                        </Select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>Y:</span>
                        <Select value={yField} onChange={e => (setYField(e.target.value as Field))}>
                            <option value="avg_rating">Average Rating</option>
                            <option value="avg_difficulty">Difficulty</option>
                            <option value="num_ratings"># Ratings</option>
                        </Select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Select value={faculty} onChange={e => setFaculty(e.target.value)}>
                            {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                        <Select value={dept} onChange={e => setDept(e.target.value)}>
                            {depts.map(d => <option key={d} value={d}>{d}</option>)}
                        </Select>
                    </div>

                    <div style={{ marginLeft: "auto", display:"flex", gap:8 }}>
                        <Button onClick={() => { setFaculty("All Faculties"); setDept("All Departments"); }}>Reset Filters</Button>
                    </div>
                </div>

                <ScatterPlot
                    data={points}
                    xLabel={xField === "avg_difficulty" ? "Difficulty" : xField === "avg_rating" ? "Average Rating" : "# Ratings"}
                    yLabel={yField === "avg_difficulty" ? "Difficulty" : yField === "avg_rating" ? "Average Rating" : "# Ratings"}
                    onPointClick={(group) => {
                        const names = group.map(g => g.label).join(", ");
                        alert(`${names}\n\nRating: ${tinyFmt(group[0].y,1)}  •  Difficulty: ${tinyFmt(group[0].x,1)}  •  #Ratings≈ ${group.reduce((s,d)=>s+d.size,0)}`);
                    }}
                />

                <div style={{ color: "#9aa7b1", fontSize: 12, marginTop: 8 }}>
                    Y = Average Rating • X = Difficulty (or chosen fields) • circle size ≈ #ratings • wheel = zoom • live dropdown shows DB results for current query
                </div>
            </Card>
        </div>
    );
}
