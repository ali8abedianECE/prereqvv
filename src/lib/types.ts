export type Professor = {
    id: string;
    legacyId: string;
    firstName: string;
    lastName: string;
    department: string;
    avgRating: number;
    avgDifficulty: number;
    numRatings: number;
    wouldTakeAgainPercent: number;
    rmpUrl: string;
    coursesTaught: string[];
};

export type CourseData = {
    campus: string; year: string; session: string;
    subject: string; course: string; detail: string; section: string;
    title: string; professorName: string; enrolled: number;
    avg: number|null; stdDev: number|null; high: number|null; low: number|null;
    pass: number|null; fail: number|null; withdrew: number|null;
    audit: number|null; other: number|null; reported: number|null;
    median: number|null; percentile25: number|null; percentile75: number|null;
    gradeDistribution: Record<string, number>;
};
