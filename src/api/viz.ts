// src/api/viz.ts
import { getJSON, postJSON } from "./http";

/** ---- shared types ---- */
export type Campus = "AUTO" | "V" | "O";

export type VizProfessor = {
    id?: string;
    legacy_id: string;
    first_name: string;
    last_name: string;
    department?: string | null;
    faculty?: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

export type VizSection = {
    campus: string | null;
    subject: string;
    course: string;
    section: string;
    year: number;
    session: string;
    title: string;
    instructor: string;
    enrolled: number | null;
    avg: number | null;
    rmp_tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

export type VizCourseStat = {
    course_code: string;
    tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

/** ---- helpers ---- */
export const RE_BASE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;
export function toBase(id: string) {
    const m = id.toUpperCase().match(RE_BASE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
}

/** ===================== Professors ===================== **/

// Normalize any value into a usable search string
function normalizeQuery(q: unknown): string {
    if (q == null) return "";
    if (typeof q === "string") return q;
    if (Array.isArray(q)) return q.filter(Boolean).map(String).join(" ");
    if (typeof q === "object") {
        const o = q as Record<string, unknown>;
        if (typeof o.text === "string") return o.text;
        if (typeof o.label === "string") return o.label;
        if (typeof o.name === "string") return o.name;
        if (Array.isArray((o as any).tokens)) {
            return (o as any).tokens.filter(Boolean).map(String).join(" ");
        }
        return Object.values(o)
            .filter((v) => typeof v === "string")
            .map(String)
            .join(" ");
    }
    return String(q);
}

// Core search (compatible with old call sites)
export async function fetchProfessors(q: unknown = "", limit = 2000) {
    const qs = new URLSearchParams();
    const s = normalizeQuery(q).trim();
    if (s) qs.set("q", s);
    if (limit) qs.set("limit", String(limit));
    return getJSON<VizProfessor[]>(`/api/viz/professors?${qs.toString()}`);
}

// Small “top N” helper (kept for compatibility)
export function fetchProfessorsTop(q: unknown, limit = 12) {
    return fetchProfessors(q, limit);
}

/** Aliases expected by other parts of the app (do not remove) */
export { fetchProfessors as searchProfessors };       // used by Scatter
export { fetchProfessorsTop as suggestProfessors };   // live dropdowns

// Single professor (drawer/header) – /api/viz/professor?tid=...
export async function fetchProfessor(tid: string) {
    return getJSON<VizProfessor | null>(`/api/viz/professor?tid=${encodeURIComponent(tid)}`);
}

// All sections taught by a professor – /api/viz/sections_by_prof?tid=...
export async function fetchSectionsByProf(tid: string) {
    return getJSON<VizSection[]>(`/api/viz/sections_by_prof?tid=${encodeURIComponent(tid)}`);
}

// Legacy alias used in some files
export { fetchSectionsByProf as fetchSectionsByProfessor };

/** ===================== Course/Sections (PRV) ===================== **/

export function fetchVizSections(subject: string, course: string) {
    return getJSON<VizSection[]>(
        `/api/viz/sections?subject=${encodeURIComponent(subject)}&course=${encodeURIComponent(course)}`
    );
}

export function fetchCourseStats(courseCode: string) {
    const normalized = courseCode.replace(/\s+/g, "").toUpperCase();
    return getJSON<VizCourseStat[]>(
        `/api/viz/course_stats?course_code=${encodeURIComponent(normalized)}`
    );
}

/** ===================== Prereq / Graph side ===================== **/

export function searchBases(term: string) {
    const qs = encodeURIComponent(term);
    return getJSON<string[]>(`/api/search_base?q=${qs}`);
}

export function fetchCourseBase(baseId: string, campus: Campus) {
    return getJSON<any>(`/api/course_base/${encodeURIComponent(baseId)}?campus=${campus}`);
}

export function fetchGraphBase(baseId: string, depth: number, includeCoreq: boolean, campus: Campus) {
    const u = `/api/graph_base/${encodeURIComponent(baseId)}?depth=${depth}&includeCoreq=${includeCoreq}&campus=${campus}`;
    return getJSON<any>(u);
}

export function fetchGradeAverage(baseId: string, campus: Campus) {
    return getJSON<{ base: string; average: number | null }>(
        `/api/grades_base/${encodeURIComponent(baseId)}?campus=${campus}`
    );
}

export function planTwoTerms(baseId: string, campus: Campus, completed: string[]) {
    return postJSON<{ ok: true; plan: { term1: string[]; term2: string[] } }>(
        `/api/plan_base/${encodeURIComponent(baseId)}?campus=${campus}`,
        { completed }
    );
}

/** ===================== Professor Explorer (PX) ===================== **/

// Distinct types (PX-prefixed) so they won’t collide with existing ones.
export type PXProfOverview = {
    prof: VizProfessor | null;
    sections: VizSection[];
    perCourse: PXProfPerCourse[];
    bins: Array<PXBin>;
    hist: Array<PXHistBin>;
};

export type PXProfPerCourse = {
    course_code: string;
    n_sections: number;
    avg_of_avg: number | null;
    total_enrolled: number | null;
    first_year: number | null;
    last_year: number | null;
};

export type PXBin = { bin_label: string; count: number };
export type PXHistBin = { x0: number; x1: number; c: number };

/**
 * New overview fetcher for the PX page.
 * Uses /api/viz/professor_overview and keeps a unique name.
 */
export async function fetchProfessorOverviewPX(tid: string, bins = 24) {
    const u = new URL("/api/viz/professor_overview", location.origin);
    u.searchParams.set("tid", tid);
    u.searchParams.set("bins", String(Math.min(60, Math.max(8, bins))));
    return getJSON<PXProfOverview>(u.pathname + "?" + u.searchParams.toString());
}

/**
 * Optional: distinct alias for searching professors if you
 * want to route PX code paths through a different name.
 */
export async function searchProfessorsPX(q: unknown = "", limit = 50) {
    const s = (function normalizeQuery(qv: unknown): string {
        if (qv == null) return "";
        if (typeof qv === "string") return qv;
        if (Array.isArray(qv)) return qv.filter(Boolean).map(String).join(" ");
        if (typeof qv === "object") {
            const o = qv as Record<string, unknown>;
            if (typeof o.text === "string") return o.text;
            if (typeof o.label === "string") return o.label;
            if (typeof o.name === "string") return o.name;
            if (Array.isArray((o as any).tokens)) return (o as any).tokens.filter(Boolean).map(String).join(" ");
            return Object.values(o).filter((v) => typeof v === "string").map(String).join(" ");
        }
        return String(qv);
    })(q).trim();

    const qs = new URLSearchParams();
    if (s) qs.set("q", s);
    if (limit) qs.set("limit", String(limit));
    return getJSON<VizProfessor[]>(`/api/viz/professors?${qs.toString()}`);
}
