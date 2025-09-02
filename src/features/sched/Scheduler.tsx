import React from "react";
import * as api from "../../api/sched";

/* -------------------- Types & Constants -------------------- */

type Planned = {
    courseBase: string;                       // "CPEN 211"
    color: string;
    poolByComp: Record<string, api.Offering[]>;   // all options per component
    chosenByComp: Record<string, api.Offering>;   // active pick per component
};

const COLORS = [
    "#6aa6ff", "#8fe388", "#ff8f8f", "#c39eff", "#ffc36a",
    "#a87f6a", "#64d7e0", "#9ea6ff", "#76d69a", "#ff76a0",
];

const DAY_BITS: Record<string, number> = { M: 1, T: 2, W: 4, R: 8, F: 16, S: 32, U: 64 };
const DAY_ORDER: Array<{ key: keyof typeof DAY_BITS; label: string }> = [
    { key: "M", label: "Mon" },
    { key: "T", label: "Tue" },
    { key: "W", label: "Wed" },
    { key: "R", label: "Thu" },
    { key: "F", label: "Fri" },
];

const MIN_MIN = 8 * 60;   // 08:00
const MAX_MIN = 21 * 60;  // 21:00
const HOUR_PX = 56;
const COL_W = 160;
const GRID_LEFT_GUTTER = 56;
const GRID_TOP = 36;

/* -------------------- Utilities -------------------- */

