import { Handle, Position } from '@xyflow/react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Trash2 } from 'lucide-react';
import { Clock, CheckCircle, AlertCircle, XCircle, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface ObjectiveNodeData {
  label: string;
  status: 'not-started' | 'in-progress' | 'blocked' | 'complete' | 'completed';
  subObjectives?: Array<{ id: string; label: string; status?: string }>;
  onDelete?: () => void;
  onComplete?: () => void;
  onMeasure?: (width: number, height: number) => void;
  isHighlighted?: boolean;
}

const statusIcons = {
  'not-started': Clock,
  'in-progress': AlertCircle,
  'blocked': XCircle,
  'complete': CheckCircle,
  'completed': CheckCircle,
};

const statusColors = {
  'not-started': 'text-status-not-started',
  'in-progress': 'text-status-in-progress',
  'blocked': 'text-status-blocked',
  'complete': 'text-status-complete',
  'completed': 'text-status-complete',
};

export default function ObjectiveNode({ data }: { data: ObjectiveNodeData }) {
  const StatusIcon = statusIcons[data.status];
  const nodeRef = useRef<HTMLDivElement>(null);

  // Measure node dimensions after render
  useEffect(() => {
    if (nodeRef.current && data.onMeasure) {
      const resizeObserver = new ResizeObserver(() => {
        if (!nodeRef.current || !data.onMeasure) return;
        const rect = nodeRef.current.getBoundingClientRect();
        // Debounce via rAF to coalesce mobile layout thrash
        requestAnimationFrame(() => data.onMeasure!(rect.width, rect.height));
      });

      resizeObserver.observe(nodeRef.current);

      // Initial measurement
      const rect = nodeRef.current.getBoundingClientRect();
      requestAnimationFrame(() => data.onMeasure!(rect.width, rect.height));

      return () => resizeObserver.disconnect();
    }
  }, [data.onMeasure]);

  const isCompleted = data.status === 'completed' || data.status === 'complete';
  const isInProgress = data.status === 'in-progress';

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div ref={nodeRef} className="relative">

          <Handle
            type="target"
            position={Position.Left}
            className="w-3 h-3 bg-node-objective border-2 border-background"
          />

          <div
            className={cn(
              "rounded-lg border-2 border-blue-400 shadow-lg transition-all duration-500",
              "min-w-[200px] max-w-[300px]",
              isCompleted ? "bg-green-500" : "bg-blue-800",
              isInProgress && "animate-gentle-pulse border-primary/60",
              data.isHighlighted && "ring-4 ring-primary/70 ring-offset-2 ring-offset-background shadow-xl"
            )}
          >
            {/* Header */}
            <div className="p-3">
              <div className="font-bold text-lg text-white flex items-center gap-2">
                <StatusIcon className={cn("w-5 h-5", statusColors[data.status])} />
                <span className="flex-1">{data.label}</span>
                <button
                  className={cn(
                    "h-4 w-4 rounded-full border border-white flex items-center justify-center transition-all duration-200",
                    isCompleted ? "bg-green-500" : "bg-black"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onComplete?.();
                  }}
                >
                  <div className="relative">
                    <Sparkles className="w-2 h-2 text-white absolute" />
                    <Check className="w-2 h-2 text-white" />
                  </div>
                </button>
              </div>
            </div>

            {/* Content: static sub-objectives list */}
            {Array.isArray(data.subObjectives) && data.subObjectives.length > 0 && (
              <div className="bg-blue-900/50 border-t border-blue-600 p-3">
                <ul className="list-disc list-inside space-y-1 relative">
                  {data.subObjectives.map((item) => {
                    const subStatus = (item.status as any) || 'not-started';
                    const subCompleted = subStatus === 'completed' || subStatus === 'complete';
                    const subInProgress = subStatus === 'in-progress';
                    return (
                      <li key={item.id} className={cn("relative text-sm px-1 rounded-sm overflow-hidden",
                        subCompleted ? "bg-green-600/80 text-white" : (subInProgress ? "" : "text-gray-200")
                      )}>
                        {/* Pulsing white overlay for in-progress sub-objectives covering bullet and text */}
                        {subInProgress && (
                          <span className="pointer-events-none absolute inset-0 rounded-sm bg-white animate-highlight-pulse" aria-hidden />
                        )}
                        <span className={cn("relative z-[1] inline-flex items-center gap-2",
                          subInProgress ? "animate-highlight-text" : ""
                        )}>
                          {subCompleted && <Check className="w-3 h-3" />}
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-node-objective border-2 border-background"
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={data.onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Node
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}