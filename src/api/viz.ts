// src/viz.ts
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

async function getJSON<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
}

export type CourseStatRow = {
    course_code: string;
    tid: string | null;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
};

export type SectionRow = {
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

export async function fetchCourseStats(courseCode: string) {
    const url = new URL(`${API_BASE}/api/viz/course-stats`);
    url.searchParams.set("course_code", courseCode.replace(/\s+/g, ""));
    return getJSON<CourseStatRow[]>(url.toString());
}

export async function fetchSections(subject: string, course: string) {
    const url = new URL(`${API_BASE}/api/viz/sections`);
    url.searchParams.set("subject", subject.toUpperCase());
    url.searchParams.set("course", course.toUpperCase());
    return getJSON<SectionRow[]>(url.toString());
}

export const rmpLink = (tid?: string | null) =>
    tid ? `https://www.ratemyprofessors.com/professor/${tid}` : "";
