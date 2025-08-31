import { Button, Card, H, Input } from "./ui";

export default function Sidebar({
                                    onOpenScatter, onOpenCourse, onOpenPathFromCourse,
                                }: {
    onOpenScatter: () => void;
    onOpenCourse: (courseCode: string) => void;
    onOpenPathFromCourse: (courseCode: string) => void;
}) {
    const [profQ, setProfQ] = React.useState("");
    const [courseQ, setCourseQ] = React.useState("");

    return (
        <div style={{ width: 260, background: "#0e1520", borderRight: "1px solid #1e242e", padding: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/UBC_coa.svg/120px-UBC_coa.svg.png" width={64} height={64} style={{ opacity: .85, margin: "8px auto 4px" }} />
                <div style={{ textAlign: "center", color: "#9aa7b1", fontSize: 12 }}>UBC Course & Professor Explorer</div>
            </div>

            <Card>
                <H>Search Professor</H>
                <Input placeholder="e.g., tor aamodt" value={profQ} onChange={e => setProfQ(e.target.value)} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button onClick={onOpenScatter} style={{ width: "100%" }}>Scatter Plot</Button>
                </div>
            </Card>

            <Card>
                <H>Search Course</H>
                <Input placeholder="e.g., CPEN 211" value={courseQ} onChange={e => setCourseQ(e.target.value)} />
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <Button onClick={() => courseQ && onOpenCourse(courseQ)}>Open Course Data</Button>
                    <Button onClick={() => courseQ && onOpenPathFromCourse(courseQ)} style={{ background: "#182235" }}>Open Path Finder</Button>
                </div>
            </Card>

            <Card>
                <H>Graph Controls</H>
                <div style={{ color: "#9aa7b1", fontSize: 12 }}>Use the controls inside each tab. Zoom & pan on plots with the mouse wheel.</div>
            </Card>

            <div style={{ marginTop: "auto", color: "#617086", fontSize: 11 }}>
                Created by you 🧠 — inspired by the Java Swing tool.
            </div>
        </div>
    );
}

import React from "react";
