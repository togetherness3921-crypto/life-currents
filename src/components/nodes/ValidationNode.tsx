import { Handle, Position } from '@xyflow/react';
import { CheckSquare, Trash2, Sparkles, Check } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface ValidationNodeData {
  label: string;
  isActive?: boolean;
  status?: string;
  onDelete?: () => void;
  onComplete?: () => void;
  onMeasure?: (width: number, height: number) => void;
  isHighlighted?: boolean;
}

export default function ValidationNode({ data }: { data: ValidationNodeData }) {
  const nodeRef = useRef<HTMLDivElement>(null);

  // Measure node dimensions after render
  useEffect(() => {
    if (nodeRef.current && data.onMeasure) {
      const resizeObserver = new ResizeObserver(() => {
        if (!nodeRef.current || !data.onMeasure) return;
        const rect = nodeRef.current.getBoundingClientRect();
        requestAnimationFrame(() => data.onMeasure!(rect.width, rect.height));
      });

      resizeObserver.observe(nodeRef.current);

      // Initial measurement
      const rect = nodeRef.current.getBoundingClientRect();
      requestAnimationFrame(() => data.onMeasure!(rect.width, rect.height));

      return () => resizeObserver.disconnect();
    }
  }, [data.onMeasure]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div ref={nodeRef} className="relative">

          <Handle
            type="target"
            position={Position.Left}
            className="w-3 h-3 bg-node-validation border-2 border-background"
          />

          <div className={cn(
            "rounded-lg p-4 border-2 border-node-validation/20 shadow-lg min-w-[180px] hover:shadow-xl hover:scale-105 transition-all duration-500",
            (data.status === 'completed') ? "bg-green-500" : "bg-node-validation",
            (data.status === 'in-progress') && "animate-gentle-pulse border-primary/60",
            data.isHighlighted && "ring-4 ring-primary/70 ring-offset-2 ring-offset-background"
          )}>
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-white" />
              <span className="text-white font-medium text-sm flex-1">{data.label}</span>
              <button
                className={cn(
                  "h-4 w-4 rounded-full border border-white flex items-center justify-center transition-all duration-200",
                  (data.status === 'completed') ? "bg-green-500" : "bg-black"
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

          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-node-validation border-2 border-background"
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