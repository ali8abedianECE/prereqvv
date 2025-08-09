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