function minutesToHHMM(m: number) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const am = h < 12;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${mm.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

function meetingsConflict(a: api.Meeting, b: api.Meeting) {
    if ((a.days_mask & b.days_mask) === 0) return false;
    return a.start_min < b.end_min && b.start_min < a.end_min;
}

function packMeetings(plan: Planned[]): api.Meeting[] {
    const out: api.Meeting[] = [];
    for (const p of plan) {
        for (const off of Object.values(p.chosenByComp)) {
            for (const m of off.meetings || []) {
                if (m.days_mask && m.start_min != null && m.end_min != null) out.push(m);
            }
        }
    }
    return out;
}

function parseBase(input: string): { base: string; subject: string; course: string } | null {
    const s = input.toUpperCase().replace(/\s+/g, " ").trim();
    const m = s.match(/^([A-Z]{2,5})[_\s-]*([0-9]{3}[A-Z]?)$/);
    if (!m) return null;
    return { base: `${m[1]} ${m[2]}`, subject: m[1], course: m[2] };
}

function pickCombo(
    buckets: api.Offering[][],
    existingMeetings: api.Meeting[],
): api.Offering[] | null {
    const picked: api.Offering[] = [];

    function dfs(i: number): boolean {
        if (i === buckets.length) return true;
        for (const cand of buckets[i]) {
            const candMs = (cand.meetings || []).filter((m) => m.days_mask && m.start_min != null && m.end_min != null);
            const checkAgainst = existingMeetings.concat(
                picked.flatMap((x) => x.meetings || []),
            );
            const clash = candMs.some((m) => checkAgainst.some((x) => meetingsConflict(m, x)));
            if (!clash) {
                picked.push(cand);
                if (dfs(i + 1)) return true;
                picked.pop();
            }
        }
        return false;
    }

    return dfs(0) ? picked.slice() : null;
}

/* -------------------- UI Subcomponents -------------------- */

function DayHeader() {
    return (
        <div className="sch-head">
            <div className="sch-head-gutter" />
            {DAY_ORDER.map((d) => (
                <div key={d.key} className="sch-head-day">{d.label}</div>
            ))}
        </div>
    );
}

function HourLines() {
    const rows = Array.from({ length: (MAX_MIN - MIN_MIN) / 60 + 1 });
    return (
        <>
            {rows.map((_, i) => {
                const top = GRID_TOP + i * HOUR_PX;
                const hh = Math.floor(MIN_MIN / 60) + i;
                const am = hh < 12;
                const h12 = ((hh + 11) % 12) + 1;
                return (
                    <React.Fragment key={i}>
                        <div
                            className="sch-line"
                            style={{ top, left: GRID_LEFT_GUTTER, right: 0 }}
                        />
                        <div className="sch-hour" style={{ top: top - 8 }}>
                            {h12} {am ? "AM" : "PM"}
                        </div>
                    </React.Fragment>
                );
            })}
            {DAY_ORDER.map((d, i) => (
                <div
                    key={d.key}
                    className="sch-vline"
                    style={{ left: GRID_LEFT_GUTTER + i * COL_W, top: GRID_TOP, height: (MAX_MIN - MIN_MIN) / 60 * HOUR_PX }}
                />
            ))}
        </>
    );
}

function Block({
                   top, height, left, width, color, title, subtitle,
               }: { top: number; height: number; left: number; width: number; color: string; title: string; subtitle: string }) {
    return (
        <div
            className="sch-block"
            style={{
                top, left, height, width,
                background: `linear-gradient(180deg, ${color}cc, ${color}aa)`,
                border: `1px solid ${color}`,
            }}
            title={`${title}\n${subtitle}`}
        >
            <div className="sch-block-title">{title}</div>
            <div className="sch-block-sub">{subtitle}</div>
        </div>
    );
}

/* -------------------- Main -------------------- */

export default function Scheduler() {
    const [terms, setTerms] = React.useState<api.Term[]>([]);
    const [termId, setTermId] = React.useState("");
    const [query, setQuery] = React.useState("");
    const [hits, setHits] = React.useState<api.SearchHit[]>([]);
    const [plan, setPlan] = React.useState<Planned[]>([]);

    const gridHeight = (MAX_MIN - MIN_MIN) / 60 * HOUR_PX;

    React.useEffect(() => {
        (async () => {
            const t = await api.terms();
            setTerms(t);
            if (t.length) setTermId(t[0].id);
        })().catch(console.error);
    }, []);

    async function doSearch() {
        if (!termId || !query.trim()) return setHits([]);
        const res = await api.search(termId, query.trim());
        setHits(res.slice(0, 25));
    }

    async function addCourse(baseOrTyped?: string) {
        const raw = (baseOrTyped ?? query).trim();
        if (!termId || !raw) return;

        const parsed = parseBase(raw);
        if (!parsed) {
            alert("Enter like: CPEN 211");
            return;
        }

        const { base, subject, course } = parsed;
        const list = await api.offerings({
            term_id: termId,
            subject, course,
            include: "meetings,instructors",
        });

        // group by component
        const byComp: Record<string, api.Offering[]> = {};
        for (const o of list) {
            const comp = (o.component || "").toUpperCase();
            if (!o.meetings?.some(m => m.days_mask && m.start_min != null && m.end_min != null)) continue;
            (byComp[comp] ||= []).push(o);
        }

        const order = ["LEC", "LAB", "TUT", "SEM", "PRJ"].filter(c => byComp[c]?.length);
        if (order.length === 0) {
            alert(`No scheduled (timed) offerings for ${base}`);
            return;
        }

        const buckets = order.map(c => byComp[c]);
        const picked = pickCombo(buckets, packMeetings(plan));
        if (!picked) {
            alert(`Could not add ${base} without conflicts`);
            return;
        }

        const chosenByComp: Record<string, api.Offering> = {};
        picked.forEach(o => { chosenByComp[(o.component || "").toUpperCase()] = o; });

        const p: Planned = {
            courseBase: base,
            color: COLORS[plan.length % COLORS.length],
            poolByComp: byComp,
            chosenByComp,
        };

        setPlan(prev => [...prev, p]);
        setQuery("");
        setHits([]);
    }

    function removeCourse(base: string) {
        setPlan(prev => prev.filter(p => p.courseBase !== base));
    }

    // Replace chosen section by drag/click, checking conflicts
    function tryChoose(base: string, comp: string, off: api.Offering) {
        setPlan(prev => {
            const idx = prev.findIndex(p => p.courseBase === base);
            if (idx < 0) return prev;

            // meetings from other courses
            const others = prev.filter((_, i) => i !== idx);
            const otherMs = packMeetings(others);

            // current course but other components
            const cur = prev[idx];
            const selfOtherMs: api.Meeting[] = [];
            for (const [k, v] of Object.entries(cur.chosenByComp)) {
                if (k === comp) continue;
                selfOtherMs.push(...(v.meetings || []));
            }

            const candMs = (off.meetings || []).filter(m => m.days_mask && m.start_min != null && m.end_min != null);
            const clash = candMs.some(m =>
                otherMs.some(x => meetingsConflict(m, x)) ||
                selfOtherMs.some(x => meetingsConflict(m, x)),
            );
            if (clash) {
                alert("That section conflicts with your current plan.");
                return prev;
            }

            const next = [...prev];
            next[idx] = {
                ...cur,
                chosenByComp: { ...cur.chosenByComp, [comp]: off },
            };
            return next;
        });
    }

    // DnD handlers
    function onDragStart(e: React.DragEvent, payload: { base: string; comp: string; offeringId: number }) {
        e.dataTransfer.setData("application/json", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "copyMove";
    }
    function onDropCalendar(e: React.DragEvent) {
        e.preventDefault();
        const raw = e.dataTransfer.getData("application/json");
        if (!raw) return;
        const { base, comp, offeringId } = JSON.parse(raw);
        const course = plan.find(p => p.courseBase === base);
        const candidate = course?.poolByComp[comp]?.find(o => o.id === offeringId);
        if (base && comp && candidate) tryChoose(base, comp, candidate);
    }

    // Build calendar blocks
    const blocks: Array<JSX.Element> = [];
    plan.forEach((p, pi) => {
        for (const [comp, off] of Object.entries(p.chosenByComp)) {
            for (const m of off.meetings || []) {
                if (!m.days_mask || m.start_min == null || m.end_min == null) continue;
                const start = Math.max(m.start_min, MIN_MIN);
                const end = Math.min(m.end_min, MAX_MIN);
                if (end <= MIN_MIN || start >= MAX_MIN) continue;

                const top = GRID_TOP + (start - MIN_MIN) / 60 * HOUR_PX;
                const height = Math.max(18, (end - start) / 60 * HOUR_PX);
                const title = `${p.courseBase} ${comp} ${off.section}`;
                const subtitle = `${minutesToHHMM(m.start_min)}–${minutesToHHMM(m.end_min)}${m.room ? ` • ${m.room}` : ""}`;

                DAY_ORDER.forEach((d, i) => {
                    if (m.days_mask & DAY_BITS[d.key]) {
                        const left = GRID_LEFT_GUTTER + i * COL_W + 8;
                        const width = COL_W - 16;
                        blocks.push(
                            <Block
                                key={`${pi}-${off.id}-${m.id}-${d.key}`}
                                top={top} height={height} left={left} width={width}
                                color={p.color} title={title} subtitle={subtitle}
                            />
                        );
                    }
                });
            }
        }
    });

    return (
        <div className="sch-wrap">
            {/* Left rail – course controls */}
            <aside className="sch-rail">
                <div className="sch-panel">
                    <div className="sch-title">Scheduler</div>
                    <label className="sch-label">Term</label>
                    <select
                        className="sch-input"
                        value={termId}
                        onChange={(e) => setTermId(e.target.value)}
                    >
                        {terms.map((t) => (
                            <option key={t.id} value={t.id}>{t.title || t.id}</option>
                        ))}
                    </select>

                    <label className="sch-label">Add Course</label>
                    <div className="sch-row">
                        <input
                            className="sch-input"
                            placeholder="e.g., CPEN 211"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCourse()}
                        />
                        <button className="sch-btn" onClick={() => addCourse()}>Add</button>
                    </div>
                    <button className="sch-btn ghost" onClick={() => doSearch()}>Search</button>

                    {hits.length > 0 && (
                        <>
                            <div className="sch-sub">Results</div>
                            <div className="sch-chiprow">
                                {hits.map((h) => (
                                    <button
                                        key={h.base}
                                        className="sch-chip"
                                        title={`${h.sections} sections`}
                                        onClick={() => addCourse(h.base)}
                                    >
                                        {h.base} <span className="muted">({h.sections})</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Planned courses w/ section pools */}
                {plan.map((p) => (
                    <div key={p.courseBase} className="sch-panel">
                        <div className="sch-row sb">
                            <div className="sch-title">
                                <span className="dot" style={{ background: p.color }} /> {p.courseBase}
                            </div>
                            <button className="sch-btn danger" onClick={() => removeCourse(p.courseBase)}>Remove</button>
                        </div>
                        {Object.entries(p.poolByComp).map(([comp, list]) => (
                            <div key={comp} className="comp-group">
                                <div className="comp-title">{comp}</div>
                                <div className="sch-chiprow">
                                    {list.map((o) => {
                                        const active = p.chosenByComp[comp]?.id === o.id;
                                        const ms = (o.meetings || []).filter(m => m.days_mask && m.start_min != null && m.end_min != null);
                                        const times = ms.slice(0, 1).map(m =>
                                            `${Object.keys(DAY_BITS).filter(k => m.days_mask & DAY_BITS[k]).join("")} ${minutesToHHMM(m.start_min)}`
                                        )[0] || "—";
                                        return (
                                            <div
                                                key={o.id}
                                                className={`sch-chip ${active ? "active" : ""}`}
                                                draggable
                                                onDragStart={(e) => onDragStart(e, { base: p.courseBase, comp, offeringId: o.id })}
                                                onClick={() => tryChoose(p.courseBase, comp, o)}
                                                title={`${comp} ${o.section} • ${times}`}
                                            >
                                                {o.section}
                                                {active && <span className="check">✓</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </aside>

            {/* Calendar */}
            <main
                className="sch-cal"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropCalendar}
            >
                <DayHeader />
                <div className="sch-canvas" style={{ height: gridHeight + GRID_TOP + 12 }}>
                    <HourLines />
                    {blocks}
                </div>
                <div className="sch-hint">
                    Drag a section pill onto the calendar to switch to it. We’ll block changes that create conflicts.
                </div>
            </main>
        </div>
    );
}
