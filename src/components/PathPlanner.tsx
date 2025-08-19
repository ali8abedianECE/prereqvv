import { useMemo, useState } from "react";
import { fetchPlanBase } from "../api";

type Campus = "AUTO" | "V" | "O";
type Mode = "easiest" | "hardest" | "fewest" | "all";

export default function PathPlanner({
                                        baseId,
                                        campus,
                                    }: {
    baseId: string;
    campus: Campus;
}) {
    const [completed, setCompleted] = useState("");
    const [mode, setMode] = useState<Mode>("easiest");
    const [k, setK] = useState(5);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [plans, setPlans] = useState<
        Array<{ cost: number; terms: string[][]; courses: string[] }>
    >([]);
    const [rootActual, setRootActual] = useState<string>("");

    const doneList = useMemo(
        () =>
            completed
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean),
        [completed]
    );

    async function run() {
        setLoading(true);
        setErr(null);
        setPlans([]);
        try {
            const r = await fetchPlanBase({
                base: baseId,
                campus: campus === "AUTO" ? undefined : campus,
                completed: doneList,
                mode,
                k,
            });
            setRootActual(r.root_actual);
            setPlans(r.plans || []);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <h4 style={{ marginTop: 0 }}>Path Planner</h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                    placeholder="Completed base codes (comma-separated)"
                    value={completed}
                    onChange={(e) => setCompleted(e.target.value)}
                    style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                        minWidth: 320,
                    }}
                />
                <label>Mode</label>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                    }}
                >
                    <option value="easiest">Easiest</option>
                    <option value="hardest">Hardest</option>
                    <option value="fewest">Fewest courses</option>
                    <option value="all">Top alternatives</option>
                </select>
                {mode === "all" && (
                    <>
                        <label>Max</label>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={k}
                            onChange={(e) => setK(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
                            style={{
                                width: 64,
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid #2a3240",
                                background: "#141820",
                                color: "#e8edf2",
                            }}
                        />
                    </>
                )}
                <button
                    onClick={run}
                    disabled={loading}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #2a3240",
                        background: "#141820",
                        color: "#e8edf2",
                    }}
                >
                    {loading ? "Planning…" : `Plan path to ${baseId}`}
                </button>
                {err && <span style={{ color: "#ffb4b4" }}>{err}</span>}
            </div>

            {!plans.length && !loading ? (
                <div style={{ color: "#9aa7b1", marginTop: 8 }}>
                    Enter courses you’ve already completed (like <code>MATH 101, PHYS 118</code>) and click
                    <b> Plan</b>.
                </div>
            ) : null}

            {plans.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    {plans.map((p, i) => (
                        <div
                            key={i}
                            style={{
                                background: "#141820",
                                border: "1px solid #1e242e",
                                borderRadius: 10,
                                padding: 10,
                                marginBottom: 10,
                            }}
                        >
                            <div style={{ marginBottom: 6, display: "flex", gap: 12, alignItems: "center" }}>
                                <b>Plan {i + 1}</b>
                                <span style={{ color: "#9aa7b1" }}>
                  Needed: {p.courses.length} course{p.courses.length === 1 ? "" : "s"} · Cost:{" "}
                                    {p.cost.toFixed(1)}
                </span>
                            </div>
                            {p.terms.map((t, ti) => (
                                <div key={ti} style={{ marginBottom: 6 }}>
                                    <div style={{ color: "#9cc1ff" }}>Term {ti + 1}</div>
                                    <div style={{ color: "#e8edf2" }}>{t.join(", ")}</div>
                                </div>
                            ))}
                            <div style={{ color: "#9aa7b1", marginTop: 4 }}>
                                Target scheduled after term {p.terms.length}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
