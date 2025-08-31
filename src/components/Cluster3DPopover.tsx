// src/components/Cluster3DPopover.tsx
import React, { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";

export type ClusterPoint = {
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
    faculty?: string | null;
    department?: string | null;
};

function colorFromRating(y: number) {
    // 1..5 -> red->green
    const t = Math.max(0, Math.min(1, (y - 1) / 4));
    const r = Math.round(66 + (230 - 66) * (1 - t));
    const g = Math.round(214 * t + 56 * (1 - t));
    const b = Math.round(77 * (1 - t) + 60 * t);
    return new THREE.Color(`rgb(${r},${g},${b})`);
}

function layoutSpiral3D(n: number) {
    // nice spread in 3D using golden angle spiral
    const out: [number, number, number][] = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
    const R = 1 + Math.log2(n + 1) * 0.4;
    for (let i = 0; i < n; i++) {
        const y = (i / Math.max(1, n - 1) - 0.5) * 1.8; // small vertical spread
        const r = R * Math.sqrt(i / Math.max(1, n - 1));
        const th = i * phi;
        const x = Math.cos(th) * r;
        const z = Math.sin(th) * r;
        out.push([x, y, z]);
    }
    return out;
}

export default function Cluster3DPopover({
                                             points,
                                             anchor,
                                             onClose,
                                             onPick,
                                         }: {
    points: ClusterPoint[];
    anchor: { x: number; y: number };
    onClose: () => void;
    onPick?: (p: ClusterPoint) => void;
}) {
    const positions = useMemo(() => layoutSpiral3D(points.length), [points.length]);
    const [hover, setHover] = useState<number | null>(null);

    return (
        <div
            style={{
                position: "fixed",
                left: Math.max(12, anchor.x + 12),
                top: Math.max(12, anchor.y + 12),
                width: 360,
                height: 260,
                zIndex: 50,
                background: "rgba(11,15,22,.96)",
                border: "1px solid #1f2731",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 16px 32px rgba(0,0,0,.35)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #1f2731" }}>
                <div style={{ fontWeight: 600, color: "#d4dbe6" }}>
                    {points.length} professor{points.length === 1 ? "" : "s"} at this point
                </div>
                <button
                    onClick={onClose}
                    style={{
                        marginLeft: "auto",
                        background: "transparent",
                        color: "#9aa7b1",
                        border: "none",
                        fontSize: 16,
                        cursor: "pointer",
                    }}
                    title="Close"
                >
                    ×
                </button>
            </div>

            <div style={{ position: "relative", height: "100%" }}>
                <Canvas camera={{ position: [0, 1.6, 3.6], fov: 55 }}>
                    <color attach="background" args={["#0b0f16"]} />
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[2, 3, 2]} intensity={0.6} />
                    <Grid args={[10, 10]} cellSize={0.5} sectionColor="#1a2431" cellColor="#121a24" infiniteGrid />
                    {points.map((p, i) => {
                        const [x, y, z] = positions[i];
                        const col = colorFromRating(p.y ?? 3);
                        const s = Math.max(0.12, Math.log2(p.size + 1) * 0.12);
                        return (
                            <mesh
                                key={p.id}
                                position={[x, y, z]}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPick?.(p);
                                }}
                                onPointerOver={() => setHover(i)}
                                onPointerOut={() => setHover(null)}
                            >
                                <sphereGeometry args={[s, 16, 16]} />
                                <meshStandardMaterial color={col} />
                                {hover === i && (
                                    <Html distanceFactor={8} position={[0, s + 0.08, 0]}>
                                        <div
                                            style={{
                                                background: "rgba(15,21,30,.95)",
                                                border: "1px solid #223041",
                                                padding: "6px 8px",
                                                borderRadius: 8,
                                                color: "#d2d9e3",
                                                fontSize: 12,
                                            }}
                                        >
                                            {p.label}
                                            <div style={{ opacity: 0.8, marginTop: 2 }}>
                                                Rating {p.y?.toFixed(1)} • Diff {p.x?.toFixed(1)} • #≈{p.size}
                                            </div>
                                        </div>
                                    </Html>
                                )}
                            </mesh>
                        );
                    })}
                    <OrbitControls enablePan enableZoom enableRotate />
                </Canvas>
            </div>
        </div>
    );
}
