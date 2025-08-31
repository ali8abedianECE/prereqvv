// src/components/ScatterPlot.tsx
import React from "react";
import * as THREE from "three";
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export type ScatterDatum = {
    id: string;
    label: string;
    x: number;
    y: number;
    size: number;
    faculty?: string | null;
    department?: string | null;
    meta?: Record<string, any>; // meta.group is the list of profs at this dot
};

type Props = {
    data: ScatterDatum[];         // one item per dot; meta.group may hold >1 prof
    xLabel?: string;
    yLabel?: string;
    colorBy?: "y";
    radiusScale?: (n: number) => number;       // optional preferred radius
    onRadiusPxComputed?: (r: number) => void;  // actual radius used (for 3D parity)

    onPointClick?: (group: ScatterDatum[], screen?: { x: number; y: number }) => void;
    onHoverChange?: (group: ScatterDatum[] | null, screen?: { x: number; y: number }) => void;
    renderTooltip?: (group: ScatterDatum[], near: { x: number; y: number }) => React.ReactNode;

    preview3D?: boolean;                       // keep this false; page shows its own 3D
    preview3DSize?: { width: number; height: number };
};

const PAD = 36;
const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function heatColor01(t01: number): string {
    const h = lerp(120, 0, Math.max(0, Math.min(1, t01))); // green->red
    return `hsl(${h}deg 70% 55%)`;
}
function colorFromY(y: number, yMin: number, yMax: number) {
    const t = 1 - (y - yMin) / Math.max(1e-6, yMax - yMin);
    return heatColor01(t);
}

/* --- small internal hover preview (unused by the page, left intact) --- */
function Preview3D({
                       group, width, height, interactive, radiusPx
                   }: {
    group: ScatterDatum[];
    width: number; height: number;
    interactive: boolean;
    radiusPx?: (n: number) => number;
}) {
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!ref.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0f16);

        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 0.8, 3.2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height);
        ref.current.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.42));
        const dir = new THREE.DirectionalLight(0xffffff, 1.1);
        dir.position.set(2, 3, 4);
        scene.add(dir);

        const N = group.length;
        const arc = Math.min(Math.PI * 0.9, 0.6 + N * 0.1);
        const start = -arc / 2;
        const yMin = Math.min(...group.map(g => g.y));
        const yMax = Math.max(...group.map(g => g.y));

        // compute world-per-pixel ONCE (at mount)
        const worldPerPixel =
            (2 * camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2)) /
            (renderer.domElement.clientHeight || height);

        for (let i = 0; i < N; i++) {
            const t = N === 1 ? 0.5 : i / (N - 1);
            const theta = start + arc * t;
            const pxRadius = radiusPx ? radiusPx(group[i].size || 1) : 6;
            const worldRadius = pxRadius * worldPerPixel;

            const geo = new THREE.SphereGeometry(worldRadius, 24, 20);
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorFromY(group[i].y, yMin, yMax)),
                metalness: 0.2, roughness: 0.5
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.set(Math.cos(theta) * 0.55, Math.sin(theta) * 0.55 * 0.45, (i - N / 2) * 0.04);
            scene.add(m);
        }

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.autoRotate = false;
        controls.enabled = interactive;

        let kill = false;
        (function loop() {
            if (kill) return;
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        })();

        function onResize() {
            renderer.setPixelRatio(dpr);
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
        window.addEventListener("resize", onResize);

        return () => {
            kill = true;
            window.removeEventListener("resize", onResize);
            renderer.dispose();
            ref.current?.removeChild(renderer.domElement);
        };
    }, [group, width, height, interactive, radiusPx]);

    return <div ref={ref} style={{ width, height }} />;
}

