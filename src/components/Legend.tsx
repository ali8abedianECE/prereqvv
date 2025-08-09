export default function Legend() {
    const COLORS = {
        req: "#5aa9e6",     // solid
        or: "#ffa447",      // dashed
        coreq: "#a78bfa",   // solid
        credit: "#4ade80",  // solid
        excl: "#9aa7b1",    // dotted
        text: "#e8edf2",
        card: "#141820",
        border: "#1e242e",
    } as const;

    const Row = ({ label, color, dash }: { label: string; color: string; dash?: string }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="54" height="12" aria-hidden>
                <line
                    x1="2" y1="6" x2="52" y2="6"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={dash ?? undefined}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <span>{label}</span>
        </div>
    );

    return (
        <div style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: "8px 10px",
            color: COLORS.text,
        }}>
            <Row label="Prerequisite" color={COLORS.req} />
            <Row label="One-of group" color={COLORS.or} dash="6,4" />
            <Row label="Co-requisite" color={COLORS.coreq} />
            <Row label="Credit granted (outward from root)" color={COLORS.credit} />
            <Row label="Credit/exclusion (variant)" color={COLORS.excl} dash="2,4" />
        </div>
    );
}
