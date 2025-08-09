import { useMemo } from 'react';

export default function CourseSearch({
                                         courses, value, onChange, onSubmit,
                                     }: { courses: string[]; value: string; onChange: (v: string) => void; onSubmit: () => void }) {
    const datalistId = useMemo(() => 'courses-' + Math.random().toString(36).slice(2), []);
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>Course:</label>
            <input
                list={datalistId}
                placeholder="e.g., MATH_V 101"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3240', background: '#141820', color: '#e8edf2' }}
            />
            <datalist id={datalistId}>
                {courses.map((c) => <option key={c} value={c} />)}
            </datalist>
            <button onClick={onSubmit} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2a3240', background: '#141820', color: '#e8edf2' }}>
                Render
            </button>
        </div>
    );
}
