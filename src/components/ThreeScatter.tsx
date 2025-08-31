import React from "react";
import * as THREE from "three";
// @ts-ignore – examples path is fine at runtime
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export type ScatterDatum = {
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;           // ~ #ratings (we’ll clamp for drawing)
    faculty?: string | null;
    department?: string | null;
    meta?: Record<string, any>;
};

type Props = {
    data: ScatterDatum[];
    xLabel?: string;
    yLabel?: string;
    onPointClick?: (group: ScatterDatum[], screen?: { x: number; y: number }) => void;
    onHoverChange?: (group: ScatterDatum[] | null, screen?: { x: number; y: number }) => void;

    /** If provided, we render this tooltip at the cursor */
    renderTooltip?: (group: ScatterDatum[], near: { x: number; y: number }) => React.ReactNode;

    /** Show 3D preview panel next to cursor when a cluster is hovered */
    preview3D?: boolean;
    preview3DSize?: { width: number; height: number };

    /** Optional color strategy; default is by Y value (rating high=green, low=red) */
    colorBy?: "y";
};

const PAD = 36;             // inner padding for axes
const HIT_R = 8;            // px radius for hit testing
const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** green→yellow→orange→red (0..1) */
function heatColor01(t: number): string {
    const h = lerp(120, 0, clamp(t, 0, 1)); // 120=green, 0=red
    return `hsl(${h}deg 70% 55%)`;
}

function makeColor(p: ScatterDatum, yMin: number, yMax: number) {
    const t = (p.y - yMin) / Math.max(1e-6, yMax - yMin);
    return heatColor01(1 - t);
}

/** 3D preview of N spheres arranged in gentle arc; no auto-rotate. */
function Preview3D({
                       group,
                       width,
                       height
                   }: {
    group: ScatterDatum[];
    width: number;
    height: number;
}) {
    const mountRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!mountRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0f16);

        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 0.75, 3.2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height);
        mountRef.current.appendChild(renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1.0);
        light.position.set(2, 3, 4);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.42));

        // Arrange equal spacing along an arc, small z offsets
        const N = group.length;
        const baseR = 0.55;
        const arc = Math.min(Math.PI * 0.9, 0.6 + N * 0.1);
        const start = -arc / 2;

        const yVals = group.map((g) => g.y);
        const yMin = Math.min(...yVals), yMax = Math.max(...yVals);

        for (let i = 0; i < N; i++) {
            const t = N === 1 ? 0.5 : i / (N - 1);
            const theta = start + arc * t;

            // sphere size from ratings (#) but clamped for preview
            const size = clamp(Math.sqrt(group[i].size || 1) / 10, 0.05, 0.18);

            const geo = new THREE.SphereGeometry(size, 24, 18);
            const color = makeColor(group[i], yMin, yMax);
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(color),
                metalness: 0.2,
                roughness: 0.5,
            });
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.set(Math.cos(theta) * baseR, Math.sin(theta) * baseR * 0.45, (i - N / 2) * 0.04);
            scene.add(mesh);
        }

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.autoRotate = false; // ← important
        controls.target.set(0, 0, 0);

        let killed = false;
        function loop() {
            if (killed) return;
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        }
        loop();

        function onResize() {
            // keep stable size; parent sets it
            renderer.setPixelRatio(dpr);
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
        window.addEventListener("resize", onResize);

        return () => {
            killed = true;
            window.removeEventListener("resize", onResize);
            renderer.dispose();
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, [group, width, height]);

    return <div ref={mountRef} style={{ width, height }} />;
}

