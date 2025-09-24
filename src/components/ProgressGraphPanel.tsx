import { useMemo } from 'react';

type ProgressGraphPanelProps = {
    history: Record<string, { total_percentage_complete: number; daily_gain: number | null }> | undefined;
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 200;
const PADDING = { top: 20, right: 10, bottom: 20, left: 40 };

export default function ProgressGraphPanel({ history }: ProgressGraphPanelProps) {
    const chartData = useMemo(() => {
        if (!history) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = today.toISOString().split('T')[0];

        const processedData = Object.entries(history)
            .map(([date, data]) => ({
                date: new Date(date),
                isToday: date === todayKey,
                ...data
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        // Add future days to the timeline
        const lastDate = processedData.length > 0 ? processedData[processedData.length - 1].date : today;
        for (let i = 1; i <= 1; i++) {
            const futureDate = new Date(lastDate);
            futureDate.setDate(lastDate.getDate() + i);
            if (processedData.every(d => d.date.getTime() !== futureDate.getTime())) {
                processedData.push({ date: futureDate, isToday: false, total_percentage_complete: NaN, daily_gain: null });
            }
        }

        return processedData.slice(-7); // Default to last 7 days for now
    }, [history]);

    const { yMin, yMax, points, yAxisLabels } = useMemo(() => {
        const validData = chartData.filter(d => !isNaN(d.total_percentage_complete));
        if (validData.length === 0) return { yMin: 0, yMax: 10, points: [], yAxisLabels: [] };

        const values = validData.map(d => d.total_percentage_complete);
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);

        const range = dataMax - dataMin;
        const yMax = range > 0.1 ? dataMax + range * 0.5 : dataMax + 5;
        const yMin = dataMin - 5 < 0 ? 0 : dataMin - 5;

        const xStep = chartData.length > 1 ? (SVG_WIDTH - PADDING.left - PADDING.right) / (chartData.length - 1) : (SVG_WIDTH - PADDING.left - PADDING.right) / 2;
        const yRange = yMax - yMin > 0.1 ? yMax - yMin : 10;

        const yToPx = (y: number) => SVG_HEIGHT - PADDING.bottom - ((y - yMin) / yRange) * (SVG_HEIGHT - PADDING.top - PADDING.bottom);

        const points = validData.map(d => {
            const i = chartData.findIndex(cd => cd.date.getTime() === d.date.getTime());
            return {
                x: PADDING.left + i * xStep,
                y: yToPx(d.total_percentage_complete),
                ...d,
            }
        });

        const yAxisLabels = [yMin, yMax];

        return { yMin, yMax, points, yAxisLabels };
    }, [chartData]);

    if (chartData.length === 0) {
        return (
            <div className="h-full w-full bg-card text-card-foreground p-4 flex items-center justify-center">
                <p className="text-muted-foreground">No progress data recorded yet.</p>
            </div>
        );
    }

    const path = points.length > 1 ? points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x} ${p.y}`).join(' ') : '';
    const xStepForLabels = chartData.length > 1 ? (SVG_WIDTH - PADDING.left - PADDING.right) / (chartData.length - 1) : (SVG_WIDTH - PADDING.left - PADDING.right) / 2;

    return (
        <div className="h-full w-full bg-card text-card-foreground p-2">
            <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full h-full progress-graph-svg">
                {/* Y-Axis Labels, Ticks, and Grid Lines */}
                {yAxisLabels.map(label => {
                    const y = SVG_HEIGHT - PADDING.bottom - ((label - yMin) / (yMax - yMin)) * (SVG_HEIGHT - PADDING.top - PADDING.bottom);
                    return (
                        <g key={`y-axis-${label}`}>
                            <text x={PADDING.left - 8} y={y} textAnchor="end" alignmentBaseline="middle" fill="currentColor">{label.toFixed(0)}%</text>
                            <line x1={PADDING.left - 4} y1={y} x2={PADDING.left} y2={y} stroke="currentColor" strokeWidth="1" />
                            <line x1={PADDING.left} y1={y} x2={SVG_WIDTH - PADDING.right} y2={y} stroke="hsl(var(--border))" strokeWidth="1" />
                        </g>
                    )
                })}

                {/* Green Gain Triangles */}
                {points.map((p, i) => {
                    if (i === 0 || !p.daily_gain || p.daily_gain <= 0) return null;
                    const prevPoint = points[i - 1];
                    const trianglePoints = `${prevPoint.x},${prevPoint.y} ${p.x},${p.y} ${p.x},${prevPoint.y}`;
                    return <polygon key={`gain-${i}`} points={trianglePoints} fill="rgba(74, 222, 128, 0.2)" />;
                })}

                {/* Line */}
                <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />

                {/* Dots */}
                {points.map((p, i) => (
                    <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary))">
                        {p.isToday && (
                            <animate
                                attributeName="r"
                                values="3;6;3"
                                dur="1.5s"
                                repeatCount="indefinite"
                            />
                        )}
                    </circle>
                ))}

                {/* X-Axis Labels */}
                {chartData.map((p, i) => (
                    <text key={`label-${i}`} x={PADDING.left + i * xStepForLabels} y={SVG_HEIGHT - PADDING.bottom + 18} textAnchor={i === 0 ? 'start' : 'middle'} fill="currentColor">
                        {p.isToday ? 'Today' : p.date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                    </text>
                ))}
            </svg>
        </div>
    );
}
