import React from "react";

type Tree =
    | { type: "course"; id: string }
    | { op: "AND" | "OR" | "MIN"; min?: number; meta?: { kind?: string }; children: Tree[] }
    | { constraint: string };

const RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
const toBase = (id: string) => {
    const m = id.toUpperCase().match(RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
};

function extract(tree: Tree | null | undefined) {
    const allOf = new Set<string>();
    const oneOf: string[][] = [];
    const coReq: string[][] = [];
    function walk(n: Tree, inCoreq: boolean) {
        if ("type" in n && n.type === "course") {
            const b = toBase(n.id);
            if (inCoreq) {
                if (!coReq.length) coReq.push([]);
                coReq[coReq.length - 1].push(b);
            } else {
                allOf.add(b);
            }
            return;
        }
        if ("constraint" in n) return;
        if ("op" in n) {
            const isCoreq = String(n.meta?.kind || "").toUpperCase() === "CO_REQ" || String(n.meta?.kind || "").toUpperCase() === "COREQ";
            if (n.op === "OR" || (n.min && n.min > 0)) {
                const bucket: string[] = [];
                for (const c of n.children || []) {
                    if ("type" in c && c.type === "course") bucket.push(toBase(c.id));
                }
                if (bucket.length) {
                    if (isCoreq) coReq.push(bucket);
                    else oneOf.push(bucket);
                }
                for (const c of n.children || []) if (!("type" in c)) walk(c, isCoreq || inCoreq);
            } else {
                for (const c of n.children || []) walk(c, isCoreq || inCoreq);
            }
        }
    }
    if (tree) walk(tree, false);
    for (const g of oneOf) for (const b of g) allOf.delete(b);
    return { allOf: Array.from(allOf), oneOf, coReq };
}

export default function TreeView({ tree, onToggle, selected }: { tree: any; onToggle?: (b: string) => void; selected?: Set<string> }) {
    const { allOf, oneOf, coReq } = extract(tree);
    return (
        <div>
            <div style={{ marginTop: 8, marginBottom: 6, opacity: 0.9 }}>All-of prereqs</div>
            {allOf.length === 0 ? <div style={{ color: "#9aa7b1" }}>(none)</div> : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {allOf.map(b => (
                        <button key={b} onClick={() => onToggle?.(b)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #2a3240", background: selected?.has(b) ? "#20314a" : "#141820", color: "#e8edf2" }}>{b}</button>
                    ))}
                </div>
            )}
            <div style={{ marginTop: 12, marginBottom: 6, opacity: 0.9 }}>One-of groups</div>
            {oneOf.length === 0 ? <div style={{ color: "#9aa7b1" }}>(none)</div> : (
                <div style={{ display: "grid", gap: 6 }}>
                    {oneOf.map((g, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {g.map(b => (
                                <button key={b} onClick={() => onToggle?.(b)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #2a3240", background: selected?.has(b) ? "#20314a" : "#141820", color: "#e8edf2" }}>{b}</button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <div style={{ marginTop: 12, marginBottom: 6, opacity: 0.9 }}>Co-reqs</div>
            {coReq.length === 0 ? <div style={{ color: "#9aa7b1" }}>(none)</div> : (
                <div style={{ display: "grid", gap: 6 }}>
                    {coReq.map((g, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {g.map(b => (
                                <button key={b} onClick={() => onToggle?.(b)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #2a3240", background: selected?.has(b) ? "#20314a" : "#141820", color: "#e8edf2" }}>{b}</button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
