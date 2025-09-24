import { Handle, Position } from '@xyflow/react';
import { Play, Trash2, Sparkles, Check } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface StartNodeData {
  label: string; 
  isActive?: boolean;
  status?: string;
  onDelete?: () => void;
  onComplete?: () => void;
  onMeasure?: (width: number, height: number) => void;
}

export default function StartNode({ data }: { data: StartNodeData }) {
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

          <div className={cn(
            "rounded-full w-32 h-32 flex items-center justify-center border-4 border-node-start/20 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-500",
            (data.status === 'completed') ? "bg-green-500" : "bg-node-start",
            (data.status === 'in-progress') && "animate-gentle-pulse border-primary/60"
          )}>
            <div className="text-center relative">
              <Play className="w-6 h-6 text-white mb-2 mx-auto" />
              <div className="text-white font-bold text-sm leading-tight">{data.label}</div>
              <button
                className={cn(
                  "absolute -top-2 -right-6 h-4 w-4 rounded-full border border-white flex items-center justify-center transition-all duration-200",
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
            className="w-4 h-4 bg-node-start border-2 border-background"
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