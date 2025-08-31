import React from "react";

export default function StartScreen({
                                        onPath,
                                        onCourse,
                                        onScatter,
                                    }: {
    onPath: () => void;
    onCourse: () => void;
    onScatter: () => void;
}) {
    return (
        <div style={{ padding: 24 }}>
            <div className="hero">
                <h2>UBC Tools</h2>
                <p className="muted">Pick a workspace to begin.</p>
            </div>
            <div className="grid-3">
                <div className="card tall">
                    <h3>Path Finder</h3>
                    <p className="muted">Explore prerequisites/co-reqs and plan two terms.</p>
                    <button onClick={onPath}>Open Path Finder</button>
                </div>
                <div className="card tall">
                    <h3>Course Explorer (PRV)</h3>
                    <p className="muted">Sections, instructors, grades, and RMP matches.</p>
                    <button onClick={onCourse}>Open Course Explorer</button>
                </div>
                <div className="card tall">
                    <h3>Professor Scatter</h3>
                    <p className="muted">Difficulty vs rating with live search.</p>
                    <button onClick={onScatter}>Open Scatter Plot</button>
                </div>
            </div>
        </div>
    );
}
