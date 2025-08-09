import { CourseId, RequirementTree, CourseRecord } from './types';

export const safeJSON = <T = any>(s?: string | null): T | null => {
    if (!s) return null;
    try { return JSON.parse(s) as T; } catch { return null; }
};

export function buildIndex(rows: CourseRecord[]) {
    const index = new Map<CourseId, CourseRecord>();
    for (const r of rows) index.set(r.course_id, r);
    return index;
}

export function collectEdges(
    rootId: CourseId,
    index: Map<CourseId, CourseRecord>,
    depth: number,
    includeCoreq: boolean
) {
    const nodes = new Set<CourseId>([rootId]);
    type Kind = 'REQ' | 'OR' | 'CO_REQ';
    const links: Array<{ source: CourseId; target: CourseId; kind: Kind }> = [];
    const visited = new Set<string>();

    function addEdge(src: CourseId, tgt: CourseId, kind: Kind) {
        nodes.add(src); nodes.add(tgt);
        if (kind !== 'CO_REQ' || includeCoreq) links.push({ source: src, target: tgt, kind });
    }

    function fromNode(n: RequirementTree | null | undefined, target: CourseId, parentOp?: 'AND'|'OR', parentKind?: string) {
        if (!n) return;
        if ('type' in n && n.type === 'course') {
            const kind: Kind = parentKind === 'CO_REQ' ? 'CO_REQ' : parentOp === 'OR' ? 'OR' : 'REQ';
            addEdge(n.id, target, kind);
            return;
        }
        if ('constraint' in n) return;
        if ('op' in n && Array.isArray(n.children)) {
            const k = n.meta?.kind;
            for (const c of n.children) fromNode(c, target, n.op, k);
        }
    }

    function walk(cid: CourseId, d: number) {
        const key = `${cid}::${d}`;
        if (visited.has(key)) return;
        visited.add(key);

        const tree = index.get(cid)?.tree;
        if (!tree) return;

        fromNode(tree, cid);

        if (d > 1) {
            const prereqCourses: CourseId[] = [];
            (function collectCourses(n?: RequirementTree | null) {
                if (!n) return;
                if ('type' in n && n.type === 'course') prereqCourses.push(n.id);
                else if ('op' in n && Array.isArray(n.children)) n.children.forEach(collectCourses);
            })(tree);
            for (const p of prereqCourses) {
                if (index.has(p)) walk(p, d - 1);
            }
        }
    }

    walk(rootId, depth);
    return { nodes: Array.from(nodes), links };
}
