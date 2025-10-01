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
import { useToast } from '@/hooks/use-toast';
import { LayoutPersistenceProvider } from '@/hooks/layoutPersistenceProvider';
import { useLayoutPersistence } from '@/hooks/useLayoutPersistence';
import { computeLayoutFromBorders, persistLayoutToBorders } from '@/lib/layoutPersistence';
import { DEFAULT_LAYOUT_BORDERS } from '@/constants/layout';

const nodeTypes = {
  startNode: StartNode,
  objectiveNode: ObjectiveNode,
  milestoneNode: MilestoneNode,
  validationNode: ValidationNode,
  goalNode: GoalNode,
};

export default function CausalGraph() {
  return (
    <LayoutPersistenceProvider initialDefaults={DEFAULT_LAYOUT_BORDERS}>
      <CausalGraphContent />
    </LayoutPersistenceProvider>
  );
}

const TOP_HORIZONTAL_HANDLES = ['main-horizontal-1', 'main-horizontal-2'];
const MAIN_VERTICAL_HANDLES = ['main-vertical-1', 'main-vertical-2'];
const BOTTOM_HORIZONTAL_HANDLES = ['progress-horizontal-1'];

const CausalGraphContent = () => {
  const { toast } = useToast();
  const { borders, setBorderPosition } = useLayoutPersistence();
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

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

  const topHorizontalLayout = useMemo(
    () => computeLayoutFromBorders(TOP_HORIZONTAL_HANDLES, borders),
    [borders]
  );
  const mainVerticalLayout = useMemo(
    () => computeLayoutFromBorders(MAIN_VERTICAL_HANDLES, borders),
    [borders]
  );
  const bottomHorizontalLayout = useMemo(
    () => computeLayoutFromBorders(BOTTOM_HORIZONTAL_HANDLES, borders),
    [borders]
  );

  const handleTopHorizontalLayout = useCallback(
    (layout: number[]) => {
      void persistLayoutToBorders(layout, TOP_HORIZONTAL_HANDLES, 'x', setBorderPosition);
    },
    [setBorderPosition]
  );

  const handleMainVerticalLayout = useCallback(
    (layout: number[]) => {
      void persistLayoutToBorders(layout, MAIN_VERTICAL_HANDLES, 'y', setBorderPosition);
    },
    [setBorderPosition]
  );

  const handleBottomHorizontalLayout = useCallback(
    (layout: number[]) => {
      void persistLayoutToBorders(layout, BOTTOM_HORIZONTAL_HANDLES, 'x', setBorderPosition);
    },
    [setBorderPosition]
  );

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

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

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
        isHighlighted: node.id === highlightedNodeId,
      },
    };
  });

  // Task panel actions
  const nodesById = useMemo(() => (docData?.nodes || {}) as Record<string, any>, [docData?.nodes]);
  const onToggleComplete = useCallback((id: string) => setNodeStatus(id, 'completed'), [setNodeStatus]);
  const onZoomToNode = useCallback(
    (id: string) => {
      const instance = reactFlowInstance.current;
      if (!instance) return;
      const node = instance.getNode(id);
      if (!node) {
        toast({
          title: 'Node not found',
          description: 'We couldn’t locate that item in the current graph view.',
        });
        return;
      }

      instance.fitView({ nodes: [node], duration: 800, padding: 0.3 });
      setHighlightedNodeId(id);
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedNodeId(null);
        highlightTimeoutRef.current = null;
      }, 4000);
    },
    [toast]
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
      <ResizablePanelGroup direction="vertical" className="h-full w-full" layout={mainVerticalLayout} onLayout={handleMainVerticalLayout}>
        <ResizablePanel>
          <ResizablePanelGroup direction="horizontal" className="h-full" layout={topHorizontalLayout} onLayout={handleTopHorizontalLayout}>
            {/* Left: Main graph */}
            <ResizablePanel defaultSize={panelSizes[0]} minSize={40} className="relative">
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
                  className="bg-card border-border text-foreground p-1 [&>button]:w-6 [&>button]:h-6"
                  style={{ transform: 'scale(0.5)', transformOrigin: 'bottom left', left: 8, bottom: 8 }}
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
            <ResizablePanel minSize={10} className="relative">
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
            <ResizablePanel minSize={10} className="relative">
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
        <ResizablePanel minSize={10}>
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full"
            layout={bottomHorizontalLayout}
            onLayout={handleBottomHorizontalLayout}
          >
            <ResizablePanel minSize={30}>
              <ProgressGraphPanel history={docData?.historical_progress} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel minSize={20}>
              <StatsPanel history={docData?.historical_progress} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel minSize={10}>
          <ChatLayout />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}