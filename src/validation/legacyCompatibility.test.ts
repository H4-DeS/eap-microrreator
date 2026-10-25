import { describe, expect, it } from "vitest";
import { validateTree } from "./validateTree";
import { generateUniqueChildKey } from "../utils/eapKeys";

describe("Compatibilidade com EAPs legadas", () => {
  it("aceita raiz numérica", () => {
    const tree = {
      key: "1",
      label: "Projeto",
      children: [
        { key: "1.1", label: "Pacote 1" },
        { key: "1.2", label: "Pacote 2" }
      ]
    };

    expect(validateTree(tree).valid).toBe(true);
    expect(generateUniqueChildKey(tree, "1")).toBe("1.3");
  });

  it("aceita raiz M com filhos numéricos", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "1", label: "Pacote 1" },
        { key: "2", label: "Pacote 2" }
      ]
    };

    expect(validateTree(tree).valid).toBe(true);
    expect(generateUniqueChildKey(tree, "M")).toBe("3");
  });

  it("aceita raiz M com filhos prefixados", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "M.1", label: "Pacote 1" },
        { key: "M.2", label: "Pacote 2" }
      ]
    };

    expect(validateTree(tree).valid).toBe(true);
    expect(generateUniqueChildKey(tree, "M")).toBe("M.3");
  });

  it("aceita códigos alfanuméricos", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        {
          key: "M.1",
          label: "UDT-1",
          children: [
            {
              key: "M.1.L1",
              label: "Licenciamento",
              children: [
                { key: "M.1.L1.SQ", label: "Qualidade" }
              ]
            }
          ]
        }
      ]
    };

    expect(validateTree(tree).valid).toBe(true);
    expect(generateUniqueChildKey(tree, "M.1.L1")).toBe("M.1.L1.1");
  });

  it("continua bloqueando identificadores duplicados", () => {
    const tree = {
      key: "1",
      label: "Projeto",
      children: [
        { key: "1.1", label: "Primeiro" },
        { key: "1.1", label: "Duplicado" }
      ]
    };

    expect(validateTree(tree).valid).toBe(false);
  });

  it("continua bloqueando hierarquia incorreta", () => {
    const tree = {
      key: "1",
      label: "Projeto",
      children: [
        { key: "2.1", label: "Filho incorreto" }
      ]
    };

    expect(validateTree(tree).valid).toBe(false);
  });
});
