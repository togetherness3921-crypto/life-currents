import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../custom-styles.css';

import ObjectiveNode from './nodes/ObjectiveNode';
import StartNode from './nodes/StartNode';
import MilestoneNode from './nodes/MilestoneNode';
import ValidationNode from './nodes/ValidationNode';
import GoalNode from './nodes/GoalNode';
import { Button } from './ui/button';
import { RefreshCw, Loader2, ArrowLeft } from 'lucide-react';
import { useGraphData } from '@/hooks/useGraphData';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import DailyTaskPanel from './DailyTaskPanel';
import DailyCalendarPanel from './DailyCalendarPanel';
import { useTodayTime } from '@/hooks/useTodayTime';
import ProgressGraphPanel from './ProgressGraphPanel';
import StatsPanel from './StatsPanel';
import ChatLayout from './chat/ChatLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

const nodeTypes = {
  startNode: StartNode,
  objectiveNode: ObjectiveNode,
  milestoneNode: MilestoneNode,
  validationNode: ValidationNode,
  goalNode: GoalNode,
};

const DEFAULT_TOP_LAYOUT = [70, 15, 15] as const;
const DEFAULT_MAIN_VERTICAL_LAYOUT = [65, 15, 20] as const;
const DEFAULT_STATS_LAYOUT = [75, 25] as const;

const TOP_LAYOUT_STORAGE_KEY = 'layout_top_horizontal';
const MAIN_VERTICAL_STORAGE_KEY = 'layout_main_vertical';
const STATS_LAYOUT_STORAGE_KEY = 'layout_stats_horizontal';
const LAYOUT_PENDING_KEY = 'layout_border_pending';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readLayoutSizes = (key: string, fallback: readonly number[]) => {
  if (!isBrowser) return [...fallback];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === fallback.length) {
      return parsed.map((value) => Number(value) || 0);
    }
  } catch (error) {
    console.warn('[Layout] Failed to parse layout sizes', key, error);
  }
  return [...fallback];
};

