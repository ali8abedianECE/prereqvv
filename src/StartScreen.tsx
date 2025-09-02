// src/StartScreen.tsx
import React from "react";

function FeatureCard({
                         title,
                         blurb,
                         onClick,
                         cta,
                     }: {
    title: string;
    blurb: string;
    onClick: () => void;
    cta: string;
}) {
    return (
        <div className="card tall">
            <h3>{title}</h3>
            <p className="muted">{blurb}</p>
            <button onClick={onClick}>{cta}</button>
        </div>
    );
}

export default function StartScreen({
                                        onPath,
                                        onCourse,
                                        onScatter,
                                        onProf,
                                        onSched,
                                    }: {
    onPath: () => void;
    onCourse: () => void;
    onScatter: () => void;
    onProf: () => void;
    onSched: () => void;
}) {
    return (
        <div style={{ padding: 24 }}>
            <div className="hero">
                <h2>UBC Tools</h2>
                <p className="muted">Pick a workspace to begin.</p>
            </div>

            <div className="grid-3">
                <FeatureCard
                    title="Path Finder"
                    blurb="Explore prerequisites/co-reqs and plan two terms."
                    onClick={onPath}
                    cta="Open Path Finder"
                />
                <FeatureCard
                    title="Course Explorer (PRV)"
                    blurb="Sections, instructors, grades, and RMP matches."
                    onClick={onCourse}
                    cta="Open Course Explorer"
                />
                <FeatureCard
                    title="Professor Scatter"
                    blurb="Difficulty vs rating with live search."
                    onClick={onScatter}
                    cta="Open Scatter Plot"
                />
                <FeatureCard
                    title="Professor Explorer"
                    blurb="Search a professor; see sections, stats, distributions."
                    onClick={onProf}
                    cta="Open Professor Explorer"
                />
                <FeatureCard
                    title="Scheduler"
                    blurb="Build a conflict-free timetable from real offerings."
                    onClick={onSched}
                    cta="Open Scheduler"
                />
            </div>
        </div>
    );
}
