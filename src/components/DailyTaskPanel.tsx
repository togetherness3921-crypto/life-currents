import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

interface TaskNodeData {
    label?: string;
    status?: string;
    completed_at?: string;
}

type TaskNodesById = Record<string, TaskNodeData>;

type TaskPanelProps = {
    nodesById: TaskNodesById;
    onToggleComplete: (id: string) => void;
    onZoomToNode: (id: string) => void;
    startOfDay: Date;
    endOfDay: Date;
};

function isWithinDay(iso?: string, start?: Date, end?: Date) {
    if (!iso || !start || !end) return false;
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t <= end.getTime();
}

export default function DailyTaskPanel({ nodesById, onToggleComplete, onZoomToNode, startOfDay, endOfDay }: TaskPanelProps) {
    const { inProgressToday, completedToday } = useMemo(() => {
        const allEntries = Object.entries(nodesById || {});
        const inProg = allEntries.filter(([, node]) => node?.status === 'in-progress');
        const completed = allEntries.filter(([, node]) => node?.status === 'completed' && isWithinDay(node?.completed_at, startOfDay, endOfDay));
        return {
            inProgressToday: inProg.map(([id, node]) => ({ id, label: node?.label || id })),
            completedToday: completed.map(([id, node]) => ({ id, label: node?.label || id })),
        };
    }, [nodesById, startOfDay, endOfDay]);

    return (
        <div className="h-full w-full flex flex-col bg-card text-card-foreground border-l border-border">
            <div className="px-2 py-1 border-b border-border font-semibold text-[0.6rem] text-muted-foreground uppercase tracking-wider">In Progress</div>
            <div className="flex-1 overflow-auto p-3">
                {inProgressToday.length > 0 && (
                    <ul className="space-y-2">
                        {inProgressToday.map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                                <input
                                    aria-label={`Complete ${t.label}`}
                                    type="checkbox"
                                    className="h-4 w-4"
                                    onChange={() => onToggleComplete(t.id)}
                                />
                                <button
                                    className="text-left hover:underline text-[0.6rem] leading-tight truncate"
                                    onClick={() => onZoomToNode(t.id)}
                                >
                                    {t.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="px-2 py-1 border-t border-border font-semibold text-[0.6rem] text-muted-foreground uppercase tracking-wider">Completed</div>
            <div className="max-h-[40%] overflow-auto p-3">
                {completedToday.length > 0 && (
                    <ul className="space-y-2">
                        {completedToday.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 opacity-80">
                                <input type="checkbox" className="h-4 w-4" checked readOnly />
                                <button
                                    className="text-left hover:underline text-[0.6rem] leading-tight truncate"
                                    onClick={() => onZoomToNode(t.id)}
                                >
                                    {t.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
