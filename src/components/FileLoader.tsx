import Papa from 'papaparse';
import { useRef } from 'react';
import { CourseRecord, RecordRow } from '../types';
import { safeJSON } from '../utils';

export default function FileLoader({ onLoaded }: { onLoaded: (rows: CourseRecord[]) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (file: File) => {
        Papa.parse<RecordRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (res) => {
                const seen = new Set<string>();
                const out: CourseRecord[] = [];
                for (const raw of res.data) {
                    const cid = (raw.course_id || '').trim();
                    if (!cid || seen.has(cid)) continue;
                    seen.add(cid);
                    out.push({
                        course_id: cid,
                        credit_value: raw.credit_value ?? '',
                        text: raw.prereq_text_raw ?? '',
                        tree: safeJSON(raw.requirements_tree_json),
                        groups: safeJSON(raw.logic_groups_json),
                    });
                }
                out.sort((a, b) => a.course_id.localeCompare(b.course_id));
                onLoaded(out);
            },
            error: (err) => alert(`Parse failed: ${err.message}`),
        });
    };

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
                type="file"
                ref={inputRef}
                accept=".csv"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFiles(f);
                }}
            />
            <div
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFiles(f);
                }}
                style={{ border: '1px dashed #2a3240', padding: '6px 10px', borderRadius: 8, color: '#9aa7b1' }}
            >
                or drop CSV here
            </div>
        </div>
    );
}
