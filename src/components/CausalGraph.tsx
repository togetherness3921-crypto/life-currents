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
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

type LayoutState = {
  vertical: number[];
  topRow: number[];
  bottomRow: number[];
  chat: number[];
};

const DEFAULT_LAYOUT: LayoutState = {
  vertical: [65, 15, 20],
  topRow: [70, 15, 15],
  bottomRow: [75, 25],
  chat: [20, 80],
};

type LayoutSectionKey = keyof LayoutState;
type LayoutBorderRow = Database['public']['Tables']['layout_borders']['Row'];
type LayoutBorderInsert = Database['public']['Tables']['layout_borders']['Insert'];

const LAYOUT_CACHE_KEY = 'layout_state_cache_v1';

const BORDER_CONFIG: Record<LayoutSectionKey, { axis: 'x' | 'y'; ids: string[] }> = {
  vertical: { axis: 'y', ids: ['vertical_top_split', 'vertical_middle_split'] },
  topRow: { axis: 'x', ids: ['top_graph_task_split', 'top_task_calendar_split'] },
  bottomRow: { axis: 'x', ids: ['bottom_progress_stats_split'] },
  chat: { axis: 'x', ids: ['chat_sidebar_content_split'] },
};

const sizesToPositions = (sizes: number[]): number[] => {
  const positions: number[] = [];
  let total = 0;
  for (let index = 0; index < sizes.length - 1; index += 1) {
    const value = Number(sizes[index]);
    total += Number.isFinite(value) ? value : 0;
    positions.push(total);
  }
  return positions;
};

const positionsToSizes = (positions: number[], fallback: number[]): number[] => {
  const total = fallback.reduce((sum, part) => sum + part, 0);
  const sanitized: number[] = [];
  let previous = 0;
  positions.forEach((raw) => {
    const numeric = Number.isFinite(raw) ? raw : previous;
    const clamped = Math.min(Math.max(numeric, previous), total);
    sanitized.push(clamped - previous);
    previous = clamped;
  });
  sanitized.push(Math.max(total - previous, 0));
  return sanitized;
};

const layoutToBorderUpserts = (layout: LayoutState): LayoutBorderInsert[] => {
  const payload: LayoutBorderInsert[] = [];
  (Object.entries(BORDER_CONFIG) as Array<[LayoutSectionKey, { axis: 'x' | 'y'; ids: string[] }]>).forEach(
    ([section, config]) => {
      const positions = sizesToPositions(layout[section]);
      config.ids.forEach((id, index) => {
        payload.push({
          border_id: id,
          axis: config.axis,
          position: positions[index] ?? 0,
        });
      });
    }
  );
  return payload;
};

const layoutFromBorderRows = (rows: LayoutBorderRow[]): LayoutState => {
  const record = new Map(rows.map((row) => [row.border_id, row]));
  const next: LayoutState = { ...DEFAULT_LAYOUT };

  (Object.entries(BORDER_CONFIG) as Array<[LayoutSectionKey, { axis: 'x' | 'y'; ids: string[] }]>).forEach(
    ([section, config]) => {
      const fallback = DEFAULT_LAYOUT[section];
      const fallbackPositions = sizesToPositions(fallback);
      const positions = config.ids.map((id, index) => {
        const row = record.get(id);
        if (!row || row.axis !== config.axis) {
          return fallbackPositions[index];
        }
        const numeric = Number(row.position);
        if (!Number.isFinite(numeric)) {
          return fallbackPositions[index];
        }
        return numeric;
      });

      const monotonic: number[] = [];
      positions.forEach((value, index) => {
        const previous = index === 0 ? 0 : monotonic[index - 1];
        const total = fallback.reduce((sum, part) => sum + part, 0);
        let current = value;
        if (!Number.isFinite(current)) {
          current = fallbackPositions[index];
        }
        if (current < previous) {
          current = previous;
        }
        if (current > total) {
          current = total;
        }
        monotonic.push(current);
      });

      next[section] = normalizeSection(positionsToSizes(monotonic, fallback), fallback);
    }
  );

  return next;
};

const normalizeSection = (value: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(value) || value.length !== fallback.length) {
    return [...fallback];
  }
  const sanitized = value.map((entry) => {
    const num = Number(entry);
    return Number.isFinite(num) ? num : 0;
  });
  return sanitized;
};

const normalizeLayout = (input?: Partial<LayoutState>): LayoutState => ({
  vertical: normalizeSection(input?.vertical, DEFAULT_LAYOUT.vertical),
  topRow: normalizeSection(input?.topRow, DEFAULT_LAYOUT.topRow),
  bottomRow: normalizeSection(input?.bottomRow, DEFAULT_LAYOUT.bottomRow),
  chat: normalizeSection(input?.chat, DEFAULT_LAYOUT.chat),
});

