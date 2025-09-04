// src/api/sched.ts
// Minimal client for your /api/sched endpoints

export type Term = {
    id: string;
    title: string;
    campus: string | null;
    start_date: string | null;
    end_date: string | null;
};

export type Meeting = {
    id: number;
    offering_id: number;
    days_mask: number; // M=1,T=2,W=4,R=8,F=16,S=32,U=64
    start_min: number; // minutes since 00:00
    end_min: number;
    start_date: string | null;
    end_date: string | null;
    location_text: string | null;
    building: string | null;
    room: string | null;
};

export type Instructor = { name: string; norm: string };

export type Offering = {
    id: number;
    term_id: string;
    subject: string;
    course: string;
    section: string;
    component: "LEC" | "LAB" | "TUT" | "SEM" | "PRJ" | string;
    title: string | null;
    status: string | null;
    capacity: number | null;
    seats_available: number | null;
    waitlist_total: number | null;
    delivery_mode: string | null;
    campus: string | null;
    notes: string | null;
    base: string; // "SUBJ 123"
    instructors?: Instructor[];
    meetings?: Meeting[];
};

export type SearchHit = { base: string; sections: number };

export const API_BASE =
    (import.meta as any).env?.VITE_API_BASE?.replace(/\/+$/, "") || "https://prereqvv.onrender.com/";

export async function getJSON<T>(path: string): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, got "${ct || "unknown"}". First bytes:\n${text.slice(0, 200)}`);
    }
    if (!r.ok) throw new Error(text);
    return JSON.parse(text) as T;
}

export const terms = async () => getJSON<Term[]>("/api/sched/terms");

export const search = async (term_id: string, q: string) =>
    getJSON<SearchHit[]>(`/api/sched/search?term_id=${encodeURIComponent(term_id)}&q=${encodeURIComponent(q)}`);

export const offerings = async (opts: {
    term_id: string;
    subject?: string;
    course?: string;
    base?: string; // alternative to subject+course
    include?: string; // "meetings,instructors"
}) => {
    const p = new URLSearchParams();
    if (!opts.term_id) throw new Error("term_id required");
    p.set("term_id", opts.term_id);

    if (opts.base) p.set("base", opts.base);
    if (opts.subject) p.set("subject", opts.subject);
    if (opts.course) p.set("course", opts.course);
    if (opts.include) p.set("include", opts.include);

    return getJSON<Offering[]>(`/api/sched/offerings?${p.toString()}`);
};
