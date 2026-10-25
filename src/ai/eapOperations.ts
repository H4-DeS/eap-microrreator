import { validateTree } from "../validation/validateTree";
import { generateUniqueChildKey } from "../utils/eapKeys";
import { cloneTree, findPath, getByPath, walkTree, type NodeDef } from "../utils/eapTree";

export type AIOp =
  | { op: 'rename'; key: string; label: string }
  | { op: 'add'; parent: string; label: string }
  | { op: 'remove'; key: string }
  | { op: 'move'; key: string; newParent: string }
  | { op: 'addDoc'; key: string; doc: string }
  | { op: 'generateTree'; description?: string };

export type OperationResult = {
  success: boolean;
  operation: AIOp;
  message: string;
};

type ApplyOpsResult = {
  tree: NodeDef;
  results: OperationResult[];
  changed: boolean;
};

function applyOpsToTree(root: NodeDef, ops: AIOp[]): ApplyOpsResult {
  const t = cloneTree(root);
  const results: OperationResult[] = [];
  let changed = false;

  const report = (operation: AIOp, success: boolean, message: string) => {
    results.push({ operation, success, message });
    if (success) changed = true;
  };

  for (const op of ops) {
    switch (op.op) {
      case "add": {
        const path = findPath(t, op.parent);

        if (!path) {
          report(op, false, `⚠️ Elemento ${op.parent} não encontrado.`);
          break;
        }

        const parent = getByPath(t, path).node;
        const newKey = generateUniqueChildKey(t, op.parent);

        parent.children = parent.children ?? [];
        parent.children.push({
          key: newKey,
          label: op.label,
          docs: []
        });

        report(op, true, `✅ Elemento ${newKey} adicionado.`);
        break;
      }

      case "remove": {
        if (op.key === t.key) {
          report(op, false, "❌ A raiz da EAP não pode ser excluída.");
          break;
        }

        const path = findPath(t, op.key);

        if (!path) {
          report(op, false, `⚠️ Elemento ${op.key} não encontrado.`);
          break;
        }

        const parent = getByPath(t, path.slice(0, -1)).node;

        if (!parent.children) {
          report(op, false, "❌ Não foi possível localizar o elemento pai.");
          break;
        }

        parent.children = parent.children.filter(
          child => child.key !== op.key
        );

        report(op, true, `✅ Elemento ${op.key} removido.`);
        break;
      }

      case "rename": {
        const path = findPath(t, op.key);

        if (!path) {
          report(op, false, `⚠️ Elemento ${op.key} não encontrado.`);
          break;
        }

        const node = getByPath(t, path).node;

        if (node.label === op.label) {
          report(op, false, "ℹ️ O elemento já possui esse rótulo.");
          break;
        }

        node.label = op.label;
        report(op, true, `✅ Elemento ${op.key} renomeado.`);
        break;
      }

      case "move": {
        if (op.key === t.key) {
          report(op, false, "❌ A raiz da EAP não pode ser movimentada.");
          break;
        }

        const srcPath = findPath(t, op.key);
        const dstPath = findPath(t, op.newParent);

        if (!srcPath || !dstPath) {
          report(op, false, "⚠️ Origem ou destino não encontrado.");
          break;
        }

        const destinationIsDescendant =
          dstPath.length >= srcPath.length &&
          srcPath.every((part, index) => part === dstPath[index]);

        if (destinationIsDescendant) {
          report(
            op,
            false,
            "❌ Não é permitido mover um elemento para dentro de sua própria subárvore."
          );
          break;
        }

        const parent = getByPath(t, srcPath.slice(0, -1)).node;
        const destination = getByPath(t, dstPath).node;

        if (parent.key === destination.key) {
          report(op, false, "ℹ️ O elemento já pertence a esse pai.");
          break;
        }

        const index = parent.children?.findIndex(
          child => child.key === op.key
        ) ?? -1;

        if (!parent.children || index < 0) {
          report(op, false, "❌ Elemento de origem não localizado.");
          break;
        }

        const newKey = generateUniqueChildKey(t, op.newParent);
        const item = parent.children[index];

        const movingKeys = new Set<string>();
        walkTree(item, node => movingKeys.add(node.key));

        const existingKeys = new Set<string>();
        walkTree(t, node => {
          if (!movingKeys.has(node.key)) existingKeys.add(node.key);
        });

        const proposedKeys = new Set<string>();
        let valid = true;

        walkTree(item, node => {
          if (
            node.key !== op.key &&
            !node.key.startsWith(op.key + ".")
          ) {
            valid = false;
          }

          const suffix = node.key.slice(op.key.length);
          const candidate = newKey + suffix;

          if (
            existingKeys.has(candidate) ||
            proposedKeys.has(candidate)
          ) {
            valid = false;
          }

          proposedKeys.add(candidate);
        });

        if (!valid) {
          report(
            op,
            false,
            "❌ Movimentação rejeitada por inconsistência ou duplicidade de identificadores."
          );
          break;
        }

        parent.children.splice(index, 1);

        walkTree(item, node => {
          const oldKey = node.key;
          const suffix = oldKey.slice(op.key.length);
          const updatedKey = newKey + suffix;

          if (
            node.label === oldKey ||
            node.label.startsWith(oldKey + " ")
          ) {
            node.label = updatedKey + node.label.slice(oldKey.length);
          }

          node.key = updatedKey;
        });

        destination.children = destination.children ?? [];
        destination.children.push(item);

        report(
          op,
          true,
          `✅ Elemento ${op.key} movimentado para ${newKey}.`
        );
        break;
      }

      case "addDoc": {
        const path = findPath(t, op.key);

        if (!path) {
          report(op, false, `⚠️ Elemento ${op.key} não encontrado.`);
          break;
        }

        const node = getByPath(t, path).node;
        node.docs = node.docs ?? [];

        if (node.docs.includes(op.doc)) {
          report(op, false, "ℹ️ Documento já associado ao elemento.");
          break;
        }

        node.docs.push(op.doc);
        report(op, true, `✅ Documento associado ao elemento ${op.key}.`);
        break;
      }

      case "generateTree": {
        const title = op.description
          ? "PROJETO: " + op.description
          : "PROJETO: Novo Projeto";

        if (t.label === title) {
          report(op, false, "ℹ️ O projeto já possui esse título.");
          break;
        }

        t.label = title;
        report(op, true, "✅ Título do projeto atualizado.");
        break;
      }
    }
  }

  return { tree: t, results, changed };
}

export function applyValidatedOpsToTree(
  root: NodeDef,
  ops: AIOp[]
): ApplyOpsResult {
  const outcome = applyOpsToTree(root, ops);

  if (!outcome.changed) {
    return outcome;
  }

  const validation = validateTree(outcome.tree);

  if (!validation.valid) {
    const details = validation.errors.join("; ");

    return {
      tree: root,
      changed: false,
      results: outcome.results.map(result =>
        result.success
          ? {
              ...result,
              success: false,
              message:
                "❌ Alteração não aplicada: a validação final da EAP falhou. " +
                details
            }
          : result
      )
    };
  }

  return outcome;
}

