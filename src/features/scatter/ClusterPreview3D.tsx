// src/features/scatter/ClusterPreview3D.tsx
import React from "react";
import * as THREE from "three";

export type ClusterItem = {
    id: string;
    label: string;
    rating: number | null;
    difficulty: number | null;
    wta: number | null;
    count: number | null;
    faculty: string | null;
    department: string | null;
};

function colorForRating(avg: number) {
    // 1→red, 3→orange, 5→green like your 2D plot
    const t = Math.max(1, Math.min(5, avg || 0)) - 1; // 0..4
    const g = Math.round(120 + (t / 4) * (255 - 120));
    const r = Math.round(255 - (t / 4) * (255 - 64));
    return new THREE.Color(`rgb(${r},${g},96)`);
}

export default function ClusterPreview3D({
                                             items,
                                             selectedIndex = 0,
                                             onSelect,
                                             height = 220,
                                         }: {
    items: ClusterItem[];
    selectedIndex?: number | null;
    onSelect?: (index: number) => void;
    height?: number;
}) {
    const hostRef = React.useRef<HTMLDivElement>(null);
    const stateRef = React.useRef<{
        renderer?: THREE.WebGLRenderer;
        scene?: THREE.Scene;
        camera?: THREE.PerspectiveCamera;
        raycaster: THREE.Raycaster;
        strand?: THREE.Group;
        spheres: THREE.Mesh[];
        anim?: number;
        pointer: THREE.Vector2;
        dragging: boolean;
        last?: { x: number; y: number };
        resize?: ResizeObserver;
    }>({
        raycaster: new THREE.Raycaster(),
        spheres: [],
        pointer: new THREE.Vector2(-1e3, -1e3),
        dragging: false,
    });

    // init
    React.useEffect(() => {
        const host = hostRef.current!;
        const width = host.clientWidth || 600;
        const heightPx = height;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, heightPx);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, width / heightPx, 0.1, 100);
        camera.position.set(0, 0, 7.5);

        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(2, 2, 3);
        scene.add(dir);

        const strand = new THREE.Group();
        scene.add(strand);

        stateRef.current.renderer = renderer;
        stateRef.current.scene = scene;
        stateRef.current.camera = camera;
        stateRef.current.strand = strand;

        // build spheres (equal size)
        const n = Math.max(1, items.length);
        const half = 3.0; // half length
        const geo = new THREE.SphereGeometry(0.17, 24, 16);
        const spheres: THREE.Mesh[] = [];

        items.forEach((p, i) => {
            const t = n === 1 ? 0.5 : i / (n - 1);
            const x = -half + 2 * half * t;
            const m = new THREE.Mesh(
                geo,
                new THREE.MeshStandardMaterial({ color: colorForRating(p.rating ?? 0) })
            );
            m.position.set(x, 0, 0);
            m.userData.index = i;
            spheres.push(m);
            strand.add(m);
        });

        stateRef.current.spheres = spheres;

        // gentle tilt; no auto-rotation
        strand.rotation.x = -0.35;
        strand.rotation.y = 0.55;

        // resize
        const ro = new ResizeObserver(() => {
            const w = host.clientWidth || width;
            renderer.setSize(w, heightPx);
            camera.aspect = w / heightPx;
            camera.updateProjectionMatrix();
        });
        ro.observe(host);
        stateRef.current.resize = ro;

        // render
        const render = () => {
            stateRef.current.anim = requestAnimationFrame(render);
            renderer.render(scene, camera);
        };
        render();

        // helpers
        const toPointer = (ev: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            stateRef.current.pointer.x =
                ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            stateRef.current.pointer.y =
                -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        };

        // events
        const onDown = (e: MouseEvent) => {
            stateRef.current.dragging = true;
            stateRef.current.last = { x: e.clientX, y: e.clientY };
        };
        const onMove = (e: MouseEvent) => {
            toPointer(e);
            if (!stateRef.current.dragging) return;
            const dx = (e.clientX - (stateRef.current.last?.x ?? e.clientX)) / 180;
            const dy = (e.clientY - (stateRef.current.last?.y ?? e.clientY)) / 180;
            strand.rotation.y += dx;
            strand.rotation.x += dy;
            stateRef.current.last = { x: e.clientX, y: e.clientY };
        };
        const onUp = () => (stateRef.current.dragging = false);

        const onClick = (e: MouseEvent) => {
            toPointer(e);
            stateRef.current.raycaster.setFromCamera(
                stateRef.current.pointer,
                camera
            );
            const hits = stateRef.current.raycaster.intersectObjects(spheres, false);
            if (hits.length && onSelect) {
                onSelect(hits[0].object.userData.index as number);
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.92 : 1.08;
            camera.position.z = THREE.MathUtils.clamp(
                camera.position.z / factor,
                4,
                14
            );
        };

        const el = renderer.domElement;
        el.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        el.addEventListener("click", onClick);
        el.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            cancelAnimationFrame(stateRef.current.anim!);
            el.removeEventListener("mousedown", onDown);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            el.removeEventListener("click", onClick);
            el.removeEventListener("wheel", onWheel);
            stateRef.current.resize?.disconnect();
            spheres.forEach((s) => s.geometry.dispose());
            renderer.dispose();
            host.removeChild(renderer.domElement);
        };
    }, [items, height, onSelect]);

    // update selection highlight (glow & scale)
    React.useEffect(() => {
        const s = stateRef.current;
        if (!s?.spheres?.length) return;
        s.spheres.forEach((m, i) => {
            const sel = selectedIndex != null && i === selectedIndex;
            m.scale.setScalar(sel ? 1.35 : 1.0);
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.emissive.set(sel ? 0x284a7a : 0x000000);
            mat.needsUpdate = true;
        });
    }, [selectedIndex]);

    return (
        <div
            ref={hostRef}
            style={{
                width: "100%",
                height,
                background: "linear-gradient(to bottom,#09121b,#0b1017)",
                borderRadius: 10,
                border: "1px solid #1f2731",
            }}
        />
    );
}
