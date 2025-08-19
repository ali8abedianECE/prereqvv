import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

type Link = { source: string; target: string; kind?: string; group_id?: string | null };

const RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
const toBase = (id: string) => {
    const m = id.toUpperCase().match(RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
};

export default function GraphView({
                                      nodes,
                                      links,
                                      rootId,
                                      grades,
                                      onNodeClick,
                                  }: {
    nodes: string[];
    links: any[];
    rootId?: string;
    grades?: Record<string, number | null>;
    onNodeClick?: (id: string) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const canonLinks: Link[] = useMemo(() => {
        return (links as any[]).map(l =>
            "source" in l && "target" in l
                ? l
                : { source: (l as any).source_id, target: (l as any).target_id, kind: (l as any).kind, group_id: (l as any).group_id ?? null }
        ).filter(l => l.source && l.target);
    }, [links]);

    const nodeArray = useMemo(() => {
        const s = new Set(nodes);
        for (const l of canonLinks) { s.add(String(l.source)); s.add(String(l.target)); }
        return Array.from(s);
    }, [nodes, canonLinks]);

    const depthMap = useMemo(() => {
        const rev = new Map<string, string[]>();
        for (const e of canonLinks) {
            if (e.kind === "CREDIT" || e.kind === "EXCLUSION") continue;
            const arr = rev.get(e.target) || [];
            arr.push(e.source);
            rev.set(e.target, arr);
        }
        const dist = new Map<string, number>();
        if (rootId) {
            const q: string[] = [rootId];
            dist.set(rootId, 0);
            while (q.length) {
                const u = q.shift()!;
                for (const v of rev.get(u) || []) {
                    if (!dist.has(v)) {
                        dist.set(v, (dist.get(u) || 0) + 1);
                        q.push(v);
                    }
                }
            }
        }
        return dist;
    }, [canonLinks, rootId]);

    useEffect(() => {
        const svg = d3.select(svgRef.current!);
        svg.selectAll("*").remove();
        const width = svgRef.current?.clientWidth || 900;
        const height = svgRef.current?.clientHeight || 560;
        const g = svg.append("g").attr("transform", `translate(${width / 2}, ${height / 2})`);
        const defs = svg.append("defs");
        function addMarker(id: string, color: string) {
            defs.append("marker").attr("id", id).attr("viewBox", "0 -5 10 10").attr("refX", 14).attr("refY", 0).attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto").attr("markerUnits", "userSpaceOnUse").append("path").attr("d", "M0,-5 L10,0 L0,5").attr("fill", color).attr("stroke", "none");
        }
        const COLORS = { nodeFill: "#8fb4ff", nodeRoot: "#ffd166", nodeStroke: "#dbe6f5", req: "#5aa9e6", coreq: "#a78bfa", credit: "#4ade80", excl: "#9aa7b1", text: "#e8edf2", bg: "#0b0d10" } as const;
        addMarker("arrow-req", COLORS.req);
        addMarker("arrow-coreq", COLORS.coreq);
        addMarker("arrow-credit", COLORS.credit);
        addMarker("arrow-excl", COLORS.excl);
        const nodeObjs = nodeArray.map((id) => ({ id }));
        const linkObjs = canonLinks.map((e) => ({ ...e }));
        const forceLink = d3.forceLink(linkObjs as any).id((d: any) => d.id).distance((d: any) => d.kind === "CO_REQ" ? 70 : d.kind === "CREDIT" || d.kind === "EXCLUSION" ? 90 : 60).strength(0.2);
        const simulation = d3.forceSimulation(nodeObjs as any).force("link", forceLink).force("charge", d3.forceManyBody().strength(-220)).force("center", d3.forceCenter(0, 0)).force("collide", d3.forceCollide().radius(18));
        const edgeColor = (k?: string) => k === "CO_REQ" ? COLORS.coreq : k === "CREDIT" ? COLORS.credit : k === "EXCLUSION" ? COLORS.excl : COLORS.req;
        const edgeDash = (k?: string, groupId?: string | null) => k === "EXCLUSION" ? "2,4" : groupId ? "6,4" : null;
        const edgeMarker = (k?: string) => k === "CO_REQ" ? "url(#arrow-coreq)" : k === "CREDIT" ? "url(#arrow-credit)" : k === "EXCLUSION" ? "url(#arrow-excl)" : "url(#arrow-req)";
        const gradeColor = (avg: number) => {
            const t = Math.max(0, Math.min(1, (avg - 60) / 20));
            return d3.interpolateRgbBasis(["#ef4444", "#f59e0b", "#22c55e"])(t);
        };
        const nodeOpacity = (id: string) => {
            if (!depthMap.size) return 0.95;
            const d = depthMap.get(id);
            if (d === undefined) return 0.65;
            return d === 0 ? 1.0 : d === 1 ? 0.9 : d === 2 ? 0.75 : 0.6;
        };
        const link = g.append("g").attr("class", "links").selectAll("line").data(linkObjs).enter().append("line").attr("stroke", (d: any) => edgeColor(d.kind)).attr("stroke-width", 1.5).attr("vector-effect", "non-scaling-stroke").attr("stroke-dasharray", (d: any) => edgeDash(d.kind, d.group_id) ?? null).attr("marker-end", (d: any) => edgeMarker(d.kind));
        const circles = g.append("g").attr("class", "nodes").selectAll("circle").data(nodeObjs).enter().append("circle").attr("r", 8).attr("fill", (d: any) => {
            if (d.id === rootId) return COLORS.nodeRoot;
            const base = toBase(d.id);
            const avg = grades?.[base] ?? null;
            return typeof avg === "number" ? gradeColor(avg) : COLORS.nodeFill;
        }).attr("opacity", (d: any) => nodeOpacity(d.id)).attr("stroke", COLORS.nodeStroke).attr("stroke-width", 1.2).attr("vector-effect", "non-scaling-stroke").style("cursor", onNodeClick ? "pointer" : "default").on("click", (_, d: any) => onNodeClick?.(d.id));
        circles.append("title").text((d: any) => {
            const base = toBase(d.id);
            const avg = grades?.[base];
            return avg != null ? `${d.id}\nAvg: ${avg.toFixed(1)}` : d.id;
        });
        const label = g.append("g").attr("class", "labels").selectAll("text").data(nodeObjs).enter().append("text").attr("font-size", 11).attr("fill", COLORS.text).attr("pointer-events", "none").attr("text-anchor", "middle").attr("dy", -12).text((d: any) => d.id);
        simulation.on("tick", () => {
            link.attr("x1", (d: any) => d.source.x as number).attr("y1", (d: any) => d.source.y as number).attr("x2", (d: any) => d.target.x as number).attr("y2", (d: any) => d.target.y as number);
            circles.attr("cx", (d: any) => d.x as number).attr("cy", (d: any) => d.y as number);
            label.attr("x", (d: any) => d.x as number).attr("y", (d: any) => (d.y as number) - 12);
        });
        const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 8]).on("zoom", (event) => {
            g.attr("transform", event.transform.toString());
        });
        svg.call(zoom as any);
        return () => simulation.stop();
    }, [nodeArray, canonLinks, depthMap, rootId, grades, onNodeClick]);

    return <svg ref={svgRef} style={{ width: "100%", height: "70vh", background: "#0b0d10" }} role="img" aria-label="Course prerequisites graph" />;
}
