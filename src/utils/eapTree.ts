export type NodeKey = string;

export type NodeDef = {
  key: NodeKey;
  label: string;
  bg?: string;
  fg?: string;
  children?: NodeDef[];
  docs?: string[];
};

export const walkTree = (n: NodeDef, fn: (node: NodeDef, parent?: NodeDef) => void, parent?: NodeDef) => { fn(n, parent); n.children?.forEach((c) => walkTree(c, fn, n)); };
export const cloneTree = (n: NodeDef): NodeDef => ({ ...n, children: n.children?.map(cloneTree), docs: n.docs ? [...n.docs] : undefined });


export const findPath = (root: NodeDef, key: NodeKey): NodeKey[] | null => {
  const path: NodeKey[] = []; let found = false;
  const dfs = (node: NodeDef, acc: NodeKey[]) => { if (found) return; const next = [...acc, node.key]; if (node.key === key) { path.push(...next); found = true; return; } node.children?.forEach((c) => dfs(c, next)); };
  dfs(root, []); return found ? path : null;
};


export const getByPath = (root: NodeDef, path: NodeKey[]): { node: NodeDef; parent?: NodeDef; index?: number } => {
  let cur = root; let parent: NodeDef | undefined; let idx: number | undefined;
  for (let i = 1; i < path.length; i++) { parent = cur; const k = path[i]; idx = cur.children?.findIndex((c) => c.key === k); if (idx == null || idx < 0 || !cur.children) break; cur = cur.children[idx]; }
  return { node: cur, parent, index: idx };
};

