// src/pages/ProfScatter.tsx
import React from "react";
import { Card, H, Input, Button, Badge, Select, tinyFmt } from "../../components/ui";
import ScatterPlot, { ScatterDatum } from "../../components/ScatterPlot";
import { searchProfessors } from "../../api/viz";
import type { VizProfessor } from "../../api/viz";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

/* ---------- color helpers ---------- */
function colorFromRating(r: number) {
    const t = Math.max(0, Math.min(1, (r - 1) / 4));
    const h = 25 + 95 * t;
    return `hsl(${h}, 70%, 55%)`;
}
function hslToRgbCss(hsl: string) {
    const m = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/.exec(hsl);
    if (!m) return "#7aa95a";
    const [H, S, L] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const k = (n: number) => (n + H / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to255 = (v: number) => Math.round(255 * v);
    return `rgb(${to255(f(0))},${to255(f(8))},${to255(f(4))})`;
}

/* ---------- 3D Cluster Preview ---------- */
type ClusterItem = { id: string; label: string; xDifficulty: number; yRating: number; numRatings: number; };
type ClusterPreview3DProps = { items: ClusterItem[]; radiusPx: (n: number) => number; };

/** Set camera once (prevents resets) */
function InitCamera({ pos = [0, 0, 14] as [number, number, number], target = [0, 0, 0] as [number, number, number] }) {
    const { camera } = useThree();
    React.useEffect(() => {
        const cam = camera as THREE.PerspectiveCamera;
        cam.position.set(...pos);
        cam.lookAt(...target);
    }, []); // run once
    return null;
}

/** Row of spheres; world radius is frozen at mount so hovering won't change it */
function SpheresRow({ items, radiusPx }: ClusterPreview3DProps) {
    const { camera, size } = useThree();
    const cam = camera as THREE.PerspectiveCamera;

    // compute world-per-pixel ONCE (at mount)
    const initialWpp = (2 * Math.abs(cam.position.z) * Math.tan((cam.fov * Math.PI / 180) / 2)) / size.height;
    const [wpp] = React.useState(initialWpp); // frozen

    const rWorld = radiusPx(1) * wpp;
    const gapWorld = 18 * wpp;

    const totalWidth = items.length * (2 * rWorld) + (items.length - 1) * gapWorld;
    let x = -totalWidth / 2;

    const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

    return (
        <>
            {items.map((it, i) => {
                const cx = x + rWorld; x += 2 * rWorld + gapWorld;
                const color = hslToRgbCss(colorFromRating(it.yRating));

                return (
                    <group key={it.id} position={[cx, 0, 0]}>
                        <mesh
                            onPointerOver={(e) => { e.stopPropagation(); setHoverIdx(i); }}
                            onPointerMove={(e) => { e.stopPropagation(); setHoverIdx(i); }}
                            onPointerOut={(e) => { e.stopPropagation(); setHoverIdx((p) => (p === i ? null : p)); }}
                            scale={[rWorld, rWorld, rWorld]}
                        >
                            <sphereGeometry args={[1, 40, 40]} />
                            <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
                        </mesh>

                        {hoverIdx === i && (
                            <Html position={[0, rWorld + 0.02, 0]} style={{ pointerEvents: "none" }}>
                                <div
                                    style={{
                                        background: "#0f151e",
                                        border: "1px solid #263041",
                                        borderRadius: 10,
                                        padding: 10,
                                        width: 260,
                                        boxShadow: "0 12px 32px rgba(0,0,0,.38)",
                                        color: "#d9e4ef",
                                    }}
                                >
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{it.label}</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
                                        <span>Rating</span><span>{tinyFmt(it.yRating, 1)} / 5</span>
                                        <span>Difficulty</span><span>{tinyFmt(it.xDifficulty, 1)} / 5</span>
                                        <span># Ratings</span><span>{Math.round(it.numRatings)}</span>
                                    </div>
                                </div>
                            </Html>
                        )}
                    </group>
                );
            })}
        </>
    );
}

function PreviewCanvas({ items, radiusPx }: ClusterPreview3DProps) {
    const ctrlRef = React.useRef<any>(null);
    return (
        <div style={{ position: "relative", width: "100%", height: 260 }}>
            <button
                onClick={() => ctrlRef.current?.reset()}
                style={{
                    position: "absolute", right: 8, top: 8, zIndex: 2,
                    padding: "6px 10px", borderRadius: 8, border: "1px solid #324257",
                    background: "#0f151e", color: "#d9e4ef", cursor: "pointer"
                }}
                title="Reset view"
            >
                Reset View
            </button>

            {/* No camera prop — we set it once in InitCamera to avoid resets */}
            <Canvas>
                <InitCamera />
                <ambientLight intensity={0.65} />
                <directionalLight position={[5, 8, 6]} intensity={0.9} />
                <SpheresRow items={items} radiusPx={radiusPx} />
                <OrbitControls
                    ref={ctrlRef}
                    enableZoom
                    enablePan
                    enableRotate
                    enableDamping
                    dampingFactor={0.08}
                    minDistance={0.2}
                    maxDistance={200}
                    zoomSpeed={1.0}
                    panSpeed={0.9}
                    rotateSpeed={0.9}
                />
            </Canvas>
        </div>
    );
}

/* ---------- row mini helper ---------- */
function RowMini({ p }: { p: VizProfessor }) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "1.1fr .6fr .6fr .6fr .6fr",
                gap: 8,
                padding: "6px 8px",
                borderTop: "1px solid #1f2731",
            }}
        >
            <div title={`${p.first_name} ${p.last_name}`}>{p.first_name} {p.last_name}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.avg_rating, 1)}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.avg_difficulty, 1)}</div>
            <div style={{ textAlign: "right" }}>{tinyFmt(p.would_take_again_pct, 0)}%</div>
            <div style={{ textAlign: "right" }}>{p.num_ratings ?? "—"}</div>
        </div>
    );
}

