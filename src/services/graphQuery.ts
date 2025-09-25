export interface QueriedGraph {
  nodes: Array<{ id: string; type: string; data: any }>;
  edges: Array<{ id: string; source: string; target: string; animated?: boolean; style?: any }>;
}

export function getContainerIds(doc: any): Set<string> {
  const ids = new Set<string>();
  const nodes = doc?.nodes || {};
  Object.values(nodes).forEach((n: any) => {
    if (n?.graph) ids.add(n.graph);
  });
  return ids;
}

export function buildGraphSubset(doc: any, graphId: string): QueriedGraph {
  const all = doc?.nodes || {};
  const filtered = Object.entries(all).filter(([_, n]: [string, any]) => (n.graph || 'main') === graphId);
  const nodes = filtered.map(([id, n]: [string, any]) => ({ id, type: n.type, data: { label: n.label, status: n.status || 'not-started', parent: n.parent, graph: n.graph || 'main' } }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Object.entries(all)
    .filter(([_, n]: [string, any]) => n.parent)
    .map(([id, n]: [string, any], idx) => ({ id: `${n.parent}-${id}-${idx}`, source: n.parent, target: id, animated: true, style: {} }))
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { nodes, edges };
}


