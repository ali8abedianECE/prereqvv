// src/components/Mini3DCluster.tsx
import React from "react";
import * as THREE from "three";

export type Mini3DItem = {
    id: string;              // legacy_id or any stable id
    label: string;           // prof name
    color: string;           // hex color from your 2-D color scale
};

export default function Mini3DCluster({
                                          items,
                                          onPick,
                                          width = 360,
                                          height = 200,
                                          lineAngleDeg = 24,       // tilt of the fan-out line
                                      }: {
    items: Mini3DItem[];
    onPick: (id: string) => void;
    width?: number;
    height?: number;
    lineAngleDeg?: number;
}) {
    const mountRef = React.useRef<HTMLDivElement | null>(null);
    const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = React.useRef<THREE.Scene | null>(null);
    const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
    const raycaster = React.useRef(new THREE.Raycaster());
    const mouseNDC = React.useRef(new THREE.Vector2());
    const meshesRef = React.useRef<THREE.Mesh[]>([]);
    const animRef = React.useRef<number | null>(null);
    const lastHoverIdx = React.useRef<number | null>(null);

    React.useEffect(() => {
        const el = mountRef.current!;
        // renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // little fake floor gradient
        scene.background = null;

        // camera
        const cam = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
        cam.position.set(0, 1.4, 6.5);
        cam.lookAt(0, 0.5, 0);
        cameraRef.current = cam;

        // lights (soft, from two sides)
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(3, 4, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.6);
        fill.position.set(-4, 2, 2);
        scene.add(fill);
        scene.add(new THREE.AmbientLight(0xffffff, 0.45));

        // base group (so we can dispose/rebuild cleanly)
        const group = new THREE.Group();
        scene.add(group);

        // ====== BUILD: equal-size spheres along a line ======
        const n = items.length;
        const radius = 0.28;             // same size for all
        const spacing = 0.62;            // equal spacing between sphere centers
        const angle = (lineAngleDeg * Math.PI) / 180;

        // direction of the line in XZ plane
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

        // center the line around origin by offsetting half-length
        const half = (n - 1) * spacing * 0.5;

        // Z-depth trick: a tiny incremental depth so clicks never fight
        const depthStep = 0.015;

        meshesRef.current = [];

        for (let i = 0; i < n; i++) {
            const t = i * spacing - half;

            // base position along the line
            const pos = new THREE.Vector3().copy(dir).multiplyScalar(t);

            // lift a bit in Y for nicer view
            pos.y = 0.0;

            // very small Z-step so items behind are clickable
            pos.z += i * depthStep;

            // material: exact color from 2D, with subtle specular
            const color = new THREE.Color(items[i].color);
            // Slight HSL lighten per index (gives a hint of depth w/o changing size)
            const hsl = { h: 0, s: 0, l: 0 };
            color.getHSL(hsl);
            const adjusted = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.04));
            const mat = new THREE.MeshStandardMaterial({
                color: adjusted,
                roughness: 0.45,
                metalness: 0.05,
            });

            const geo = new THREE.SphereGeometry(radius, 32, 24);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            // store index for hit testing
            (mesh as any).__idx = i;
            group.add(mesh);
            meshesRef.current.push(mesh);
        }

        // gentle idle motion so it feels “3D”
        const clock = new THREE.Clock();
        const animate = () => {
            const t = clock.getElapsedTime();
            group.rotation.y = Math.sin(t * 0.35) * 0.08;
            group.position.y = Math.sin(t * 0.7) * 0.02;
            renderer.render(scene, cam);
            animRef.current = requestAnimationFrame(animate);
        };
        animate();

        // pointer handlers
        const onPointerMove = (ev: PointerEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouseNDC.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            mouseNDC.current.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.current.setFromCamera(mouseNDC.current, cam);
            const hit = raycaster.current.intersectObjects(meshesRef.current, false)[0];

            // unhover old
            if (lastHoverIdx.current != null) {
                const old = meshesRef.current[lastHoverIdx.current];
                if (old) (old.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
                lastHoverIdx.current = null;
            }

            if (hit) {
                const m = hit.object as THREE.Mesh;
                const idx = (m as any).__idx as number;
                lastHoverIdx.current = idx;
                (m.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x222222);
                renderer.render(scene, cam);
            }
        };

        const onClick = () => {
            raycaster.current.setFromCamera(mouseNDC.current, cam);
            const hit = raycaster.current.intersectObjects(meshesRef.current, false)[0];
            if (hit) {
                const idx = (hit.object as any).__idx as number;
                onPick(items[idx].id);
            }
        };

        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("click", onClick);

        // cleanup
        return () => {
            renderer.domElement.removeEventListener("pointermove", onPointerMove);
            renderer.domElement.removeEventListener("click", onClick);

            if (animRef.current) cancelAnimationFrame(animRef.current);

            meshesRef.current.forEach((m) => {
                (m.geometry as THREE.BufferGeometry).dispose();
                (m.material as THREE.Material).dispose();
            });
            meshesRef.current = [];

            scene.remove(group);

            renderer.dispose();
            el.removeChild(renderer.domElement);
            scene.clear();
        };
    }, [items, width, height, lineAngleDeg, onPick]);

    return (
        <div
            ref={mountRef}
            style={{
                width,
                height,
                border: "1px solid #1f2731",
                borderRadius: 10,
                background:
                    "radial-gradient(120% 80% at 50% 100%, rgba(20,30,46,.9) 0%, rgba(10,14,20,.85) 45%, rgba(10,14,20,.0) 100%)",
            }}
        />
    );
}
