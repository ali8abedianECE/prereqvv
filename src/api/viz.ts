// src/api/viz.ts
import { getJSON2 } from "./http";

export type VizProfessor = {
    legacy_id: string;
    first_name: string;
    last_name: string;
    department?: string | null;
    avg_rating?: number | null;
    avg_difficulty?: number | null;
    num_ratings?: number | null;
    would_take_again_pct?: number | null;
};

export function fetchVizProfessors(opts?: { limit?: number; q?: string; dept?: string }) {
    const p = new URLSearchParams();
    p.set("limit", String(opts?.limit ?? 500));
    if (opts?.q) p.set("q", opts.q);
    if (opts?.dept) p.set("dept", opts.dept);
    return getJSON2<VizProfessor[]>(`/api/viz/professors?` + p.toString());
}

export function fetchVizSections(subject: string, course: string) {
    return getJSON2(`/api/viz/sections?subject=${encodeURIComponent(subject)}&course=${encodeURIComponent(course)}`);
}

export function fetchVizCourseStats(courseCode: string) {
    return getJSON2(`/api/viz/course_stats?course_code=${encodeURIComponent(courseCode)}`);
}
