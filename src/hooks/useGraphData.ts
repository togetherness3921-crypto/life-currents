import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Node, Edge } from '@xyflow/react';
import { computePositions } from '@/services/layoutEngine';
import { getNodeBoxWidth, getNodeBoxHeight } from '@/services/nodeRenderConfig';
import { initTextMeasurer } from '@/services/textMeasure';
import { useTodayTime } from './useTodayTime';

interface GraphNode {
  id: string;
  type: string;
  position_x: number;
  position_y: number;
  label: string;
  status?: string;
  parents?: string[];
  graph?: string;
  percentage_of_parent?: number;
  createdAt?: string;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  animated: boolean;
  style: any;
}

const buildHierarchyMap = (nodesData: any, completedNodeIds: Set<string> = new Set()) => {
  const logPrefix = '[LayoutEngine/buildHierarchyMap]';
  console.log(`${logPrefix} Running for ${Object.keys(nodesData).length} nodes.`);

  const levels: { [level: number]: string[] } = {};
  const nodeToLevel: { [nodeId: string]: number } = {};
  const nodeIdsInCurrentGraph = new Set(Object.keys(nodesData));

  // This iterative approach correctly finds the longest path to each node,
  // ensuring that siblings with different length paths leading to them are still
  // placed in the correct, furthest column. This calculates levels from R-to-L.
  const rightToLeftLevels: { [nodeId: string]: number } = {};
  let changedInPass = true;
  let iterations = 0;
  const maxIterations = Object.keys(nodesData).length + 5; // Safety break

  while (changedInPass && iterations < maxIterations) {
    changedInPass = false;
    Object.keys(nodesData).forEach(nodeId => {
      const parents = (nodesData[nodeId]?.parents || []).filter((pId: string) => nodeIdsInCurrentGraph.has(pId));

      let maxParentLevel = -1;
      // A node's level is 0 if it has no parents in the current graph.
      // Otherwise, it's 1 + the maximum level of its parents.
      if (parents.length > 0) {
        parents.forEach((pId: string) => {
          if (rightToLeftLevels[pId] !== undefined) {
            maxParentLevel = Math.max(maxParentLevel, rightToLeftLevels[pId]);
          }
        });
      }

      const newLevel = maxParentLevel + 1;
      if (rightToLeftLevels[nodeId] !== newLevel) {
        rightToLeftLevels[nodeId] = newLevel;
        changedInPass = true;
      }
    });
    iterations++;
  }

  // Now, we invert the R-to-L levels to get the correct L-to-R layout.
  const maxLevel = Math.max(0, ...Object.values(rightToLeftLevels));
  Object.entries(rightToLeftLevels).forEach(([nodeId, rtlLevel]) => {
    const finalLevel = maxLevel - rtlLevel;
    nodeToLevel[nodeId] = finalLevel;
    if (!levels[finalLevel]) levels[finalLevel] = [];
    levels[finalLevel].push(nodeId);
  });

  // Filter out columns that only contain completed nodes for counting purposes
  const activeLevels = Object.entries(levels).filter(([, nodeIds]) =>
    !nodeIds.every(id => completedNodeIds.has(id))
  );

  console.log(`${logPrefix} Final Levels (raw):`, levels);
  console.log(`${logPrefix} Active Column Count: ${activeLevels.length}`);

  return { levels, nodeToLevel, activeColumnCount: activeLevels.length };
};

