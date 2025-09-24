import { useEffect, useMemo, useRef, useState } from 'react';

function toDayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function useTodayTime(tickMs: number = 60000) {
    const [now, setNow] = useState<Date>(new Date());
    const prevDayKeyRef = useRef<string>(toDayKey(new Date()));
    const [dayKey, setDayKey] = useState<string>(prevDayKeyRef.current);

    useEffect(() => {
        const update = () => {
            const current = new Date();
            setNow(current);
            const currentKey = toDayKey(current);
            if (currentKey !== prevDayKeyRef.current) {
                prevDayKeyRef.current = currentKey;
                setDayKey(currentKey);
            }
        };
        update();
        const id = setInterval(update, tickMs);
        return () => clearInterval(id);
    }, [tickMs]);

    const { startOfDay, endOfDay } = useMemo(() => {
        const sod = new Date(now);
        sod.setHours(0, 0, 0, 0);
        const eod = new Date(now);
        eod.setHours(23, 59, 59, 999);
        return { startOfDay: sod, endOfDay: eod };
    }, [now]);

    return { now, dayKey, startOfDay, endOfDay } as const;
}
