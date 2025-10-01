import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

interface CalendarNodeData {
    label?: string;
    status?: string;
    scheduled_start?: string;
    scheduled_end?: string;
}

type CalendarNodesById = Record<string, CalendarNodeData>;

type CalendarPanelProps = {
    nodesById: CalendarNodesById;
    startOfDay: Date;
    endOfDay: Date;
    now: Date;
    onZoomToNode: (id: string) => void;
};

function isWithinDay(iso?: string, start?: Date, end?: Date) {
    if (!iso || !start || !end) return false;
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t <= end.getTime();
}

function minutesSinceStartOfDay(d: Date, startOfDay: Date) {
    return Math.max(0, Math.floor((d.getTime() - startOfDay.getTime()) / 60000));
}

export default function DailyCalendarPanel({ nodesById, startOfDay, endOfDay, now, onZoomToNode }: CalendarPanelProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const userScrolledRef = useRef(false);
    const autoScrolledRef = useRef(false);
    const pendingScrollTimeoutRef = useRef<number | null>(null);

    const items = useMemo(() => {
        const result: Array<{ id: string; label: string; start: Date; end: Date }> = [];
        for (const [id, node] of Object.entries(nodesById || {})) {
            if (!node?.scheduled_start || !node?.scheduled_end) continue;
            const startDate = new Date(node.scheduled_start);
            const endDate = new Date(node.scheduled_end);
            if (isWithinDay(node.scheduled_start, startOfDay, endOfDay) && isWithinDay(node.scheduled_end, startOfDay, endOfDay)) {
                result.push({ id, label: node.label || id, start: startDate, end: endDate });
            }
        }
        return result.sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [nodesById, startOfDay, endOfDay]);

    const startOfDayKey = startOfDay.getTime();
    const totalMinutes = 24 * 60;
    const pxPerMinute = 1; // 1px per minute => ~1440px total height
    const heightPx = totalMinutes * pxPerMinute;
    const nowOffset = minutesSinceStartOfDay(now, startOfDay) * pxPerMinute;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onScroll = () => {
            userScrolledRef.current = true;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
        };
    }, []);

    useEffect(() => {
        autoScrolledRef.current = false;
        userScrolledRef.current = false;
    }, [startOfDayKey]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || autoScrolledRef.current || userScrolledRef.current) {
            return;
        }

        if (pendingScrollTimeoutRef.current) {
            window.clearTimeout(pendingScrollTimeoutRef.current);
        }

        pendingScrollTimeoutRef.current = window.setTimeout(() => {
            if (!el || userScrolledRef.current) return;
            autoScrolledRef.current = true;
            const target = Math.max(0, nowOffset - el.clientHeight / 2);
            el.scrollTo({ top: target, behavior: 'smooth' });
        }, 250);

        return () => {
            if (pendingScrollTimeoutRef.current) {
                window.clearTimeout(pendingScrollTimeoutRef.current);
                pendingScrollTimeoutRef.current = null;
            }
        };
    }, [nowOffset]);

    const hourLabel = (i: number) => {
        const hour12 = ((i + 11) % 12) + 1; // 0->12, 1->1, ..., 12->12, 13->1
        return String(hour12);
    };

    return (
        <div className="h-full w-full flex flex-col bg-card text-card-foreground border-l border-border">
            <div className="px-2 py-1 border-b border-border font-semibold text-[0.6rem] text-muted-foreground uppercase tracking-wider">Calendar</div>
            <div ref={containerRef} className="flex-1 overflow-auto relative">
                {/* Timeline container */}
                <div className="relative mx-2" style={{ height: heightPx }}>
                    {/* Hour markers */}
                    {Array.from({ length: 25 }).map((_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-t border-border text-[10px] text-muted-foreground"
                            style={{ top: i * 60 * pxPerMinute }}>
                            <span className="absolute left-0 -translate-x-0 text-[10px]">{hourLabel(i)}</span>
                        </div>
                    ))}

                    {/* Current time line */}
                    <div className="absolute left-0 right-0" style={{ top: nowOffset }}>
                        <div className="h-px bg-red-500" />
                    </div>

                    {/* Event bubbles */}
                    {items.map((it) => {
                        const startMin = minutesSinceStartOfDay(it.start, startOfDay);
                        const endMin = minutesSinceStartOfDay(it.end, startOfDay);
                        const top = startMin * pxPerMinute;
                        const height = Math.max(10, (endMin - startMin) * pxPerMinute);
                        const status = nodesById?.[it.id]?.status;
                        const isCompleted = status === 'completed' || status === 'complete';
                        const bubbleClass = isCompleted
                            ? 'bg-green-500/40 border-green-500/60'
                            : 'bg-primary/20 border-primary/40';
                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => onZoomToNode(it.id)}
                                className={cn(
                                    'absolute left-0 right-0 rounded-sm border p-1 text-[10px] text-left transition-colors hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    bubbleClass
                                )}
                                style={{ top, height }}
                            >
                                <div className="font-medium text-foreground truncate">{it.label}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
