import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

type CalendarPanelProps = {
    nodesById: Record<string, any>;
    startOfDay: Date;
    endOfDay: Date;
    now: Date;
    onSelectNode: (id: string) => void;
};

function isWithinDay(iso?: string, start?: Date, end?: Date) {
    if (!iso || !start || !end) return false;
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t <= end.getTime();
}

function minutesSinceStartOfDay(d: Date, startOfDay: Date) {
    return Math.max(0, Math.floor((d.getTime() - startOfDay.getTime()) / 60000));
}

export default function DailyCalendarPanel({ nodesById, startOfDay, endOfDay, now, onSelectNode }: CalendarPanelProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const userScrolledRef = useRef(false);
    const autoScrollAppliedRef = useRef(false);

    const items = useMemo(() => {
        const result: Array<{ id: string; label: string; start: Date; end: Date }> = [];
        for (const [id, n] of Object.entries(nodesById || {})) {
            const ns: any = n;
            if (!ns?.scheduled_start || !ns?.scheduled_end) continue;
            const s = new Date(ns.scheduled_start);
            const e = new Date(ns.scheduled_end);
            if (isWithinDay(ns.scheduled_start, startOfDay, endOfDay) && isWithinDay(ns.scheduled_end, startOfDay, endOfDay)) {
                result.push({ id, label: ns.label || id, start: s, end: e });
            }
        }
        return result.sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [nodesById, startOfDay, endOfDay]);

    const totalMinutes = 24 * 60;
    const pxPerMinute = 1; // 1px per minute => ~1440px total height
    const heightPx = totalMinutes * pxPerMinute;
    const nowOffset = minutesSinceStartOfDay(now, startOfDay) * pxPerMinute;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleUserScroll = () => {
            autoScrollAppliedRef.current = true;
            userScrolledRef.current = true;
        };
        el.addEventListener('wheel', handleUserScroll, { passive: true });
        el.addEventListener('touchmove', handleUserScroll, { passive: true });
        el.addEventListener('scroll', handleUserScroll, { passive: true });
        return () => {
            el.removeEventListener('wheel', handleUserScroll);
            el.removeEventListener('touchmove', handleUserScroll);
            el.removeEventListener('scroll', handleUserScroll);
        };
    }, []);

    useEffect(() => {
        if (autoScrollAppliedRef.current) return;
        const el = containerRef.current;
        if (!el) return;
        autoScrollAppliedRef.current = true;
        const timer = window.setTimeout(() => {
            if (userScrolledRef.current) return;
            const centerTop = Math.max(0, nowOffset - el.clientHeight / 2);
            el.scrollTo({ top: centerTop, behavior: 'smooth' });
        }, 300);
        return () => window.clearTimeout(timer);
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
                        const status = (nodesById?.[it.id] as any)?.status;
                        const isCompleted = status === 'completed' || status === 'complete';
                        const bubbleClass = isCompleted
                            ? 'bg-green-500/40 border-green-500/60'
                            : 'bg-primary/20 border-primary/40';
                        return (
                            <div
                                key={it.id}
                                role="button"
                                tabIndex={0}
                                aria-label={`View ${it.label}`}
                                className={cn(
                                    'absolute left-0 right-0 rounded-sm border p-1 text-[10px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/60',
                                    bubbleClass
                                )}
                                style={{ top, height }}
                                onClick={() => onSelectNode(it.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelectNode(it.id);
                                    }
                                }}
                            >
                                <div className="font-medium text-foreground truncate">{it.label}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
