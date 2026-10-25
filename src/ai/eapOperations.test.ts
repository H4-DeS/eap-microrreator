import { describe, expect, it } from "vitest";
import { applyValidatedOpsToTree } from "./eapOperations";
import type { NodeDef } from "../utils/eapTree";

const makeTree = (): NodeDef => ({
  key: "M",
  label: "Projeto MRN",
  children: [
    {
      key: "1",
      label: "Unidade Crítica",
      children: [
        {
          key: "1.1",
          label: "Projeto",
          docs: []
        }
      ]
    },
    {
      key: "2",
      label: "Bancadas Experimentais",
      children: []
    }
  ]
});

describe("Operações validadas da IA", () => {
  it("renomeia um elemento existente", () => {
    const result = applyValidatedOpsToTree(makeTree(), [
      { op: "rename", key: "1.1", label: "Projeto Neutrônico" }
    ]);

    expect(result.changed).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(result.tree.children?.[0].children?.[0].label)
      .toBe("Projeto Neutrônico");
  });

  it("adiciona um elemento com identificador único", () => {
    const result = applyValidatedOpsToTree(makeTree(), [
      { op: "add", parent: "1", label: "Nova atividade" }
    ]);

    expect(result.changed).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(result.tree.children?.[0].children?.[1].key)
      .toBe("1.2");
  });

  it("impede a exclusão da raiz", () => {
    const original = makeTree();

    const result = applyValidatedOpsToTree(original, [
      { op: "remove", key: "M" }
    ]);

    expect(result.changed).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.tree).toEqual(original);
  });

  it("impede movimentar um elemento para seu descendente", () => {
    const original = makeTree();

    const result = applyValidatedOpsToTree(original, [
      { op: "move", key: "1", newParent: "1.1" }
    ]);

    expect(result.changed).toBe(false);
    expect(result.results[0].success).toBe(false);
    expect(result.tree).toEqual(original);
  });

  it("movimenta um elemento válido e atualiza seu identificador", () => {
    const result = applyValidatedOpsToTree(makeTree(), [
      { op: "move", key: "1.1", newParent: "2" }
    ]);

    expect(result.changed).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(result.tree.children?.[1].children?.[0].key)
      .toBe("2.1");
  });

  it("associa um documento a um elemento", () => {
    const result = applyValidatedOpsToTree(makeTree(), [
      { op: "addDoc", key: "1.1", doc: "relatorio.pdf" }
    ]);

    expect(result.changed).toBe(true);
    expect(result.tree.children?.[0].children?.[0].docs)
      .toContain("relatorio.pdf");
  });

  it("preserva a árvore original após operações válidas", () => {
    const original = makeTree();
    const snapshot = structuredClone(original);

    applyValidatedOpsToTree(original, [
      { op: "rename", key: "1.1", label: "Novo nome" },
      { op: "add", parent: "2", label: "Nova atividade" }
    ]);

    expect(original).toEqual(snapshot);
  });

  it("mantém a correspondência entre operações e resultados", () => {
    const result = applyValidatedOpsToTree(makeTree(), [
      { op: "rename", key: "1.1", label: "Novo nome" },
      { op: "remove", key: "M" },
      { op: "add", parent: "2", label: "Nova atividade" }
    ]);

    expect(result.results).toHaveLength(3);
    expect(result.results.map(r => r.success))
      .toEqual([true, false, true]);
  });

  it("reverte alterações quando a validação final falha", () => {
    const original = makeTree();

    // Simula uma estrutura com identificadores duplicados.
    original.children?.push({
      key: "1",
      label: "Elemento duplicado",
      children: []
    });

    const snapshot = structuredClone(original);

    const result = applyValidatedOpsToTree(original, [
      { op: "rename", key: "1.1", label: "Projeto atualizado" }
    ]);

    expect(result.changed).toBe(false);
    expect(result.tree).toBe(original);
    expect(result.tree).toEqual(snapshot);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].message).toContain(
      "validação final da EAP falhou"
    );
  });
});
