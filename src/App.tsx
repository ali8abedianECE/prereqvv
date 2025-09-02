// src/App.tsx
import React from "react";
import Sidebar from "./components/layout/Sidebar";
import TabBar, { Tab } from "./components/layout/TabBar";
import StartScreen from "./StartScreen";
import "./App.css";

import ProfScatter from "./features/scatter/ProfScatter";
import CourseExplorer from "./features/course/CourseExplorer";
import PathFinder from "./features/path/PathFinder";
import ProfessorExplorer from "./features/prof/ProfessorExplorer";
import Scheduler from "./features/sched/Scheduler"; // NEW

function toBase(id: string) {
    return id.toUpperCase().replace(/\s+/g, " ").trim();
}

const uid = () => Math.random().toString(36).slice(2);

export default function App() {
    const [tabs, setTabs] = React.useState<Tab[]>([]);
    const [activeId, setActiveId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (activeId && tabs.some((t) => t.id === activeId)) return;
        setActiveId(tabs.length ? tabs[0].id : null);
    }, [tabs, activeId]);

    function addTab(tab: Tab) {
        setTabs((prev) => {
            const exists = prev.find((t) => t.id === tab.id);
            const next = exists ? prev : [tab, ...prev];
            setActiveId(tab.id);
            return next;
        });
    }

    function closeTab(id: string) {
        setTabs((prev) => prev.filter((t) => t.id !== id));
        if (activeId === id) setActiveId(null);
    }

    function openPath(defaultBase?: string) {
        addTab({
            id: defaultBase ? `path:${defaultBase}` : `path:new:${uid()}`,
            kind: "path",
            title: "Path Finder",
            payload: { defaultBase },
        });
    }

    function openCourse(courseCode?: string) {
        if (courseCode && courseCode.trim()) {
            const base = toBase(courseCode);
            addTab({ id: `course:${base}`, kind: "course", title: `Course: ${base}`, payload: { courseCode: base } });
        } else {
            addTab({ id: `course:new:${uid()}`, kind: "course", title: "Course Explorer" });
        }
    }

    function openScatter() {
        addTab({ id: `scatter:${uid()}`, kind: "scatter", title: "Professor Scatter" });
    }

    function openProfessorExplorer() {
        addTab({ id: `prof:${uid()}`, kind: "prof", title: "Professor Explorer" });
    }

    function openScheduler() {
        addTab({ id: `sched:${uid()}`, kind: "sched", title: "Scheduler" });
    }

    const activeKind: "start" | "path" | "course" | "scatter" | "prof" | "sched" =
        !activeId ? "start" : ((tabs.find((t) => t.id === activeId)?.kind as any) || "start");

    return (
        <div className="app">
            <Sidebar
                activeKind={activeKind}
                onOpenScatter={openScatter}
                onOpenCourse={openCourse}
                onOpenPathFromCourse={(c) => openPath(c)}
            />

            <main className="main">
                {tabs.length ? (
                    <>
                        <TabBar
                            tabs={tabs}
                            active={activeId}
                            onSelect={(id) => setActiveId(id)}
                            onClose={closeTab}
                            onAddScatter={openScatter}
                            onAddCourse={() => openCourse()}
                            onAddPath={() => openPath()}
                            onAddProf={openProfessorExplorer}
                            onAddSched={openScheduler} // NEW
                        />
                        <div className="workarea">
                            {tabs.map((t) => (
                                <div key={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
                                    {t.kind === "path" && <PathFinder defaultBase={t.payload?.defaultBase} />}
                                    {t.kind === "course" &&
                                        (t.payload?.courseCode ? <CourseExplorer courseCode={t.payload.courseCode} /> : <CourseExplorer />)}
                                    {t.kind === "scatter" && <ProfScatter />}
                                    {t.kind === "prof" && <ProfessorExplorer />}
                                    {t.kind === "sched" && <Scheduler />}{/* NEW */}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <StartScreen
                        onPath={() => openPath()}
                        onCourse={() => openCourse()}
                        onScatter={openScatter}
                        onProf={openProfessorExplorer}
                        onSched={openScheduler} // NEW
                    />
                )}
            </main>
        </div>
    );
}
