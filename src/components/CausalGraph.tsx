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
import { loadLayoutBorders, saveLayoutBorders, LayoutBorderId } from '@/services/layoutPersistence';
import { useToast } from '@/components/ui/use-toast';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const deriveThreePanelSizes = (
  first?: number | null,
  second?: number | null,
  fallback: number[] = [70, 15, 15]
) => {
  const total = 100;
  const safeFirst = clamp(
    typeof first === 'number' && !Number.isNaN(first) ? first : fallback[0],
    5,
    total - 10
  );
  const defaultSecond = safeFirst + fallback[1];
  const safeSecond = clamp(
    typeof second === 'number' && !Number.isNaN(second) ? second : defaultSecond,
    safeFirst + 5,
    total - 5
  );
  return [safeFirst, safeSecond - safeFirst, total - safeSecond];
};

const deriveTwoPanelSizes = (first?: number | null, fallback: number[] = [75, 25]) => {
  const total = 100;
  const safeFirst = clamp(
    typeof first === 'number' && !Number.isNaN(first) ? first : fallback[0],
    5,
    total - 5
  );
  return [safeFirst, total - safeFirst];
};

const DEFAULT_VERTICAL_SIZES: [number, number, number] = [65, 15, 20];
const DEFAULT_TOP_SIZES: [number, number, number] = [70, 15, 15];
const DEFAULT_PROGRESS_SIZES: [number, number] = [75, 25];

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
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);

  const [verticalSizes, setVerticalSizes] = useState<number[]>([...DEFAULT_VERTICAL_SIZES]);
  const [topPanelSizes, setTopPanelSizes] = useState<number[]>([...DEFAULT_TOP_SIZES]);
  const [progressSizes, setProgressSizes] = useState<number[]>([...DEFAULT_PROGRESS_SIZES]);
  const [verticalLayoutKey, setVerticalLayoutKey] = useState(0);
  const [topLayoutKey, setTopLayoutKey] = useState(0);
  const [progressLayoutKey, setProgressLayoutKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hydrateLayout = async () => {
      const records = await loadLayoutBorders();
      if (cancelled) return;

      const vertical = deriveThreePanelSizes(
        records[LayoutBorderId.MainVerticalTop]?.position,
        records[LayoutBorderId.MainVerticalBottom]?.position,
        DEFAULT_VERTICAL_SIZES
      );
      const top = deriveThreePanelSizes(
        records[LayoutBorderId.MainHorizontalGraphTasks]?.position,
        records[LayoutBorderId.MainHorizontalTasksCalendar]?.position,
        DEFAULT_TOP_SIZES
      );
      const progress = deriveTwoPanelSizes(
        records[LayoutBorderId.ProgressHorizontal]?.position,
        DEFAULT_PROGRESS_SIZES
      );

      setVerticalSizes(vertical);
      setTopPanelSizes(top);
      setProgressSizes(progress);
      setVerticalLayoutKey((key) => key + 1);
      setTopLayoutKey((key) => key + 1);
      setProgressLayoutKey((key) => key + 1);
    };

    hydrateLayout();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleVerticalLayout = useCallback((sizes: number[]) => {
    if (!Array.isArray(sizes) || sizes.length < 3) return;
    setVerticalSizes(sizes);
    const first = sizes[0];
    const second = sizes[0] + sizes[1];
    void saveLayoutBorders([
      { border_id: LayoutBorderId.MainVerticalTop, axis: 'y', position: first },
      { border_id: LayoutBorderId.MainVerticalBottom, axis: 'y', position: second },
    ]);
  }, []);

  const handleTopLayout = useCallback((sizes: number[]) => {
    if (!Array.isArray(sizes) || sizes.length < 3) return;
    setTopPanelSizes(sizes);
    const first = sizes[0];
    const second = sizes[0] + sizes[1];
    void saveLayoutBorders([
      { border_id: LayoutBorderId.MainHorizontalGraphTasks, axis: 'x', position: first },
      { border_id: LayoutBorderId.MainHorizontalTasksCalendar, axis: 'x', position: second },
    ]);
  }, []);

  const handleProgressLayout = useCallback((sizes: number[]) => {
    if (!Array.isArray(sizes) || sizes.length < 2) return;
    setProgressSizes(sizes);
    void saveLayoutBorders([
      { border_id: LayoutBorderId.ProgressHorizontal, axis: 'x', position: sizes[0] },
    ]);
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  const highlightNode = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    if (focusTimeoutRef.current) {
      window.clearTimeout(focusTimeoutRef.current);
    }
    focusTimeoutRef.current = window.setTimeout(() => {
      setFocusedNodeId((current) => (current === nodeId ? null : current));
    }, 2000);
  }, []);

  const attemptFocus = useCallback(
    (nodeId: string) => {
      const instance = reactFlowInstance.current;
      if (!instance) return false;
      const targetNode = instance.getNode(nodeId);
      if (!targetNode) return false;
      highlightNode(nodeId);
      instance.fitView({ nodes: [targetNode], duration: 800, padding: 0.3 });
      return true;
    },
    [highlightNode]
  );

  useEffect(() => {
    if (!pendingFocusId) return;

    if (attemptFocus(pendingFocusId)) {
      setPendingFocusId(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      if (attemptFocus(pendingFocusId)) {
        setPendingFocusId(null);
        return;
      }
      toast({
        title: 'Node not found',
        description: 'The selected item could not be located in the current graph.',
      });
      setPendingFocusId(null);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [pendingFocusId, nodes, attemptFocus, toast]);

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
        highlighted: node.id === focusedNodeId,
      },
    };
  });

  // Task panel actions
  const nodesById = useMemo(() => (docData?.nodes || {}) as Record<string, any>, [docData?.nodes]);
  const onToggleComplete = useCallback((id: string) => setNodeStatus(id, 'completed'), [setNodeStatus]);
  const onZoomToNode = useCallback(
    (id: string) => {
      setPendingFocusId(id);
      const graphId = ((docData?.nodes as Record<string, any> | undefined)?.[id]?.graph as string) || 'main';
      if (graphId !== activeGraphId) {
        setActiveGraphId(graphId);
      } else if (attemptFocus(id)) {
        setPendingFocusId(null);
      }
    },
    [docData?.nodes, activeGraphId, setActiveGraphId, attemptFocus]
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
        key={verticalLayoutKey}
        direction="vertical"
        className="h-full w-full"
        onLayout={handleVerticalLayout}
      >
        <ResizablePanel defaultSize={verticalSizes[0]}>
          <ResizablePanelGroup
            key={topLayoutKey}
            direction="horizontal"
            onLayout={handleTopLayout}
            className="h-full"
          >
            {/* Left: Main graph */}
            <ResizablePanel defaultSize={topPanelSizes[0]} minSize={40} className="relative">
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
                  className="bg-card border-border text-foreground p-2 rounded-md [&>button]:w-12 [&>button]:h-12"
                  showZoom={false}
                  showFitView={true}
                  showInteractive={false}
                  style={{ transform: 'scale(0.5)', transformOrigin: 'bottom left', bottom: 8, left: 8 }}
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
                    <ArrowLeft className="w-4 h-4" />
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
                    <RefreshCw className="w-4 h-4" />
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
            <ResizablePanel defaultSize={topPanelSizes[1]} minSize={10} className="relative">
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
            <ResizablePanel defaultSize={topPanelSizes[2]} minSize={10} className="relative">
              <DailyCalendarPanel
                nodesById={nodesById}
                startOfDay={startOfDay}
                endOfDay={endOfDay}
                now={now}
                onSelectNode={onZoomToNode}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={verticalSizes[1]} minSize={10}>
          <ResizablePanelGroup
            key={progressLayoutKey}
            direction="horizontal"
            className="h-full"
            onLayout={handleProgressLayout}
          >
            <ResizablePanel defaultSize={progressSizes[0]} minSize={30}>
              <ProgressGraphPanel history={docData?.historical_progress} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={progressSizes[1]} minSize={20}>
              <StatsPanel history={docData?.historical_progress} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={verticalSizes[2]} minSize={10}>
          <ChatLayout />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}