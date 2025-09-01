import React from "react";

export type TabKind = "path" | "course" | "scatter" | "prof";

export type Tab = {
    id: string;
    kind: TabKind;
    title: string;
    payload?: any;
};

export default function TabBar({
                                   tabs,
                                   active,
                                   onSelect,
                                   onClose,
                                   onAddScatter,
                                   onAddCourse,
                                   onAddPath,
                                   onAddProf, // NEW
                               }: {
    tabs: Tab[];
    active: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onAddScatter: () => void;
    onAddCourse: () => void;
    onAddPath: () => void;
    onAddProf: () => void; // NEW
}) {
    return (
        <div className="tabbar" role="tablist" aria-label="Open tabs">
            {tabs.map((t) => {
                const isActive = t.id === active;
                return (
                    <div
                        key={t.id}
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={0}
                        title={t.title}
                        className={`tab ${isActive ? "" : "inactive"}`}
                        onClick={() => onSelect(t.id)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") onSelect(t.id);
                            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
                                e.preventDefault();
                                onClose(t.id);
                            }
                        }}
                        style={{ maxWidth: 260 }}
                    >
            <span
                style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
              {t.title}
            </span>
                        <span
                            className="close"
                            role="button"
                            aria-label={`Close ${t.title}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(t.id);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    onClose(t.id);
                                }
                            }}
                        >
              ×
            </span>
                    </div>
                );
            })}

            <div className="spacer" />

            <button className="ghost" onClick={onAddPath}>+ Path Finder</button>
            <button className="ghost" onClick={onAddCourse}>+ Course Explorer</button>
            <button className="ghost" onClick={onAddScatter}>+ Scatter Plot</button>
            {/* NEW quick-add */}
            <button className="ghost" onClick={onAddProf}>+ Professor Explorer</button>
        </div>
    );
}
