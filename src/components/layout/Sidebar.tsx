import React from "react";
import { toBase } from "../../api/viz";

export default function Sidebar({
                                    activeKind,
                                    onOpenScatter,
                                    onOpenCourse,
                                    onOpenPathFromCourse,
                                }: {
    activeKind: "start" | "path" | "course" | "scatter";
    onOpenScatter: () => void;
    onOpenCourse: (courseCode: string) => void;
    onOpenPathFromCourse: (courseCode: string) => void;
}) {
    const [profQ, setProfQ] = React.useState("");
    const [courseQ, setCourseQ] = React.useState("");

    return (
        <aside
            style={{
        width: 260,
            background: "#0e1520",
            borderRight: "1px solid #1e242e",
            padding: 12,
            display: "grid",
            gap: 12,
    }}
>
    <div style={{ display: "grid", gap: 8 }}>
    <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/UBC_coa.svg/120px-UBC_coa.svg.png"
    width={64}
    height={64}
    style={{ opacity: 0.85, margin: "8px auto 4px" }}
    />
    <div style={{ textAlign: "center", color: "#9aa7b1", fontSize: 12 }}>
    UBC Course & Professor Explorer
    </div>
    </div>

    {/* Hide PRV/Scatter quick actions if we’re on Path Finder */}
    {activeKind !== "path" && (
        <div className="card">
            <h4>Search Professor</h4>
    <input
        placeholder="e.g., tor aamodt"
        value={profQ}
        onChange={(e) => setProfQ(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={onOpenScatter} style={{ width: "100%" }}>
        Scatter Plot
    </button>
    </div>
    </div>
    )}

    {activeKind !== "path" && (
        <div className="card">
            <h4>Search Course</h4>
    <input
        placeholder="e.g., CPEN 211"
        value={courseQ}
        onChange={(e) => setCourseQ(e.target.value)}
        />
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <button onClick={() => courseQ && onOpenCourse(toBase(courseQ))}>
        Open Course Data
    </button>
    <button
        onClick={() => courseQ && onOpenPathFromCourse(toBase(courseQ))}
        className="secondary"
            >
            Open Path Finder
    </button>
    </div>
    </div>
    )}

    <div className="card">
        <h4>Graph Controls</h4>
    <div className="muted">
        Use the controls inside each tab. Zoom & pan on plots with the mouse
    wheel.
    </div>
    </div>

    <div style={{ marginTop: "auto", color: "#617086", fontSize: 11 }}>
    Created by Ali Abedian, Andy Lu, Nick Liu and christina.
    </div>
    </aside>
);
}
