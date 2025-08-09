import { RequirementTree } from '../types';

function NodeLabel({ n }: { n: RequirementTree }) {
    if ('type' in n && n.type === 'course') return <>Course: <code>{n.id}</code></>;
    if ('constraint' in n) {
        if (n.constraint === 'YEAR_STANDING') return <>Constraint: YEAR_STANDING ({n.year_min ? `year ≥ ${n.year_min}` : 'year standing'})</>;
        if (n.constraint === 'GPA_MIN') return <>Constraint: GPA ≥ {n.value}</>;
        if (n.constraint === 'PERCENT_MIN') return <>Constraint: Average ≥ {n.value}%</>;
        if (n.constraint === 'CREDITS_AT_LEAST') return <>Constraint: {n.credits_min} credits{n.subject ? ` in ${n.subject}` : ''}{n.level_min ? ` at ≥ ${n.level_min} level` : ''}</>;
        return <>Constraint: {n.constraint}</>;
    }
    if ('op' in n) {
        const parts = ['Op: ' + n.op];
        if (n.min != null) parts.push(`min=${n.min}`);
        if (n.meta?.kind) parts.push(`[${n.meta.kind}]`);
        return <>{parts.join(' ')}</>;
    }
    return <>Node</>;
}

function TreeNode({ node }: { node: RequirementTree }) {
    if (!node) return null;
    const children = ('op' in node && node.children) ? node.children : [];
    return (
        <details open style={{ marginLeft: 10 }}>
            <summary><NodeLabel n={node} /></summary>
            {children.map((c, i) => <TreeNode key={i} node={c} />)}
            {'constraint' in node && node.courses?.length ? (
                <div style={{ marginLeft: 16 }}>
                    <span style={{ opacity: 0.7 }}>courses: </span>
                    {node.courses.map((c) => <code key={c} style={{ marginRight: 6 }}>{c}</code>)}
                </div>
            ) : null}
        </details>
    );
}

export default function TreeView({ tree }: { tree: RequirementTree | null }) {
    if (!tree) return <div style={{ color: '#9aa7b1' }}>No structured requirements found.</div>;
    return <div><TreeNode node={tree} /></div>;
}