const writeLayoutSizes = (key: string, sizes: number[]) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(sizes));
  } catch (error) {
    console.warn('[Layout] Failed to persist layout sizes', key, error);
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const computeTopSizesFromPositions = (
  first: number | undefined,
  second: number | undefined,
  fallback: number[],
) => {
  if (typeof first !== 'number' || Number.isNaN(first) || typeof second !== 'number' || Number.isNaN(second)) {
    return [...fallback];
  }
  let pos1 = clamp(first, 5, 90);
  let pos2 = clamp(second, pos1 + 5, 95);
  if (pos2 <= pos1 + 5) pos2 = pos1 + 5;
  if (pos2 >= 95) pos2 = 95;
  const left = pos1;
  const middle = clamp(pos2 - pos1, 5, 90);
  let right = 100 - left - middle;
  if (right < 5) {
    const deficit = 5 - right;
    const adjustedMiddle = clamp(middle - deficit, 5, 90);
    return [left, adjustedMiddle, 100 - left - adjustedMiddle];
  }
  return [left, middle, right];
};

const computeVerticalSizesFromPositions = (
  first: number | undefined,
  second: number | undefined,
  fallback: number[],
) => {
  if (typeof first !== 'number' || Number.isNaN(first) || typeof second !== 'number' || Number.isNaN(second)) {
    return [...fallback];
  }
  let pos1 = clamp(first, 5, 90);
  let pos2 = clamp(second, pos1 + 5, 95);
  if (pos2 <= pos1 + 5) pos2 = pos1 + 5;
  if (pos2 >= 95) pos2 = 95;
  const top = pos1;
  const middle = clamp(pos2 - pos1, 5, 90);
  let bottom = 100 - top - middle;
  if (bottom < 5) {
    const deficit = 5 - bottom;
    const adjustedMiddle = clamp(middle - deficit, 5, 90);
    return [top, adjustedMiddle, 100 - top - adjustedMiddle];
  }
  return [top, middle, bottom];
};

const computeStatsSizesFromPosition = (position: number | undefined, fallback: number[]) => {
  if (typeof position !== 'number' || Number.isNaN(position)) {
    return [...fallback];
  }
  const left = clamp(position, 10, 90);
  return [left, 100 - left];
};

export default function CausalGraph() {
  const {
    nodes: graphNodes,
    edges: graphEdges,
    loading,
    activeGraphId,
    viewportState,
    docData,
    layoutReady,
    measuredNodes,
    nodeToGraphMap,

    updateNodeCompletion,
    setNodeStatus,
    setActiveGraphId,
    updateViewportState,
    deleteNode,
    addRelationship,
    calculateAutoLayout,
    handleNodeMeasure
  } = useGraphData();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const pendingAutoFitRef = useRef(false);
  const fitCancelledRef = useRef(false);
  const targetFitGraphIdRef = useRef<string | null>(null);
  const prevMainViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const restoreOnBackRef = useRef(false);
  const { now, startOfDay, endOfDay } = useTodayTime(60000);
  const { toast } = useToast();

  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const [topLayout, setTopLayout] = useState<number[]>(() => readLayoutSizes(TOP_LAYOUT_STORAGE_KEY, DEFAULT_TOP_LAYOUT));
  const [mainVerticalLayout, setMainVerticalLayout] = useState<number[]>(() => readLayoutSizes(MAIN_VERTICAL_STORAGE_KEY, DEFAULT_MAIN_VERTICAL_LAYOUT));
  const [statsLayout, setStatsLayout] = useState<number[]>(() => readLayoutSizes(STATS_LAYOUT_STORAGE_KEY, DEFAULT_STATS_LAYOUT));
  const [layoutVersion, setLayoutVersion] = useState(0);

  const initialPendingLayout = useMemo(() => {
    if (!isBrowser) return {} as Record<string, { axis: 'x' | 'y'; position: number }>;
    try {
      const raw = window.localStorage.getItem(LAYOUT_PENDING_KEY);
      if (!raw) return {} as Record<string, { axis: 'x' | 'y'; position: number }>;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return {} as Record<string, { axis: 'x' | 'y'; position: number }>;
      const result: Record<string, { axis: 'x' | 'y'; position: number }> = {};
      parsed.forEach((row: any) => {
        if (!row || typeof row.border_id !== 'string') return;
        const axis: 'x' | 'y' = row.axis === 'y' ? 'y' : 'x';
        const position = Number(row.position);
        if (!Number.isNaN(position)) {
          result[row.border_id] = { axis, position };
        }
      });
      return result;
    } catch (error) {
      console.warn('[Layout] Failed to parse pending layout operations', error);
      return {} as Record<string, { axis: 'x' | 'y'; position: number }>;
    }
  }, []);

  const pendingLayoutRef = useRef<Record<string, { axis: 'x' | 'y'; position: number }>>(initialPendingLayout);
  const layoutFlushTimerRef = useRef<number | null>(null);

  const persistPendingLayoutToStorage = useCallback(() => {
    if (!isBrowser) return;
    const entries = Object.entries(pendingLayoutRef.current).map(([border_id, data]) => ({
      border_id,
      axis: data.axis,
      position: data.position,
    }));
    if (entries.length > 0) {
      window.localStorage.setItem(LAYOUT_PENDING_KEY, JSON.stringify(entries));
    } else {
      window.localStorage.removeItem(LAYOUT_PENDING_KEY);
    }
  }, []);

  const flushLayoutUpdates = useCallback(async () => {
    if (!navigator.onLine) {
      persistPendingLayoutToStorage();
      return;
    }
    const entries = Object.entries(pendingLayoutRef.current);
    if (entries.length === 0) return;
    const payload = entries.map(([border_id, data]) => ({
      border_id,
      axis: data.axis,
      position: data.position,
    }));
    try {
      const { error } = await (supabase as any)
        .from('layout_borders')
        .upsert(payload, { onConflict: 'border_id' });
      if (error) throw error;
      pendingLayoutRef.current = {};
      persistPendingLayoutToStorage();
    } catch (error) {
      console.error('[Layout] Failed to persist layout borders', error);
      persistPendingLayoutToStorage();
    }
  }, [persistPendingLayoutToStorage]);

  const queueBorderUpdates = useCallback(
    (updates: Array<{ id: string; axis: 'x' | 'y'; position: number }>) => {
      updates.forEach(({ id, axis, position }) => {
        pendingLayoutRef.current[id] = { axis, position };
      });
      persistPendingLayoutToStorage();
      if (layoutFlushTimerRef.current) {
        window.clearTimeout(layoutFlushTimerRef.current);
      }
      layoutFlushTimerRef.current = window.setTimeout(() => {
        layoutFlushTimerRef.current = null;
        flushLayoutUpdates();
      }, 400);
    },
    [flushLayoutUpdates, persistPendingLayoutToStorage],
  );

  useEffect(() => {
    return () => {
      if (layoutFlushTimerRef.current) {
        window.clearTimeout(layoutFlushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (Object.keys(pendingLayoutRef.current).length > 0) {
      flushLayoutUpdates();
    }
  }, [flushLayoutUpdates]);

  useEffect(() => {
    const handleOnline = () => flushLayoutUpdates();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushLayoutUpdates]);

  const topLayoutRef = useRef(topLayout);
  const mainVerticalLayoutRef = useRef(mainVerticalLayout);
  const statsLayoutRef = useRef(statsLayout);

  useEffect(() => {
    topLayoutRef.current = topLayout;
  }, [topLayout]);

  useEffect(() => {
    mainVerticalLayoutRef.current = mainVerticalLayout;
  }, [mainVerticalLayout]);

  useEffect(() => {
    statsLayoutRef.current = statsLayout;
  }, [statsLayout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('layout_borders')
          .select('border_id, axis, position');
        if (error) throw error;
        if (!data || cancelled) return;
        const map = new Map<string, number>();
        data.forEach((row: any) => {
          if (!row || typeof row.border_id !== 'string') return;
          const position = Number(row.position);
          if (!Number.isNaN(position)) {
            map.set(row.border_id, position);
          }
        });
        const nextTop = computeTopSizesFromPositions(
          map.get('top-horizontal-1'),
          map.get('top-horizontal-2'),
          topLayoutRef.current,
        );
        const nextMain = computeVerticalSizesFromPositions(
          map.get('main-vertical-1'),
          map.get('main-vertical-2'),
          mainVerticalLayoutRef.current,
        );
        const nextStats = computeStatsSizesFromPosition(
          map.get('stats-horizontal-1'),
          statsLayoutRef.current,
        );
        if (cancelled) return;
        setTopLayout(nextTop);
        setMainVerticalLayout(nextMain);
        setStatsLayout(nextStats);
        writeLayoutSizes(TOP_LAYOUT_STORAGE_KEY, nextTop);
        writeLayoutSizes(MAIN_VERTICAL_STORAGE_KEY, nextMain);
        writeLayoutSizes(STATS_LAYOUT_STORAGE_KEY, nextStats);
        setLayoutVersion((version) => version + 1);
      } catch (error) {
        console.error('[Layout] Failed to load layout borders', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logViewport = useCallback((label: string) => {
    const inst = reactFlowInstance.current as any;
    if (inst && typeof inst.getViewport === 'function') {
      const vp = inst.getViewport();
      // eslint-disable-next-line no-console
      console.log(`[Viewport] ${label}`, vp);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Viewport] ${label} (no getViewport available)`);
    }
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      // Update local state
      setEdges((eds) => addEdge(params, eds));
      // Persist to database
      if (params.source && params.target) {
        addRelationship(params.source, params.target);
      }
    },
    [setEdges, addRelationship]
  );

  // Manual positioning disabled - auto-layout handles all positioning

  // Note: toggleNodeExpansion removed as expansion is no longer needed

  const onNodeComplete = useCallback((nodeId: string) => {
    updateNodeCompletion(nodeId);

    // Find next node using parent relationships and pan to it
    if (docData?.nodes) {
      const nextNodeId = Object.keys(docData.nodes).find(id => docData.nodes[id].parents?.includes(nodeId));

      if (nextNodeId) {
        // Pan to next node after a short delay
        setTimeout(() => {
          if (reactFlowInstance.current) {
            const nextNode = reactFlowInstance.current.getNode(nextNodeId);
            if (nextNode) {
              reactFlowInstance.current.fitView({
                nodes: [nextNode],
                duration: 800,
                padding: 0.3,
              });
            }
          }
        }, 100);
      }
    }
  }, [updateNodeCompletion, docData]);

  // Save viewport changes
  const onMove = useCallback((event: any, viewport: any) => {
    //
  }, []);

  // Update nodes when graph data changes
  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const containerIds = useMemo(() => new Set<string>(Object.values(nodeToGraphMap || {})), [nodeToGraphMap]);

  const onNodeClick = useCallback((_: any, node: any) => {
    const isContainer = containerIds.has(node.id);
    if (!isContainer) return;
    // Smooth zoom into the container before swapping content
    if (reactFlowInstance.current) {
      const inst = reactFlowInstance.current as any;
      // Save current main viewport BEFORE any pre-enter zoom happens
      if (activeGraphId === 'main' && typeof inst.getViewport === 'function') {
        const vp = inst.getViewport();
        prevMainViewportRef.current = { x: vp.x, y: vp.y, zoom: vp.zoom };
        console.log('[Fit] Saved main viewport before entering subgraph', prevMainViewportRef.current);
      }
      const rfNode = inst.getNode(node.id);
      if (rfNode) {
        console.log('[Fit] Pre-enter zoom to container', node.id);
        logViewport('before pre-enter fit');
        inst.fitView({ nodes: [rfNode], duration: 500, padding: 0.2 });
        setTimeout(() => logViewport('after pre-enter fit'), 520);
      }
    }
    // Mark that after subgraph mounts we should auto-fit entire subgraph
    targetFitGraphIdRef.current = node.id;
    pendingAutoFitRef.current = true;
    // Switch active graph after a short delay to allow animation
    setTimeout(() => {
      console.log('[Graph] Entering subgraph', node.id);
      setActiveGraphId(node.id);
    }, 520);
  }, [containerIds, setActiveGraphId, activeGraphId, logViewport]);

  // After nodes/edges update (graph mounted), do an automatic fit view or restore
  useEffect(() => {
    if (!pendingAutoFitRef.current || !reactFlowInstance.current) return;
    fitCancelledRef.current = false;

    const tryFit = () => {
      if (fitCancelledRef.current || !reactFlowInstance.current) return;
      const targetGraph = targetFitGraphIdRef.current;
      if (!targetGraph) {
        console.log('[Fit] No target graph; cancelling auto-fit');
        pendingAutoFitRef.current = false;
        restoreOnBackRef.current = false;
        return;
      }
      if (activeGraphId !== targetGraph) {
        console.log('[Fit] Waiting for activeGraphId to match target', { activeGraphId, targetGraph });
        return setTimeout(tryFit, 80);
      }
      // EARLY RESTORE for Back: if returning to main and we have a saved viewport, restore immediately
      if (targetGraph === 'main' && restoreOnBackRef.current && prevMainViewportRef.current) {
        const instance = reactFlowInstance.current;
        const prev = prevMainViewportRef.current;
        console.log('[Fit] Restoring previous main viewport (early)', prev);
        logViewport('before restore (early)');
        instance.setViewport(prev);
        setTimeout(() => logViewport('after restore (early)'), 50);
        pendingAutoFitRef.current = false;
        targetFitGraphIdRef.current = null;
        restoreOnBackRef.current = false;
        return;
      }
      const instance = reactFlowInstance.current;
      const rfNodes = instance.getNodes();
      const currentIds = new Set(nodes.map(n => n.id));
      const subgraphNodes = rfNodes.filter(n => currentIds.has(n.id));
      // Positions are precomputed; just require nodes present
      const ready = subgraphNodes.length > 0;
      console.log('[Fit] tryFit', {
        activeGraphId,
        rfNodeCount: rfNodes.length,
        displayedNodeCount: nodes.length,
        subgraphNodeCount: subgraphNodes.length,
        layoutReady,
        subgraphIds: subgraphNodes.map(n => n.id)
      });

      if (ready) {
        if (activeGraphId === 'main' && restoreOnBackRef.current && prevMainViewportRef.current) {
          const prev = prevMainViewportRef.current;
          console.log('[Fit] Restoring previous main viewport', prev);
          logViewport('before restore');
          instance.setViewport(prev);
          // Optionally persist
          setTimeout(() => logViewport('after restore'), 50);
          restoreOnBackRef.current = false;
          pendingAutoFitRef.current = false;
          targetFitGraphIdRef.current = null;
        } else {
          console.log('[Fit] Auto-fit subgraph', activeGraphId, 'nodeCount=', subgraphNodes.length);
          logViewport('before subgraph fit');
          instance.fitView({ nodes: subgraphNodes as any, duration: 600, padding: 0.2 });
          pendingAutoFitRef.current = false;
          targetFitGraphIdRef.current = null;
          restoreOnBackRef.current = false;
          setTimeout(() => logViewport('after subgraph fit'), 650);
        }
      } else {
        setTimeout(tryFit, 120);
      }
    };

    // small delay to allow DOM mount before first attempt
    const t = setTimeout(tryFit, 80);
    return () => {
      fitCancelledRef.current = true;
      clearTimeout(t);
    };
  }, [nodes, edges, activeGraphId, layoutReady]);

  // Compute sub-objectives (children whose graph equals this node.id) and pass into ObjectiveNode as props
  const allDocNodes = (docData?.nodes || {}) as Record<string, any>;
  const nodesWithActions = nodes.map((node) => {
    let subObjectives: Array<{ id: string; label: string; status?: string }> | undefined = undefined;
    const subs = Object.entries(allDocNodes)
      .filter(([id]) => (nodeToGraphMap || {})[id] === node.id)
      .map(([id, n]) => ({ id, label: (n as any)?.label || id, status: (n as any)?.status || 'not-started' }));
    if (subs.length > 0) subObjectives = subs;
    return {
      ...node,
      data: {
        ...node.data,
        isHighlighted: highlightedNodeId === node.id,
        subObjectives,
        onDelete: () => deleteNode(node.id),
        onComplete: () => onNodeComplete(node.id),
        onMeasure: (width: number, height: number) => handleNodeMeasure(node.id, width, height),
      },
    };
  });

  // Task panel actions
  const nodesById = useMemo(() => (docData?.nodes || {}) as Record<string, any>, [docData?.nodes]);
  const onToggleComplete = useCallback((id: string) => setNodeStatus(id, 'completed'), [setNodeStatus]);
  const handleTopLayoutChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length !== 3) return;
      setTopLayout(sizes);
      writeLayoutSizes(TOP_LAYOUT_STORAGE_KEY, sizes);
      queueBorderUpdates([
        { id: 'top-horizontal-1', axis: 'x', position: sizes[0] },
        { id: 'top-horizontal-2', axis: 'x', position: sizes[0] + sizes[1] },
      ]);
    },
    [queueBorderUpdates],
  );

  const handleMainVerticalLayoutChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length !== 3) return;
      setMainVerticalLayout(sizes);
      writeLayoutSizes(MAIN_VERTICAL_STORAGE_KEY, sizes);
      queueBorderUpdates([
        { id: 'main-vertical-1', axis: 'y', position: sizes[0] },
        { id: 'main-vertical-2', axis: 'y', position: sizes[0] + sizes[1] },
      ]);
    },
    [queueBorderUpdates],
  );

  const handleStatsLayoutChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length !== 2) return;
      setStatsLayout(sizes);
      writeLayoutSizes(STATS_LAYOUT_STORAGE_KEY, sizes);
      queueBorderUpdates([{ id: 'stats-horizontal-1', axis: 'x', position: sizes[0] }]);
    },
    [queueBorderUpdates],
  );

  const focusNodeById = useCallback(
    (id: string) => {
      if (!reactFlowInstance.current) return false;
      const node = reactFlowInstance.current.getNode(id);
      if (!node) return false;
      reactFlowInstance.current.fitView({ nodes: [node], duration: 600, padding: 0.3 });
      setHighlightedNodeId(id);
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedNodeId(null);
        highlightTimeoutRef.current = null;
      }, 1600);
      return true;
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHighlightedNodeId(null);
  }, [activeGraphId]);

  const handleSurfaceSelect = useCallback(
    (id: string) => {
      if (!focusNodeById(id)) {
        toast({
          title: 'Node not found',
          description: 'We could not locate that item in the current graph.',
        });
      }
    },
    [focusNodeById, toast],
  );

  if (loading) {
    return (
      <div className="w-full h-[100dvh] bg-graph-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading graph...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[100dvh] bg-graph-background">
      <ResizablePanelGroup
        key={`main-${layoutVersion}`}
        direction="vertical"
        className="h-full w-full"
        onLayout={handleMainVerticalLayoutChange}
      >
        <ResizablePanel defaultSize={mainVerticalLayout[0]}>
          <ResizablePanelGroup
            key={`top-${layoutVersion}`}
            direction="horizontal"
            onLayout={handleTopLayoutChange}
            className="h-full"
          >
            {/* Left: Main graph */}
            <ResizablePanel defaultSize={topLayout[0]} minSize={40} className="relative">
              <ReactFlow
                nodes={nodesWithActions}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodesDraggable={false}
                onMove={onMove}
                nodeTypes={nodeTypes}
                onInit={(instance) => {
                  reactFlowInstance.current = instance;
                  // Restore viewport state after initialization
                  setTimeout(() => {
                    if (viewportState && (viewportState.x !== 0 || viewportState.y !== 0 || viewportState.zoom !== 1)) {
                      instance.setViewport(viewportState);
                    }
                  }, 100);
                }}
                fitView={!(viewportState.x !== 0 || viewportState.y !== 0 || viewportState.zoom !== 1)}
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.01}
                maxZoom={4}
                defaultEdgeOptions={{
                  animated: true,
                  style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
                }}
              >
                <Controls
                  className="bg-card border-border text-foreground p-1 scale-[0.5] origin-bottom-left [&>button]:w-12 [&>button]:h-12 [&>button]:rounded-md"
                  style={{ bottom: 8, left: 8 }}
                  showZoom={false}
                  showFitView={true}
                  showInteractive={false}
                >
                  <Button
                    onClick={() => {
                      if (activeGraphId !== 'main') {
                        console.log('[Graph] Back to main requested');
                        targetFitGraphIdRef.current = 'main';
                        restoreOnBackRef.current = true;
                        pendingAutoFitRef.current = true;
                        setActiveGraphId('main');
                      }
                    }}
                    variant="outline"
                    size="icon"
                    className="bg-background border-border"
                    disabled={activeGraphId === 'main'}
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={() => {
                      // Force cache bypass and fresh reload
                      if ('caches' in window) {
                        caches.keys().then(names => {
                          names.forEach(name => caches.delete(name));
                        });
                      }
                      // Cache-busting reload
                      window.location.href = window.location.href + '?_t=' + Date.now();
                    }}
                    variant="outline"
                    size="icon"
                    className="bg-background border-border"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </Controls>
                <Background
                  color="hsl(var(--graph-grid))"
                  gap={20}
                  size={1}
                  className="bg-graph-background"
                />
              </ReactFlow>
            </ResizablePanel>
            <ResizableHandle withHandle />

            {/* Middle: Daily task checklist */}
            <ResizablePanel defaultSize={topLayout[1]} minSize={10} className="relative">
              <DailyTaskPanel
                nodesById={nodesById}
                onToggleComplete={onToggleComplete}
                onSelectNode={handleSurfaceSelect}
                startOfDay={startOfDay}
                endOfDay={endOfDay}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />

            {/* Right: Daily calendar view */}
            <ResizablePanel defaultSize={topLayout[2]} minSize={10} className="relative">
              <DailyCalendarPanel
                nodesById={nodesById}
                startOfDay={startOfDay}
                endOfDay={endOfDay}
                now={now}
                onSelect={handleSurfaceSelect}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={mainVerticalLayout[1]} minSize={10}>
          <ResizablePanelGroup
            key={`stats-${layoutVersion}`}
            direction="horizontal"
            className="h-full"
            onLayout={handleStatsLayoutChange}
          >
            <ResizablePanel defaultSize={statsLayout[0]} minSize={30}>
              <ProgressGraphPanel history={docData?.historical_progress} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={statsLayout[1]} minSize={20}>
              <StatsPanel history={docData?.historical_progress} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={mainVerticalLayout[2]} minSize={10}>
          <ChatLayout />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}