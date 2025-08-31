import React from "react";
import { VizProfessor, fetchProfessorsTop } from "../../api/viz";

function useDebounced<T>(value: T, ms = 200) {
    const [v, setV] = React.useState(value);
    React.useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

export default function AsyncSearchBox({
                                           value,
                                           onChange,
                                           onPick,
                                       }: {
    value: string;
    onChange: (v: string) => void;
    onPick: (p: VizProfessor) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [rows, setRows] = React.useState<VizProfessor[]>([]);
    const deb = useDebounced(value, 180);
    const boxRef = React.useRef<HTMLDivElement | null>(null);
    const [hi, setHi] = React.useState(0);

    React.useEffect(() => {
        if (!deb.trim()) {
            setRows([]);
            return;
        }
        setLoading(true);
        fetchProfessorsTop(deb).then(setRows).catch(() => {}).finally(() => setLoading(false));
    }, [deb]);

    React.useEffect(() => {
        function clickAway(e: MouseEvent) {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        }
        window.addEventListener("click", clickAway);
        return () => window.removeEventListener("click", clickAway);
    }, []);

    function pick(i: number) {
        const row = rows[i];
        if (!row) return;
        onPick(row);
        setOpen(false);
    }

    return (
        <div ref={boxRef} style={{ position: "relative", width: 280 }}>
            <input
                placeholder="Search professor name..."
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
                    if (e.key === "ArrowUp")   { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                    if (e.key === "Enter")     { e.preventDefault(); pick(hi); }
                }}
                style={{ width: "100%" }}
            />
            {open && (rows.length || loading) ? (
                <div
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#0f1725",
                        border: "1px solid #1e2a3b",
                        borderRadius: 8,
                        marginTop: 6,
                        zIndex: 10,
                        maxHeight: 320,
                        overflow: "auto",
                    }}
                >
                    {loading && <div className="muted" style={{ padding: 8 }}>Searching…</div>}
                    {rows.map((r, i) => (
                        <div
                            key={r.legacy_id}
                            className="row-hover"
                            onMouseEnter={() => setHi(i)}
                            onClick={() => pick(i)}
                            style={{
                                padding: "8px 10px",
                                background: hi === i ? "#172033" : "transparent",
                                cursor: "pointer",
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: 8,
                            }}
                        >
                            <div style={{ display: "grid", lineHeight: 1.2 }}>
                                <div style={{ fontWeight: 600 }}>
                                    {r.first_name} {r.last_name}
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                    {r.department || "—"} {r.faculty ? `• ${r.faculty}` : ""}
                                </div>
                            </div>
                            <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
                                {r.num_ratings ?? "—"} ratings
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
