export type EapNode = {
  key: string;
  children?: EapNode[];
};

export function generateUniqueChildKey(
  root: EapNode,
  parentKey: string
): string {
  const existingKeys = new Set<string>();
  let parent: EapNode | undefined;

  const visit = (node: EapNode): void => {
    existingKeys.add(node.key);

    if (node.key === parentKey) {
      parent = node;
    }

    node.children?.forEach(visit);
  };

  visit(root);

  if (!parent) {
    throw new Error(`Nó pai não encontrado: ${parentKey}`);
  }

  const children = (parent as EapNode).children ?? [];

  // A raiz M admite dois formatos históricos:
  // M -> 1, 2, 3
  // M -> M.1, M.2, M.3
  const usesPrefixedRoot =
    parentKey === "M" &&
    children.some(child => child.key.startsWith("M."));

  const makeCandidate = (n: number): string => {
    if (parentKey === "M" && !usesPrefixedRoot) {
      return String(n);
    }

    return `${parentKey}.${n}`;
  };

  let sequence = 1;
  let candidate = makeCandidate(sequence);

  while (existingKeys.has(candidate)) {
    sequence++;
    candidate = makeCandidate(sequence);
  }

  return candidate;
}
