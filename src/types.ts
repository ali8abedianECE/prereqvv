export type CourseId = string;

export type RequirementTree =
    | { type: 'course'; id: CourseId }
    | {
    op: 'AND' | 'OR';
    min?: number;
    meta?: { kind?: 'CO_REQ' | 'PREREQ_GENERIC' | string };
    children: RequirementTree[];
}
    | {
    constraint: 'YEAR_STANDING' | 'GPA_MIN' | 'PERCENT_MIN' | 'CREDITS_AT_LEAST';
    year_min?: number;
    value?: number;
    credits_min?: number;
    subject?: string | null;
    level_min?: number | null;
    courses?: CourseId[];
};

export interface RecordRow {
    course_id: CourseId;
    credit_value?: string;
    prereq_text_raw?: string;
    requirements_tree_json?: string;
    logic_groups_json?: string;
}

export interface CourseRecord {
    course_id: CourseId;
    credit_value: string;
    text: string;
    tree: RequirementTree | null;
    groups: unknown | null;
}

export type Campus = "AUTO" | "V" | "O";

export type Link = { source: string; target: string; kind: string; group_id?: string | null };

export type GraphPayload = {
    nodes: string[];
    links: Link[];
    base_id: string;
    actual_id: string;
    averages?: Record<string, number>;
    averagesByBase?: Record<string, number>;
};

export const BASE_RE = /^([A-Z]{2,5})(?:_([A-Z]))?\s+(\d{3}[A-Z]?)$/;

export function toBase(id: string) {
    const m = id.toUpperCase().match(BASE_RE);
    return m ? `${m[1]} ${m[3]}` : id.toUpperCase();
}

export function parseCompletedInput(s: string) {
    return s.split(/[,\n]/).map(x => x.trim()).filter(Boolean).map(toBase);
}

/** ─── VIZ models ─── */
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

export type VizProfessor = {
    id?: string;
    legacy_id: string;
    first_name: string;
    last_name: string;
    avg_rating: number | null;
    avg_difficulty: number | null;
    would_take_again_pct: number | null;
    num_ratings: number | null;
    department?: string | null;
    faculty?: string | null;
};

