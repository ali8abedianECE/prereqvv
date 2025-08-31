import React from "react";
import Sidebar from "./components/Sidebar";
import TabBar, { Tab } from "./components/layout/TabBar";
import PathFinderTab from "./tabs/PathFinderTab";
import CourseTab from "./tabs/CourseTab";
import ScatterTab from "./tabs/ScatterTab";
import { toBase } from "./types";

export default function AppShell() {
    const [tabs, setTabs] = React.useState<Tab[]>([
        { id: "path", kind: "path", title: "Path Finder" },
    ]);
    const [active, setActive] = React.useState("path");

    function openOrFocus(tab: Tab) {
        setTabs(prev => prev.find(t => t.id === tab.id) ? prev : [...prev, tab]);
        setActive(tab.id);
    }
    function openCourseTab(courseCode: string) {
        const id = `course:${toBase(courseCode)}`;
        openOrFocus({ id, kind: "course", title: `Course: ${toBase(courseCode)}`, payload: { courseCode: toBase(courseCode) } });
    }
    function openScatterTab() {
        openOrFocus({ id: `scatter:${Date.now().toString(36)}`, kind: "scatter", title: "Professor Scatter" });
    }
    function openPathWithCourse(courseCode: string) {
        setTabs(prev => prev.map(t => t.id === "path" ? { ...t, payload: { defaultBase: toBase(courseCode) } } : t));
        setActive("path");
    }
    function closeTab(id: string) {
        setTabs(prev => prev.filter(t => t.id !== id));
        if (active === id) setActive("path");
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh", background: "#0b0d10", color: "#e8edf2" }}>
            <Sidebar
                onOpenScatter={openScatterTab}
                onOpenCourse={openCourseTab}
                onOpenPathFromCourse={openPathWithCourse}
            />
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
                <TabBar tabs={tabs} active={active} onSelect={setActive} onClose={closeTab} onAddScatter={openScatterTab} />
                <div style={{ padding: 12, overflow: "auto" }}>
                    {tabs.map(t => (
                        <div key={t.id} style={{ display: t.id === active ? "block" : "none" }}>
                            {t.kind === "path" && <PathFinderTab key={(t.payload?.defaultBase || "") + "-path"} defaultBase={t.payload?.defaultBase} />}
                            {t.kind === "course" && <CourseTab courseCode={t.payload.courseCode} />}
                            {t.kind === "scatter" && <ScatterTab />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