export default function ScatterPlot({
                                        data,
                                        xLabel,
                                        yLabel,
                                        onPointClick,
                                        onHoverChange,
                                        renderTooltip,
                                        preview3D = true,
                                        preview3DSize = { width: 420, height: 260 },
                                        colorBy = "y",
                                    }: Props) {
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    const [hover, setHover] = React.useState<{ group: ScatterDatum[]; screen: { x: number; y: number } } | null>(null);

    // scales
    const xVals = data.map((d) => d.x);
    const yVals = data.map((d) => d.y);
    const xMin = Math.min(...xVals, 0), xMax = Math.max(...xVals, 5.5);
    const yMin = Math.min(...yVals, 0), yMax = Math.max(...yVals, 5.5);

    /** helpers to convert between data and pixels */
    function toPx(width: number, height: number, p: ScatterDatum) {
        const W = width - PAD * 2;
        const H = height - PAD * 2;
        const sx = PAD + ((p.x - xMin) / Math.max(1e-6, xMax - xMin)) * W;
        const sy = PAD + (1 - (p.y - yMin) / Math.max(1e-6, yMax - yMin)) * H;
        return { sx, sy };
    }

    function draw() {
        const cvs = canvasRef.current;
        const wrap = wrapRef.current;
        if (!cvs || !wrap) return;

        const cssW = Math.max(640, wrap.clientWidth);
        const cssH = Math.max(420, Math.round(cssW * 0.62));

        // Size the canvas with DPR
        cvs.style.width = cssW + "px";
        cvs.style.height = cssH + "px";
        cvs.width = Math.round(cssW * dpr);
        cvs.height = Math.round(cssH * dpr);

        const ctx = cvs.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        // Axes
        ctx.strokeStyle = "#223041";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, PAD);
        ctx.lineTo(PAD, cssH - PAD);
        ctx.lineTo(cssW - PAD, cssH - PAD);
        ctx.stroke();

        // Labels
        ctx.fillStyle = "#a7b4c2";
        ctx.font = "12px Inter, system-ui, sans-serif";
        if (yLabel) {
            ctx.save();
            ctx.translate(12, cssH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = "center";
            ctx.fillText(yLabel, 0, 0);
            ctx.restore();
        }
        if (xLabel) {
            ctx.textAlign = "center";
            ctx.fillText(xLabel, cssW / 2, cssH - 10);
        }

        // Points
        for (const p of data) {
            const { sx, sy } = toPx(cssW, cssH, p);
            const r = clamp(Math.sqrt(p.size || 1) * 0.9, 2.2, 8.0);
            const color = colorBy === "y" ? makeColor(p, yMin, yMax) : "#66c";
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.95;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    React.useEffect(draw, [data, xMin, xMax, yMin, yMax, xLabel, yLabel]);

    /** Hit testing & clustering (all points within HIT_R of mouse) */
    function findClusterAt(px: number, py: number): ScatterDatum[] {
        const cvs = canvasRef.current!;
        const cssW = cvs.clientWidth, cssH = cvs.clientHeight;
        const within: ScatterDatum[] = [];
        for (const p of data) {
            const { sx, sy } = toPx(cssW, cssH, p);
            if (Math.hypot(sx - px, sy - py) <= HIT_R) within.push(p);
        }
        return within;
    }

    function handleMove(e: React.MouseEvent) {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const cluster = findClusterAt(px, py);
        if (cluster.length) {
            const next = { group: cluster, screen: { x: e.clientX, y: e.clientY } };
            setHover(next);
            onHoverChange?.(cluster, { x: e.clientX, y: e.clientY });
        } else {
            if (hover) {
                setHover(null);
                onHoverChange?.(null);
            }
        }
    }

    function handleLeave() {
        setHover(null);
        onHoverChange?.(null);
    }

    function handleClick(e: React.MouseEvent) {
        if (!hover) return;
        onPointClick?.(hover.group, { x: e.clientX, y: e.clientY });
    }

    return (
        <div ref={wrapRef} style={{ position: "relative" }}>
            <canvas
                ref={canvasRef}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
                onClick={handleClick}
                style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, background: "#0b1017" }}
            />

            {/* Tooltip + Big 3D preview */}
            {hover && (
                <div
                    style={{
                        position: "fixed",
                        left: hover.screen.x + 16,
                        top: hover.screen.y + 16,
                        zIndex: 50,
                        pointerEvents: "none",
                    }}
                >
                    {/* Info panel */}
                    {renderTooltip && renderTooltip(hover.group, { x: hover.screen.x, y: hover.screen.y })}

                    {/* Spacer */}
                    <div style={{ height: 8 }} />

                    {preview3D && (
                        <div
                            style={{
                                width: preview3DSize.width,
                                height: preview3DSize.height,
                                background: "#0f151e",
                                border: "1px solid #1f2731",
                                borderRadius: 12,
                                padding: 10,
                                pointerEvents: "auto",     // allow interacting with the 3D (drag to orbit)
                                boxShadow: "0 16px 28px rgba(0,0,0,.45)",
                            }}
                        >
                            <div style={{ color: "#d9e4ef", fontSize: 13, marginBottom: 8 }}>
                                {hover.group.length} professor{hover.group.length === 1 ? "" : "s"} at this point
                            </div>
                            <Preview3D
                                group={hover.group}
                                width={preview3DSize.width - 20}
                                height={preview3DSize.height - 44}
                            />
                            <div style={{ color: "#9aa7b1", fontSize: 11, marginTop: 6 }}>
                                drag to orbit • wheel to zoom
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
