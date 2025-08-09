import React from 'react';

export default class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: any }
> {
    constructor(props: any) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: any) { return { error }; }
    componentDidCatch(err: any, info: any) { console.error('ErrorBoundary', err, info); }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 16, color: '#ffb4b4', background: '#0b0d10', minHeight: '100vh' }}>
            <h3>App crashed</h3>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#e8edf2' }}>
            {String(this.state.error?.message || this.state.error)}
            </pre>
            </div>
        );
        }
        return this.props.children as any;
    }
}