/* -------------------------------- Main 2D canvas -------------------------------- */
export default function ScatterPlot({
                                        data, xLabel, yLabel, colorBy = "y",
                                        radiusScale, onRadiusPxComputed,
                                        onPointClick, onHoverChange, renderTooltip,
                                        preview3D = false, preview3DSize = { width: 460, height: 280 }
                                    }: Props) {
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    type SPoint = { sx: number; sy: number; r: number; color: string; d: ScatterDatum };
    const screenPtsRef = React.useRef<SPoint[]>([]);

    const [hover, setHover] = React.useState<{ group: ScatterDatum[]; screen: { x: number; y: number } } | null>(null);

    const xMin = Math.min(...data.map(d => d.x));
    const xMax = Math.max(...data.map(d => d.x));
    const yMin = Math.min(...data.map(d => d.y));
    const yMax = Math.max(...data.map(d => d.y));

    function computeNoOverlapRadiusPx(W: number, H: number) {
        const NO_OVERLAP_GAP_PX = 1;
        const xs = Array.from(new Set(data.map(d => d.x))).sort((a, b) => a - b);
        const ys = Array.from(new Set(data.map(d => d.y))).sort((a, b) => a - b);

        const rx = Math.max(1e-6, xMax - xMin);
        const ry = Math.max(1e-6, yMax - yMin);

        const minDx = xs.length > 1 ? xs.slice(1).reduce((m, v, i) => Math.min(m, v - xs[i]), Infinity) : Infinity;
        const minDy = ys.length > 1 ? ys.slice(1).reduce((m, v, i) => Math.min(m, v - ys[i]), Infinity) : Infinity;

        let r = 6;
        for (let k = 0; k < 3; k++) {
            const plotW = Math.max(1, W - 2 * (PAD + r));
            const plotH = Math.max(1, H - 2 * (PAD + r));
            const dxPx = minDx === Infinity ? plotW : (minDx / rx) * plotW;
            const dyPx = minDy === Infinity ? plotH : (minDy / ry) * plotH;
            const cap = 0.5 * Math.min(dxPx, dyPx);
            r = Math.max(2, Math.floor(cap - NO_OVERLAP_GAP_PX));
            if (radiusScale) r = Math.min(r, Math.floor(radiusScale(1)));
        }
        return r;
    }

    function computeScreen(layoutW: number, layoutH: number) {
        const r = computeNoOverlapRadiusPx(layoutW, layoutH);
        onRadiusPxComputed?.(r);

        const W = layoutW - PAD * 2;
        const H = layoutH - PAD * 2;
        const plotW = Math.max(1, W - 2 * r);
        const plotH = Math.max(1, H - 2 * r);

        const rx = Math.max(1e-6, xMax - xMin);
        const ry = Math.max(1e-6, yMax - yMin);

        const arr: SPoint[] = [];
        for (const d of data) {
            const tx = (d.x - xMin) / rx;
            const ty = (d.y - yMin) / ry;
            const sx = PAD + r + tx * plotW;
            const sy = PAD + (plotH - ty * plotH) + r;
            const color = colorBy === "y" ? colorFromY(d.y, yMin, yMax) : "#66c";
            arr.push({ sx, sy, r, color, d });
        }
        screenPtsRef.current = arr;
    }

    function redraw() {
        const cvs = canvasRef.current, wrap = wrapRef.current;
        if (!cvs || !wrap) return;

        const cssW = Math.max(640, wrap.clientWidth);
        const cssH = Math.max(420, Math.round(cssW * 0.62));

        cvs.style.width = cssW + "px";
        cvs.style.height = cssH + "px";
        cvs.width = Math.round(cssW * dpr);
        cvs.height = Math.round(cssH * dpr);

        computeScreen(cssW, cssH);

        const ctx = cvs.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.strokeStyle = "#223041";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, PAD);
        ctx.lineTo(PAD, cssH - PAD);
        ctx.lineTo(cssW - PAD, cssH - PAD);
        ctx.stroke();

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

        for (const p of screenPtsRef.current) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.95;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    React.useEffect(redraw, [data, xLabel, yLabel, colorBy, radiusScale]);

    function expandGroup(d: ScatterDatum): ScatterDatum[] {
        return Array.isArray(d.meta?.group) ? (d.meta!.group as ScatterDatum[]) : [d];
    }

    function pickGroup(px: number, py: number) {
        let pick: SPoint | null = null;
        let minD = Infinity;
        for (let i = screenPtsRef.current.length - 1; i >= 0; i--) {
            const p = screenPtsRef.current[i];
            const d = Math.hypot(p.sx - px, p.sy - py);
            if (d <= p.r + 6 && d < minD) { minD = d; pick = p; }
        }
        if (!pick) return [] as ScatterDatum[];
        return expandGroup(pick.d);
    }

    function onMove(e: React.MouseEvent) {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const cluster = pickGroup(e.clientX - rect.left, e.clientY - rect.top);
        if (cluster.length) {
            const next = { group: cluster, screen: { x: e.clientX, y: e.clientY } };
            setHover(next);
            onHoverChange?.(cluster, next.screen);
        } else if (hover) {
            setHover(null);
            onHoverChange?.(null);
        }
    }

    function onClick(e: React.MouseEvent) {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const cluster = pickGroup(e.clientX - rect.left, e.clientY - rect.top);
        if (!cluster.length) return;
        onPointClick?.(cluster, { x: e.clientX, y: e.clientY });
    }

    return (
        <div ref={wrapRef} style={{ position: "relative" }}>
            <canvas
                ref={canvasRef}
                onMouseMove={onMove}
                onMouseLeave={() => { setHover(null); onHoverChange?.(null); }}
                onClick={onClick}
                style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, background: "#0b1017" }}
            />

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
                    {renderTooltip && renderTooltip(hover.group, hover.screen)}
                    {preview3D && (
                        <div
                            style={{
                                width: preview3DSize.width,
                                height: preview3DSize.height,
                                background: "#0f151e",
                                border: "1px solid #1f2731",
                                borderRadius: 12,
                                padding: 10,
                                marginTop: 8,
                                boxShadow: "0 16px 28px rgba(0,0,0,.45)",
                            }}
                        >
                            <Preview3D
                                group={hover.group}
                                width={preview3DSize.width - 20}
                                height={preview3DSize.height - 44}
                                interactive={false}
                                radiusPx={radiusScale}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