export function useGraphData() {
  const { dayKey } = useTodayTime();
  const [docData, setDocData] = useState<any>(null);
  const [activeGraphId, setActiveGraphId] = useState<string>('main');
  const [loading, setLoading] = useState(true);
  const [viewportState, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  const [positions, setPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [nodeToGraphMap, setNodeToGraphMap] = useState<Record<string, string>>({});

  const { nodes, edges } = useMemo(() => {
    if (!docData?.nodes) return { nodes: [], edges: [] };

    const allNodes = docData.nodes || {};
    const filtered = Object.entries(allNodes).filter(([id]: [string, any]) =>
      (nodeToGraphMap[id] || 'main') === activeGraphId && !hiddenNodeIds.has(id)
    );

    const transformedNodes: Node[] = filtered.map(([key, value]: [string, any]) => ({
      id: key,
      type: value.type,
      position: positions[key] || { x: 0, y: 0 },
      data: {
        label: value.label,
        status: value.status || 'not-started',
        parents: value.parents || [],
        graph: value.graph || 'main',
      },
    }));

    const nodeIdsInGraph = new Set(transformedNodes.map(n => n.id));
    const transformedEdges: Edge[] = Object.entries(allNodes)
      .filter(([, value]: [string, any]) => value.parents && Array.isArray(value.parents))
      .flatMap(([nodeId, value]: [string, any]) =>
        value.parents.map((parentId: string, idx: number) => ({
          id: `${nodeId}-${parentId}-${idx}`,
          source: nodeId,
          target: parentId,
          animated: true,
          style: {},
        }))
      )
      .filter(e => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target));

    console.log(`[LayoutEngine] Rendering graph '${activeGraphId}' with ${transformedNodes.length} nodes.`);
    return { nodes: transformedNodes, edges: transformedEdges };
  }, [docData, activeGraphId, positions, hiddenNodeIds, nodeToGraphMap]);


  const [measuredNodes, setMeasuredNodes] = useState<{ [id: string]: { width: number; height: number } }>({});
  const [isFirstLayoutDone, setIsFirstLayoutDone] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const localOperationsRef = useRef(new Set<string>());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const layoutRecalcTimerRef = useRef<any>(null);
  const didPostMeasureLayoutRef = useRef<boolean>(false);
  const measuredNodesRef = useRef(measuredNodes);
  const stabilizationTimerRef = useRef<any>(null);
  const lastStableSnapshotRef = useRef<{ [id: string]: { width: number; height: number } } | null>(null);

  const fetchGraphData = async () => {
    try {
      setLoading(true);

      // Fetch the single graph document
      const { data: docRow, error: docError } = await (supabase as any)
        .from('graph_documents')
        .select('document')
        .eq('id', 'main')
        .maybeSingle();

      if (docError) throw docError;
      const data = (docRow?.document as any) || {};
      setDocData(data);

      console.log('[Graph] Initial fetch complete. Active graph:', activeGraphId);

      const vp = data.viewport || { x: 0, y: 0, zoom: 1 };
      setViewportState({ x: Number(vp.x ?? 0), y: Number(vp.y ?? 0), zoom: Number(vp.zoom ?? 1) });
    } catch (error) {
      console.error('Error fetching graph data:', error);
    } finally {
      setLoading(false);
    }
  };
  const getActiveNodesData = (dataOverride?: any) => {
    const data = dataOverride ?? docData;
    const allNodes = data?.nodes || {};
    const subsetEntries = Object.entries(allNodes).filter(([, n]: [string, any]) => (n.graph || 'main') === activeGraphId);
    const subset: any = {};
    subsetEntries.forEach(([id, n]) => {
      subset[id] = n;
    });
    return subset;
  };

  // The buildGraphForActiveId function is now replaced by the useMemo hook.

  const updateNodePosition = async (_nodeId: string, _x: number, _y: number) => {
    // No-op: positions are now 100% auto-calculated
    return;
  };

  const calculateHistory = (nodes: Record<string, any>) => {
    const parentToChildrenMap: Record<string, string[]> = {};
    Object.entries(nodes).forEach(([id, node]: [string, any]) => {
      if (node.parents) {
        node.parents.forEach((pId: string) => {
          if (!parentToChildrenMap[pId]) parentToChildrenMap[pId] = [];
          parentToChildrenMap[pId].push(id);
        });
      }
    });

    const endNodes = Object.keys(nodes).filter(id => !parentToChildrenMap[id] || parentToChildrenMap[id].length === 0);
    if (endNodes.length === 0) {
      console.warn("No end nodes found, cannot calculate absolute percentages.");
      return {};
    }
    const finalGoalValue = endNodes.reduce((sum, id) => sum + (nodes[id].percentage_of_parent || 100), 0);

    const memoAbs = new Map<string, number>();
    const getAbsolutePercentage = (nodeId: string): number => {
      if (memoAbs.has(nodeId)) return memoAbs.get(nodeId)!;

      let total = 0;
      if (endNodes.includes(nodeId)) {
        total = (nodes[nodeId].percentage_of_parent || 0) / finalGoalValue * 100;
      } else {
        const children = parentToChildrenMap[nodeId] || [];
        children.forEach(childId => {
          const nodePerc = nodes[nodeId].percentage_of_parent || 0;
          total += (getAbsolutePercentage(childId) * nodePerc) / 100;
        });
      }

      memoAbs.set(nodeId, total);
      return total;
    };

    const history: Record<string, any> = {};
    const completedNodeMap: Record<string, string[]> = {};
    const allCompletedNodes = Object.entries(nodes).filter(([, n]: [string, any]) => n.status === 'completed' && n.completed_at);

    allCompletedNodes.forEach(([id, node]: [string, any]) => {
      const dateKey = new Date(node.completed_at).toISOString().split('T')[0];
      if (!completedNodeMap[dateKey]) completedNodeMap[dateKey] = [];
      completedNodeMap[dateKey].push(id);
    });

    const sortedDates = Object.keys(completedNodeMap).sort();
    let cumulativeCompletedSet = new Set<string>();
    let lastTotal = 0;

    if (sortedDates.length > 0) {
      const firstDate = new Date(sortedDates[0]);
      let currentDate = new Date(firstDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      while (currentDate <= today) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const nodesCompletedThisDay = completedNodeMap[dateKey] || [];
        nodesCompletedThisDay.forEach(id => cumulativeCompletedSet.add(id));

        const newTotal = Array.from(cumulativeCompletedSet).reduce((sum, id) => sum + getAbsolutePercentage(id), 0);

        history[dateKey] = {
          completed_nodes: nodesCompletedThisDay,
          total_percentage_complete: newTotal,
          daily_gain: newTotal - lastTotal,
        };

        lastTotal = newTotal;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    return history;
  }

  const setNodeStatus = async (nodeId: string, targetStatus: 'not-started' | 'in-progress' | 'completed') => {
    try {
      const operationId = `set-status-${nodeId}-${Date.now()}`;
      localOperationsRef.current.add(operationId);

      const nextDoc = { ...(docData || {}) } as any;
      if (!nextDoc.nodes) nextDoc.nodes = {};

      nextDoc.nodes = JSON.parse(JSON.stringify(nextDoc.nodes));

      const nodesToUpdate: { [key: string]: any } = {};

      if (targetStatus === 'completed') {
        const parentToChildrenMap: Record<string, string[]> = {};
        Object.entries(nextDoc.nodes).forEach(([id, node]: [string, any]) => {
          if (node.parents) {
            node.parents.forEach((pId: string) => {
              if (!parentToChildrenMap[pId]) parentToChildrenMap[pId] = [];
              parentToChildrenMap[pId].push(id);
            });
          }
        });

        const nodesToComplete = new Set<string>();
        const queue: string[] = [nodeId];

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (nodesToComplete.has(currentId) || nextDoc.nodes[currentId]?.status === 'completed') {
            continue;
          }
          nodesToComplete.add(currentId);
          const children = parentToChildrenMap[currentId];
          if (children && Array.isArray(children)) {
            children.forEach((childId: string) => queue.push(childId));
          }
        }

        nodesToComplete.forEach(id => {
          nodesToUpdate[id] = { status: 'completed', completed_at: new Date().toISOString() };
        });
      } else {
        nodesToUpdate[nodeId] = { status: targetStatus };
        if (nextDoc.nodes[nodeId]?.completed_at) {
          nodesToUpdate[nodeId].completed_at = null;
        }
      }

      // Optimistic local update is now handled by setDocData triggering the useMemo

      Object.entries(nodesToUpdate).forEach(([id, updates]) => {
        if (!nextDoc.nodes[id]) nextDoc.nodes[id] = {};
        Object.assign(nextDoc.nodes[id], updates);
        if (updates.completed_at === null) {
          delete nextDoc.nodes[id].completed_at;
        }
      });

      // Re-calculate entire history on every status change to ensure consistency
      nextDoc.historical_progress = calculateHistory(nextDoc.nodes);

      setDocData(nextDoc);

      await calculateAutoLayout();

      const { error } = await (supabase as any)
        .from('graph_documents')
        .update({ document: nextDoc })
        .eq('id', 'main');
      if (error) throw error;

      setTimeout(() => {
        localOperationsRef.current.delete(operationId);
      }, 1000);
    } catch (error) {
      console.error('Error setting node status:', error);
    }
  };

  const updateNodeCompletion = async (nodeId: string) => {
    try {
      // Determine new status from current doc using three-state model
      const current = (docData as any)?.nodes?.[nodeId]?.status;
      let newStatus: 'not-started' | 'in-progress' | 'completed';
      if (current === 'in-progress') {
        newStatus = 'completed';
      } else if (current === 'completed' || current === 'complete') {
        newStatus = 'not-started';
      } else {
        newStatus = 'in-progress';
      }

      // Delegate the actual update to setNodeStatus to ensure cascading logic is applied
      await setNodeStatus(nodeId, newStatus);
    } catch (error) {
      console.error('Error updating node completion:', error);
    }
  };

  const deleteNode = async (nodeId: string) => {
    try {
      const nextDoc = { ...(docData || {}) } as any;
      if (nextDoc.nodes) {
        const parentToChildrenMap: Record<string, string[]> = {};
        Object.entries(nextDoc.nodes).forEach(([id, node]: [string, any]) => {
          if (node.parents) {
            node.parents.forEach((pId: string) => {
              if (!parentToChildrenMap[pId]) parentToChildrenMap[pId] = [];
              parentToChildrenMap[pId].push(id);
            });
          }
        });

        const nodesToDelete = new Set<string>();
        const queue: string[] = [nodeId];

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (nodesToDelete.has(currentId)) continue;
          nodesToDelete.add(currentId);

          const children = parentToChildrenMap[currentId] || [];
          children.forEach(childId => queue.push(childId));
        }

        nodesToDelete.forEach(id => {
          delete nextDoc.nodes[id];
        });

        // This secondary pass is to clean up any dangling parent references
        // from nodes that were NOT part of the deletion chain.
        Object.values(nextDoc.nodes).forEach((node: any) => {
          if (node.parents && Array.isArray(node.parents)) {
            node.parents = node.parents.filter((p: string) => !nodesToDelete.has(p));
          }
        });
      }

      // Optimistic local state
      setDocData(nextDoc);
      // setNodes(prev => prev.filter(n => n.id !== nodeId)); // useMemo handles this
      // setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId)); // useMemo handles this

      const { error } = await (supabase as any)
        .from('graph_documents')
        .update({ document: nextDoc })
        .eq('id', 'main');
      if (error) throw error;

      // Trigger auto-layout after deletion
      await calculateAutoLayout();
    } catch (error) {
      console.error('Error deleting node:', error);
    }
  };

  // Deprecated: active node removed. Keep a no-op for compatibility.
  const updateActiveNode = async (_nodeId: string | null) => {
    setActiveNodeId(null);
    return;
  };

  const updateViewportState = async (x: number, y: number, zoom: number) => {
    try {
      const newViewportState = { x, y, zoom };
      setViewportState(newViewportState);
      console.log('[Viewport] updateViewportState', newViewportState);

      const nextDoc = { ...(docData || {}) } as any;
      nextDoc.viewport = { x, y, zoom };
      setDocData(nextDoc);

      const { error } = await (supabase as any)
        .from('graph_documents')
        .update({ document: nextDoc })
        .eq('id', 'main');

      if (error) throw error;
    } catch (error) {
      console.error('Error updating viewport state:', error);
    }
  };

  // Auto-layout configuration
  const GAP_DISTANCE = 150; // Fixed gap between slice edges (right edge of previous, left edge of next)
  const VERTICAL_NODE_SPACING = 120;
  const MEASUREMENT_EPSILON = 0.5; // flow units (~px in flow coords)
  const MAX_SANE_WIDTH = 500; // ignore pre-fit oversized mobile measurements
  const MAX_SANE_HEIGHT = 300;

  // Estimators using canvas-based measurement and config
  const getNodeWidth = (nodeId: string, label: string) => {
    const nodeType = (docData?.nodes?.[nodeId]?.type) || 'objectiveNode';
    return getNodeBoxWidth(nodeType, label || '');
  };
  const getNodeHeight = (nodeId: string) => {
    // Prefer actual measured height if available
    const measuredH = measuredNodes[nodeId]?.height;
    if (typeof measuredH === 'number' && measuredH > 0) return measuredH;
    const nodeType = (docData?.nodes?.[nodeId]?.type) || 'objectiveNode';
    return getNodeBoxHeight(nodeType);
  };

  // Keep a ref to measuredNodes for timers/RAF checks
  useEffect(() => {
    measuredNodesRef.current = measuredNodes;
  }, [measuredNodes]);

  // buildHierarchyMap moved to module scope

  const calculateSlicePositions = (levels: { [level: number]: string[] }, nodesData: any) => {
    const slices: { [level: number]: { leftmost: number; rightmost: number; midpoint: number; width: number } } = {};

    // Determine slice widths (max node width per slice)
    const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
    const sliceWidths: { [level: number]: number } = {};
    for (const level of sortedLevels) {
      const nodeIds = levels[level];
      let maxWidth = 0;
      nodeIds.forEach(nodeId => {
        const width = getNodeWidth(nodeId, nodesData[nodeId].label);
        maxWidth = Math.max(maxWidth, width);
      });
      sliceWidths[level] = maxWidth;
    }

    // Calculate slice midpoints using the required formula:
    // nextMid = prevMid + (prevWidth/2) + GAP_DISTANCE + (nextWidth/2)
    sortedLevels.forEach((level, index) => {
      const width = sliceWidths[level] || 0;
      let midpoint = 0;
      if (index === 0) {
        // Anchor first slice midpoint at 0 for determinism
        midpoint = 0;
      } else {
        const prevLevel = sortedLevels[index - 1];
        const prev = slices[prevLevel];
        const prevWidth = sliceWidths[prevLevel] || 0;
        midpoint = prev.midpoint + (prevWidth / 2) + GAP_DISTANCE + (width / 2);
      }
      const leftmost = midpoint - (width / 2);
      const rightmost = leftmost + width;
      slices[level] = { leftmost, rightmost, midpoint, width };
      console.log(`Slice ${level}: midpoint=${midpoint}, width=${width}, leftmost=${leftmost}, rightmost=${rightmost}`);
    });

    return slices;
  };

  const findDensestColumn = (levels: { [level: number]: string[] }) => {
    let maxCount = 0;
    let densestLevel = 0;

    Object.entries(levels).forEach(([level, nodes]) => {
      if (nodes.length > maxCount) {
        maxCount = nodes.length;
        densestLevel = parseInt(level);
      }
    });

    return densestLevel;
  };

  const calculateAutoLayout = async () => {
    const activeNodesData = getActiveNodesData();
    if (!activeNodesData || Object.keys(activeNodesData).length === 0) {
      console.log('No nodes data available for auto-layout');
      return;
    }

    // First, build hierarchy for all active nodes to identify completed levels
    const fullHierarchy = buildHierarchyMap(activeNodesData);
    const completedLevelNumbers = Object.entries(fullHierarchy.levels)
      .filter(([_, nodeIds]) =>
        nodeIds.every(id => activeNodesData[id]?.status === 'completed')
      )
      .map(([level]) => parseInt(level));

    const nodesToHide = new Set<string>();
    completedLevelNumbers.forEach(level => {
      fullHierarchy.levels[level].forEach(nodeId => nodesToHide.add(nodeId));
    });

    const visibleNodesData = Object.fromEntries(
      Object.entries(activeNodesData).filter(([id]) => !nodesToHide.has(id))
    );

    if (Object.keys(visibleNodesData).length === 0) {
      setHiddenNodeIds(nodesToHide);
      setPositions({});
      setLayoutReady(true);
      return;
    }

    const nodesData = visibleNodesData;
    console.log('Calculating auto-layout for nodes:', Object.keys(nodesData));
    const activeIds = Object.keys(nodesData);
    console.log('Measured nodes (subset of active graph):', Object.fromEntries(Object.entries(measuredNodes).filter(([id]) => activeIds.includes(id))));

    const { levels, nodeToLevel } = buildHierarchyMap(nodesData);
    console.log('Hierarchy levels:', levels);
    console.log('Node to level mapping:', nodeToLevel);

    const newPositions = computePositions({
      nodesData,
      levels,
      nodeToLevel,
      getNodeWidth,
      getNodeHeight,
      gapDistance: GAP_DISTANCE,
      verticalSpacing: VERTICAL_NODE_SPACING,
    });
    console.log('[Layout] Positions computed (top-left):', newPositions);

    setPositions(newPositions);
    setHiddenNodeIds(nodesToHide);

    // Step 5: Update database (but don't store positions since auto-layout handles them)
    // We can remove position storage since auto-layout calculates them
    console.log('Auto-layout calculation complete');
    setLayoutReady(true);
  };

  const calculateAndRecordHistoricalProgress = async () => {
    if (!docData?.nodes) return;
    const newHistory = calculateHistory(docData.nodes);

    // Avoids a write if history hasn't changed
    if (JSON.stringify(newHistory) !== JSON.stringify(docData.historical_progress || {})) {
      const nextDoc = { ...docData, historical_progress: newHistory };
      setDocData(nextDoc);
      await supabase.from('graph_documents').update({ document: nextDoc }).eq('id', 'main');
    }
  };

  const addRelationship = async (sourceId: string, targetId: string) => {
    try {
      const operationId = `edge-${sourceId}-${targetId}-${Date.now()}`;
      console.log('Starting addRelationship operation:', operationId);
      localOperationsRef.current.add(operationId);

      const nextDoc = { ...(docData || {}) } as any;
      if (!nextDoc.nodes) {
        nextDoc.nodes = {};
      }

      // Check if relationship already exists
      const targetNode = nextDoc.nodes[targetId];
      if (targetNode && !(targetNode.parents || []).includes(sourceId)) {
        nextDoc.nodes[targetId] = { ...targetNode, parents: [...(targetNode.parents || []), sourceId] };
        setDocData(nextDoc);

        const { error } = await (supabase as any)
          .from('graph_documents')
          .update({ document: nextDoc })
          .eq('id', 'main');
        if (error) throw error;

        // Trigger auto-layout after relationship change
        await calculateAutoLayout();
        // Rebuild graph view in case active graph subset changed
        // buildGraphForActiveId(nextDoc, activeGraphId); // useMemo handles this
      }

      setTimeout(() => {
        console.log('Removing operation from tracking:', operationId);
        localOperationsRef.current.delete(operationId);
      }, 2000);
    } catch (error) {
      console.error('Error adding relationship:', error);
    }
  };

  useEffect(() => {
    console.log('useGraphData useEffect running');
    initTextMeasurer();
    fetchGraphData().then(() => {
      // Intentionally not awaiting this background task
      calculateAndRecordHistoricalProgress();
    });

    // Realtime: listen for changes to graph_documents id 'main'
    const channel = (supabase as any)
      .channel('graph_documents_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'graph_documents', filter: 'id=eq.main' }, (payload: any) => {
        try {
          // Skip handling if this client just wrote
          if (localOperationsRef.current.size > 0) return;
          const next = payload?.new?.data;
          if (next) {
            setDocData(next);
            // buildGraphForActiveId(next, activeGraphId); // useMemo handles this
            setLayoutReady(false);
            setIsFirstLayoutDone(false);
            // Compute layout after short microtask
            setTimeout(() => {
              try { calculateAutoLayout(); } catch (e) { console.error('Realtime layout error', e); }
            }, 0);
          }
        } catch (e) {
          console.error('Realtime change handling error', e);
        }
      })
      .subscribe();

    return () => {
      try { (supabase as any).removeChannel(channel); } catch { }
    };
  }, []);

  useEffect(() => {
    if (docData?.nodes) {
      const newMap = determineNodeGraphs(docData.nodes);
      setNodeToGraphMap(newMap);
    }
  }, [docData?.nodes]);

  useEffect(() => {
    if (!docData?.nodes) return;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0];
    const nodesToPatch: Record<string, any> = {};

    let needsUpdate = false;
    Object.entries(docData.nodes).forEach(([id, node]: [string, any]) => {
      // Rule 1: Yesterday's incomplete tasks get reset
      if (node.scheduled_start?.startsWith(yesterday) && node.status === 'in-progress') {
        nodesToPatch[id] = { ...node, status: 'not-started' };
        needsUpdate = true;
      }
      // Rule 2: Today's scheduled tasks get started
      if (node.scheduled_start?.startsWith(today) && node.status === 'not-started') {
        nodesToPatch[id] = { ...node, status: 'in-progress' };
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      const nextDoc = {
        ...docData,
        nodes: {
          ...docData.nodes,
          ...nodesToPatch,
        }
      };
      setDocData(nextDoc);
      setNodeToGraphMap(determineNodeGraphs(nextDoc.nodes));
      supabase.from('graph_documents').update({ document: nextDoc }).eq('id', 'main').then(({ error }) => {
        if (error) console.error("Error in midnight update:", error);
      });
    }
  }, [dayKey]); // Triggered by the useTodayTime hook

  // Handle node measurements from React Flow
  const handleNodeMeasure = (nodeId: string, width: number, height: number) => {
    // Retain for optional debugging; no-op for layout
    return;
  };

  // Reset first layout flag when data changes significantly
  useEffect(() => {
    if (docData?.nodes) {
      const nodeIds = Object.keys(docData.nodes);
      const measuredIds = Object.keys(measuredNodes);
      const hasUnmeasuredNodes = nodeIds.some(id => !measuredIds.includes(id));

      if (hasUnmeasuredNodes) {
        setIsFirstLayoutDone(false);
        setLayoutReady(false);
        didPostMeasureLayoutRef.current = false;
        lastStableSnapshotRef.current = null;
        if (stabilizationTimerRef.current) {
          clearTimeout(stabilizationTimerRef.current);
          stabilizationTimerRef.current = null;
        }
      }
    }
  }, [docData?.nodes]);

  // Rebuild graph whenever activeGraphId changes
  useEffect(() => {
    if (docData) {
      console.log('[Graph] activeGraphId changed to', activeGraphId, '- rebuilding graph');
      // buildGraphForActiveId(docData, activeGraphId); // useMemo handles this
      setLayoutReady(false);
      setIsFirstLayoutDone(false);
      didPostMeasureLayoutRef.current = false;
      lastStableSnapshotRef.current = null;
      if (stabilizationTimerRef.current) {
        clearTimeout(stabilizationTimerRef.current);
        stabilizationTimerRef.current = null;
      }
      // Seed an initial layout quickly using fallback sizes to ensure nodes mount and measure
      setTimeout(() => {
        try {
          console.log('[Layout] Seeding initial layout for graph', activeGraphId);
          calculateAutoLayout();
        } catch (e) {
          console.error('[Layout] Seed layout error', e);
        }
      }, 0);
      // Full stabilized layout will follow when measurements settle
    }
  }, [activeGraphId]);

  // This can likely be simplified or removed as well, relying on docData changes.
  useEffect(() => {
    if (!docData?.nodes) return;
    const nodesData = getActiveNodesData();
    if (Object.keys(nodesData).length === 0) return;
    console.log('[Layout] Immediate layout for graph', activeGraphId);
    calculateAutoLayout();
    setIsFirstLayoutDone(true);
    setLayoutReady(true);
  }, [activeGraphId, docData?.nodes]);


  return {
    nodes,
    edges,
    loading,
    activeNodeId,
    activeGraphId,
    viewportState,
    docData,
    layoutReady,
    measuredNodes,
    nodeToGraphMap,

    updateNodePosition,
    updateNodeCompletion,
    setNodeStatus,
    updateActiveNode,
    setActiveGraphId,
    updateViewportState,
    deleteNode,
    addRelationship,
    calculateAutoLayout,
    refetch: fetchGraphData,
    handleNodeMeasure,
  };
}

const determineNodeGraphs = (allNodes: Record<string, any>): Record<string, string> => {
  const nodeToGraphMap: Record<string, string> = {};
  if (!allNodes || Object.keys(allNodes).length === 0) {
    return nodeToGraphMap;
  }
  const logPrefix = '[LayoutEngine/determineNodeGraphs]';
  console.log(`${logPrefix} Starting graph determination...`);

  const sortedNodeIds = Object.keys(allNodes).sort((a, b) => {
    const dateA = new Date(allNodes[a]?.createdAt || 0).getTime();
    const dateB = new Date(allNodes[b]?.createdAt || 0).getTime();
    return dateA - dateB;
  });
  console.log(`${logPrefix} Nodes sorted by createdAt:`, sortedNodeIds);

  const completedNodeIds = new Set(Object.entries(allNodes)
    .filter(([, node]) => node.status === 'completed')
    .map(([id]) => id));

  const tempGraphViews: { [graphId: string]: Set<string> } = { 'main': new Set() };

  for (const nodeId of sortedNodeIds) {
    const node = allNodes[nodeId];
    const parentId = (node.parents || [])[0];

    let assignedGraphId = 'main';
    if (parentId && nodeToGraphMap[parentId]) {
      assignedGraphId = nodeToGraphMap[parentId];
    }
    console.log(`${logPrefix} Processing node '${nodeId}': initial assignedGraph='${assignedGraphId}'`);

    if (!tempGraphViews[assignedGraphId]) {
      tempGraphViews[assignedGraphId] = new Set();
    }
    tempGraphViews[assignedGraphId].add(nodeId);

    const nodesForLayoutCheck = Object.fromEntries(
      Object.entries(allNodes).filter(([id]) => tempGraphViews[assignedGraphId].has(id))
    );

    const { activeColumnCount } = buildHierarchyMap(nodesForLayoutCheck, completedNodeIds);

    console.log(`${logPrefix} ... in graph '${assignedGraphId}', active column count is now ${activeColumnCount}`);

    if (activeColumnCount > 6 && parentId) {
      console.log(`${logPrefix} ... NESTING! Active column count > 6. Moving '${nodeId}' to subgraph of '${parentId}'`);
      // Nest the node
      assignedGraphId = parentId;
      // Remove from old graph view and add to new one
      for (const key in tempGraphViews) {
        if (tempGraphViews[key].has(nodeId)) {
          tempGraphViews[key].delete(nodeId);
        }
      }
      if (!tempGraphViews[assignedGraphId]) {
        tempGraphViews[assignedGraphId] = new Set();
      }
      tempGraphViews[assignedGraphId].add(nodeId);
    }
    nodeToGraphMap[nodeId] = assignedGraphId;
  }
  console.log(`${logPrefix} Final node-to-graph map:`, nodeToGraphMap);
  return nodeToGraphMap;
};