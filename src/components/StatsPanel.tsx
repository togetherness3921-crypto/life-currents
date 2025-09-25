import { useMemo } from 'react';

type StatsPanelProps = {
    history: Record<string, { total_percentage_complete: number; daily_gain: number | null }> | undefined;
};

export default function StatsPanel({ history }: StatsPanelProps) {
    const { rollingAverage, todaysGain } = useMemo(() => {
        if (!history) return { rollingAverage: 0, todaysGain: 0 };

        const sortedDates = Object.keys(history).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        const todayKey = new Date().toISOString().split('T')[0];
        const todaysGain = history[todayKey]?.daily_gain ?? 0;

        const last30Days = sortedDates.slice(-30);
        const gains = last30Days.map(date => history[date].daily_gain).filter(gain => gain !== null && gain > 0) as number[];

        const sum = gains.reduce((acc, gain) => acc + gain, 0);
        const rollingAverage = gains.length > 0 ? sum / gains.length : 0;

        return { rollingAverage, todaysGain };
    }, [history]);

    return (
        <div className="h-full w-full bg-card text-card-foreground p-2 flex flex-col justify-center gap-2">
            <div className="flex items-baseline justify-between">
                <h3 className="text-[0.6rem] font-semibold text-muted-foreground uppercase tracking-wider">Today</h3>
                <div className="text-xs font-bold text-primary">
                    +{todaysGain.toFixed(2)}%
                </div>
            </div>
            <div className="border-t border-border my-1"></div>
            <div className="flex items-baseline justify-between">
                <h3 className="text-[0.6rem] font-semibold text-muted-foreground uppercase tracking-wider">30-Day AVG</h3>
                <div className="text-xs font-bold text-primary/80">
                    {rollingAverage.toFixed(2)}%
                </div>
            </div>
        </div>
    );
}
