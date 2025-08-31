// src/App.tsx
import React from "react";
import Sidebar from "./components/layout/Sidebar";
import TabBar, { Tab } from "./components/layout/TabBar";
import StartScreen from "./StartScreen";
import "./App.css";
// keep the same feature components you already have
import ProfScatter from "./features/scatter/ProfScatter";
import CourseExplorer from "./features/course/CourseExplorer";
import PathFinder from "./features/path/PathFinder";

// normalize course codes like "CPEN 211"
function toBase(id: string) {
    return id.toUpperCase().replace(/\s+/g, " ").trim();
}

const uid = () => Math.random().toString(36).slice(2);

export default function App() {
    const [tabs, setTabs] = React.useState<Tab[]>([]); // start empty
    const [activeId, setActiveId] = React.useState<string | null>(null);

    // make activeId follow tab list changes
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
            id: defaultBase ? `path:${defaultBase}` : `path:new:${uid()}`, // <-- unique "new" ids
            kind: "path",
            title: "Path Finder",
            payload: { defaultBase },
        });
    }

    function openCourse(courseCode = "CPEN 211") {
        const base = toBase(courseCode);
        addTab({
            id: `course:${base}`, // stable id per course
            kind: "course",
            title: `Course: ${base}`,
            payload: { courseCode: base },
        });
    }

    function openScatter() {
        addTab({
            id: `scatter:${uid()}`, // unique each time
            kind: "scatter",
            title: "Professor Scatter",
        });
    }

    const activeKind: "start" | "path" | "course" | "scatter" =
        !activeId ? "start" : (tabs.find((t) => t.id === activeId)?.kind || "start");

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
                        />
                        <div className="workarea">
                            {tabs.map((t) => (
                                <div key={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
                                    {t.kind === "path" && <PathFinder defaultBase={t.payload?.defaultBase} />}
                                    {t.kind === "course" && <CourseExplorer courseCode={t.payload.courseCode} />}
                                    {t.kind === "scatter" && <ProfScatter />}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <StartScreen onPath={() => openPath()} onCourse={() => openCourse()} onScatter={openScatter} />
                )}
            </main>
        </div>
    );
}