const nodeTypes = {
  startNode: StartNode,
  objectiveNode: ObjectiveNode,
  milestoneNode: MilestoneNode,
  validationNode: ValidationNode,
  goalNode: GoalNode,
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
  const { now, dayKey, startOfDay, endOfDay } = useTodayTime(60000);
  const { toast } = useToast();
  const highlightTimeoutRef = useRef<number | null>(null);
  const layoutSyncTimerRef = useRef<number | null>(null);
  const layoutLoadedRef = useRef(false);
  const [layoutState, setLayoutState] = useState<LayoutState>(() => {
    if (typeof window === 'undefined') {
      return normalizeLayout();
    }
    try {
      const raw = window.localStorage.getItem(LAYOUT_CACHE_KEY);
      return normalizeLayout(raw ? JSON.parse(raw) : undefined);
    } catch (error) {
      console.warn('[Layout] Failed to read cached layout state', error);
      return normalizeLayout();
    }
  });
  const layoutStateRef = useRef<LayoutState>(layoutState);
  const [layoutRevision, setLayoutRevision] = useState(0);

  useEffect(() => {
    layoutStateRef.current = layoutState;
  }, [layoutState]);

  const scheduleLayoutSync = useCallback((nextLayout: LayoutState) => {
    if (!layoutLoadedRef.current) return;
    if (layoutSyncTimerRef.current) {
      window.clearTimeout(layoutSyncTimerRef.current);
    }
    layoutSyncTimerRef.current = window.setTimeout(async () => {
      try {
        const payload = layoutToBorderUpserts(nextLayout);
        if (payload.length === 0) return;
        const { error } = await supabase.from('layout_borders').upsert(payload);
        if (error) throw error;
      } catch (error) {
        console.error('[Layout] Failed to persist layout to Supabase', error);
      }
    }, 400);
  }, []);

  const updateLayoutSection = useCallback(
    (section: keyof LayoutState, values: number[]) => {
      setLayoutState((prev) => {
        const sanitized = normalizeSection(values, DEFAULT_LAYOUT[section]);
        const next = { ...prev, [section]: sanitized };
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(next));
          } catch (error) {
            console.warn('[Layout] Failed to cache layout locally', error);
          }
        }
        scheduleLayoutSync(next);
        return next;
      });
    },
    [scheduleLayoutSync]
  );

  useEffect(() => {
    let isMounted = true;
    const fetchLayout = async () => {
      try {
        const { data, error } = await supabase
          .from('layout_borders')
          .select('border_id, axis, position');
        if (error) throw error;
        if (!isMounted) return;

        if (data && data.length > 0) {
          const remote = layoutFromBorderRows(data as LayoutBorderRow[]);
          setLayoutState(remote);
          setLayoutRevision((rev) => rev + 1);
        } else {
          const payload = layoutToBorderUpserts(layoutStateRef.current);
          if (payload.length > 0) {
            const { error: upsertError } = await supabase
              .from('layout_borders')
              .upsert(payload);
            if (upsertError) throw upsertError;
          }
        }
      } catch (error) {
        console.error('[Layout] Failed to load layout from Supabase', error);
      } finally {
        if (isMounted) {
          layoutLoadedRef.current = true;
        }
      }
    };

    fetchLayout();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(layoutState));
    } catch (error) {
      console.warn('[Layout] Failed to persist layout snapshot locally', error);
    }
  }, [layoutState]);

  useEffect(() => () => {
    if (layoutSyncTimerRef.current) {
      window.clearTimeout(layoutSyncTimerRef.current);
    }
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
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
  const onZoomToNode = useCallback((id: string) => {
    if (!reactFlowInstance.current) return;
    const instance = reactFlowInstance.current;
    const node = instance.getNode(id);
    if (!node) {
      toast({
        title: 'Node not found',
        description: 'The selected item is not part of the current graph view.',
      });
      return;
    }

    instance.fitView({ nodes: [node], duration: 800, padding: 0.3 });
    setNodes((prev) =>
      prev.map((existing) => ({
        ...existing,
        selected: existing.id === id,
      }))
    );

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setNodes((prev) =>
        prev.map((existing) =>
          existing.id === id
            ? { ...existing, selected: false }
            : existing
        )
      );
    }, 1600);
  }, [setNodes, toast]);

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
        key={`vertical-${layoutRevision}`}
        direction="vertical"
        onLayout={(sizes) => updateLayoutSection('vertical', sizes)}
        className="h-full w-full"
      >
        <ResizablePanel defaultSize={layoutState.vertical[0]}>
          <ResizablePanelGroup
            key={`top-${layoutRevision}`}
            direction="horizontal"
            onLayout={(sizes) => updateLayoutSection('topRow', sizes)}
            className="h-full"
          >
            {/* Left: Main graph */}
            <ResizablePanel defaultSize={layoutState.topRow[0]} minSize={40} className="relative">
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
                  className="bg-card border-border text-foreground p-2 [&>button]:w-10 [&>button]:h-10 [&>button]:rounded-md"
                  showZoom={false}
                  showFitView={true}
                  showInteractive={false}
                  style={{ transform: 'scale(0.5)', transformOrigin: 'bottom left', bottom: 6, left: 6 }}
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
            <ResizablePanel defaultSize={layoutState.topRow[1]} minSize={10} className="relative">
              <DailyTaskPanel
                nodesById={nodesById}
                onToggleComplete={onToggleComplete}
                onZoomToNode={onZoomToNode}
                startOfDay={startOfDay}
                endOfDay={endOfDay}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />

            {/* Right: Daily calendar view */}
            <ResizablePanel defaultSize={layoutState.topRow[2]} minSize={10} className="relative">
              <DailyCalendarPanel
                nodesById={nodesById}
                startOfDay={startOfDay}
                endOfDay={endOfDay}
                now={now}
                onZoomToNode={onZoomToNode}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={layoutState.vertical[1]} minSize={10}>
          <ResizablePanelGroup
            key={`bottom-${layoutRevision}`}
            direction="horizontal"
            onLayout={(sizes) => updateLayoutSection('bottomRow', sizes)}
            className="h-full"
          >
            <ResizablePanel defaultSize={layoutState.bottomRow[0]} minSize={30}>
              <ProgressGraphPanel history={docData?.historical_progress} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={layoutState.bottomRow[1]} minSize={20}>
              <StatsPanel history={docData?.historical_progress} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={layoutState.vertical[2]} minSize={10}>
          <ChatLayout
            layoutKey={layoutRevision}
            sidebarSize={layoutState.chat[0]}
            contentSize={layoutState.chat[1]}
            onLayout={(sizes) => updateLayoutSection('chat', sizes)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}