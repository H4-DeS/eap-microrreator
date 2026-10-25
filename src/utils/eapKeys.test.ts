import { describe, expect, it } from "vitest";
import { generateUniqueChildKey, type EapNode } from "./eapKeys";

describe("generateUniqueChildKey", () => {
  it("gera 1 para o primeiro filho da raiz M", () => {
    const tree: EapNode = { key: "M", children: [] };

    expect(generateUniqueChildKey(tree, "M")).toBe("1");
  });

  it("gera 1.1 para o primeiro filho do nó 1", () => {
    const tree: EapNode = {
      key: "M",
      children: [{ key: "1", children: [] }],
    };

    expect(generateUniqueChildKey(tree, "1")).toBe("1.1");
  });

  it("reutiliza o menor identificador disponível na raiz", () => {
    const tree: EapNode = {
      key: "M",
      children: [
        { key: "1" },
        { key: "3" },
        { key: "4" },
      ],
    };

    expect(generateUniqueChildKey(tree, "M")).toBe("2");
  });

  it("reutiliza o menor identificador disponível em níveis inferiores", () => {
    const tree: EapNode = {
      key: "M",
      children: [
        {
          key: "1",
          children: [
            { key: "1.1" },
            { key: "1.3" },
          ],
        },
      ],
    };

    expect(generateUniqueChildKey(tree, "1")).toBe("1.2");
  });

  it("considera identificadores existentes em toda a árvore", () => {
    const tree: EapNode = {
      key: "M",
      children: [
        {
          key: "1",
          children: [{ key: "1.1" }],
        },
        { key: "2" },
      ],
    };

    expect(generateUniqueChildKey(tree, "M")).toBe("3");
    expect(generateUniqueChildKey(tree, "1")).toBe("1.2");
  });
});