/* ===================================================================== */
type Field = "avg_difficulty" | "avg_rating" | "num_ratings";

export default function ProfScatter() {
    const [data, setData] = React.useState<VizProfessor[]>([]);
    const [q, setQ] = React.useState<string>("");
    const [xField, setXField] = React.useState<Field>("avg_difficulty");
    const [yField, setYField] = React.useState<Field>("avg_rating");
    const [faculty, setFaculty] = React.useState<string>("All Faculties");
    const [dept, setDept] = React.useState<string>("All Departments");
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    const [preview, setPreview] = React.useState<VizProfessor[]>([]);
    const [showPreview, setShowPreview] = React.useState(false);

    // 2D-chosen px radius (for 3D parity)
    const [pxRadius, setPxRadius] = React.useState<number>(8);

    async function run(limit = 5000) {
        setLoading(true);
        setErr(null);
        try {
            const res = await searchProfessors(q.trim(), limit);
            setData(res);
        } catch (e: any) { setErr(e?.message || String(e)); }
        finally { setLoading(false); }
    }
    React.useEffect(() => { run(5000); }, []);

    const faculties = React.useMemo(
        () => ["All Faculties", ...Array.from(new Set(data.map((d) => d.faculty).filter(Boolean) as string[])).sort()],
        [data]
    );
    const depts = React.useMemo(
        () => ["All Departments", ...Array.from(new Set(data.map((d) => d.department).filter(Boolean) as string[])).sort()],
        [data]
    );

    const filtered = data.filter((p) => {
        if (faculty !== "All Faculties" && p.faculty !== faculty) return false;
        if (dept !== "All Departments" && p.department !== dept) return false;
        return true;
    });

    const rawPoints: ScatterDatum[] = React.useMemo(() => {
        return filtered
            .filter((p) => (p as any)[xField] != null && (p as any)[yField] != null)
            .map((p) => ({
                id: p.legacy_id,
                label: `${p.first_name} ${p.last_name}`,
                x: Number((p as any)[xField]),
                y: Number((p as any)[yField]),
                size: Math.max(1, Number(p.num_ratings ?? 1)),
                faculty: p.faculty ?? null,
                department: p.department ?? null,
                meta: { raw: p },
            }));
    }, [filtered, xField, yField]);

    // group by (x,y)
    const xDec = xField === "num_ratings" ? 0 : 1;
    const yDec = yField === "num_ratings" ? 0 : 1;

    const points: ScatterDatum[] = React.useMemo(() => {
        const byKey = new Map<string, ScatterDatum[]>();
        for (const p of rawPoints) {
            const k = `${p.x.toFixed(xDec)}|${p.y.toFixed(yDec)}`;
            const arr = byKey.get(k) ?? [];
            arr.push(p);
            byKey.set(k, arr);
        }
        const dots: ScatterDatum[] = [];
        for (const [k, group] of byKey) {
            const [xs, ys] = k.split("|");
            dots.push({
                id: group.map(g => g.id).join("|"),
                label: group[0].label,
                x: Number(xs),
                y: Number(ys),
                size: 1,
                faculty: null,
                department: null,
                meta: { group },
            });
        }
        return dots;
    }, [rawPoints, xDec, yDec]);

    const [cluster, setCluster] = React.useState<{ group: ScatterDatum[] } | null>(null);

    function renderHoverTooltip(group: ScatterDatum[]) {
        const names = group.slice(0, 6).map(g => g.label);
        const more = Math.max(0, group.length - names.length);
        const avgX = group.reduce((s, g) => s + g.x, 0) / group.length;
        const avgY = group.reduce((s, g) => s + g.y, 0) / group.length;
        const sumSize = group.reduce((s, g) => s + (g.size || 0), 0);

        return (
            <div
                style={{
                    background: "#0f151e",
                    border: "1px solid #263041",
                    borderRadius: 10,
                    padding: 10,
                    width: 280,
                    boxShadow: "0 12px 32px rgba(0,0,0,.38)",
                    pointerEvents: "none",
                    color: "#d9e4ef",
                }}
            >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {names.join(", ")}{more > 0 ? ` +${more}` : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
                    <span>Rating</span><span>{tinyFmt(avgY, 1)} / 5</span>
                    <span>Difficulty</span><span>{tinyFmt(avgX, 1)} / 5</span>
                    <span># Profs</span><span>{group.length}</span>
                    <span># Ratings (sum)</span><span>{Math.round(sumSize)}</span>
                </div>
                <div style={{ marginTop: 6, color: "#7d8aa3", fontSize: 12 }}>click to expand this cluster</div>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Card>
                <H
                    right={
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
                            {/* axis & filter controls */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>X:</span>
                                <Select value={xField} onChange={(e) => setXField(e.target.value as Field)}>
                                    <option value="avg_difficulty">Difficulty</option>
                                    <option value="avg_rating">Average Rating</option>
                                    <option value="num_ratings"># Ratings</option>
                                </Select>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>Y:</span>
                                <Select value={yField} onChange={(e) => setYField(e.target.value as Field)}>
                                    <option value="avg_rating">Average Rating</option>
                                    <option value="avg_difficulty">Difficulty</option>
                                    <option value="num_ratings"># Ratings</option>
                                </Select>
                            </div>
                            <Select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
                                {faculties.map((f) => <option key={f} value={f}>{f}</option>)}
                            </Select>
                            <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                            </Select>

                            {/* search */}
                            <div style={{ position: "relative", marginLeft: 8 }}>
                                <Input
                                    placeholder="Search professor name..."
                                    value={q}
                                    onChange={(e) => { setQ(e.target.value); setShowPreview(true); }}
                                    onFocus={() => setShowPreview(true)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { run(5000); setShowPreview(false); } }}
                                    style={{ minWidth: 240 }}
                                />
                                {showPreview && preview.length > 0 && (
                                    <div
                                        onMouseLeave={() => setShowPreview(false)}
                                        style={{
                                            position: "absolute",
                                            top: 40, left: 0, right: 0, zIndex: 10,
                                            background: "#0f151e", border: "1px solid #1f2731",
                                            borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 24px rgba(0,0,0,.34)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1.1fr .6fr .6fr .6fr .6fr",
                                                gap: 8, padding: "6px 8px", fontSize: 12, color: "#9aa7b1",
                                            }}
                                        >
                                            <div>Name</div><div style={{ textAlign: "right" }}>Avg</div>
                                            <div style={{ textAlign: "right" }}>Diff</div>
                                            <div style={{ textAlign: "right" }}>WTA</div>
                                            <div style={{ textAlign: "right" }}>#</div>
                                        </div>
                                        {preview.map((p) => (
                                            <div
                                                key={p.legacy_id}
                                                onClick={() => { setQ(`${p.first_name} ${p.last_name}`); setShowPreview(false); run(5000); }}
                                                style={{ cursor: "pointer" }}
                                            >
                                                <RowMini p={p} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button onClick={() => { run(5000); setShowPreview(false); }}>Search</Button>
                            <Button onClick={() => { setQ(""); setShowPreview(false); run(5000); }} style={{ background: "#152032" }}>
                                Reset
                            </Button>
                            <Badge>{points.length} dots · {rawPoints.length} profs</Badge>
                            <Button onClick={() => { setFaculty("All Faculties"); setDept("All Departments"); }} style={{ marginLeft: 8 }}>
                                Reset Filters
                            </Button>

                            {loading && <span style={{ color: "#9aa7b1" }}>Loading…</span>}
                            {err && <span style={{ color: "#ff8a8a" }}>{err}</span>}
                        </div>
                    }
                >
                    Scatter Plot
                </H>

                {/* 2D scatter */}
                <div style={{ position: "relative" }}>
                    <ScatterPlot
                        data={points}
                        xLabel={xField === "avg_difficulty" ? "Difficulty" : xField === "avg_rating" ? "Average Rating" : "# Ratings"}
                        yLabel={yField === "avg_difficulty" ? "Difficulty" : yField === "avg_rating" ? "Average Rating" : "# Ratings"}
                        onRadiusPxComputed={(r) => setPxRadius(r)}
                        renderTooltip={(group) => renderHoverTooltip(group)}
                        onPointClick={(group) => setCluster({ group })}
                    />
                </div>

                {/* Expanded 3D preview (no resets; full zoom/pan; Reset) */}
                {cluster && (
                    <div className="card" style={{ marginTop: 12 }}>
                        <div className="card-h" style={{ alignItems: "center" }}>
                            <div style={{ fontWeight: 600 }}>
                                {cluster.group.length} {cluster.group.length === 1 ? "professor" : "professors"} at this point —{" "}
                                {tinyFmt(cluster.group[0].x, 1)} diff · {tinyFmt(cluster.group[0].y, 1)} rating
                            </div>
                            <button className="secondary" style={{ marginLeft: "auto" }} onClick={() => setCluster(null)} title="Close 3D preview">
                                Close
                            </button>
                        </div>

                        <PreviewCanvas
                            items={cluster.group.map((g) => ({
                                id: g.id, label: g.label, xDifficulty: g.x, yRating: g.y, numRatings: g.size,
                            }))}
                            radiusPx={() => pxRadius}
                        />

                        <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(4, .8fr)", gap: 14, padding: "10px 6px" }}>
                            <div style={{ opacity: 0.95 }}>
                                {cluster.group[0].label}
                                <div style={{ color: "#8ea0b7", fontSize: 12 }}>
                                    {(cluster.group[0].meta?.raw as VizProfessor | undefined)?.department ?? "—"}
                                </div>
                            </div>
                            <Metric label="Rating" val={`${tinyFmt(cluster.group[0].y, 1)} / 5`} />
                            <Metric label="Difficulty" val={`${tinyFmt(cluster.group[0].x, 1)} / 5`} />
                            <Metric
                                label="WTA %"
                                val={`${tinyFmt((cluster.group[0].meta?.raw as VizProfessor | undefined)?.would_take_again_pct, 0) ?? "—"}%`}
                            />
                            <Metric label="# Ratings" val={`≈ ${tinyFmt((cluster.group[0].meta?.raw as VizProfessor | undefined)?.num_ratings, 0)}`} />
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}

function Metric({ label, val }: { label: string; val: React.ReactNode }) {
    return (
        <div>
            <div style={{ color: "#8ea0b7", fontSize: 12 }}>{label}</div>
            <div style={{ fontWeight: 600 }}>{val}</div>
        </div>
    );
}
