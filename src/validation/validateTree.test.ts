import { describe, expect, it } from "vitest";
import { validateTree } from "./validateTree";

describe("Validação estrutural da EAP", () => {
  it("aceita uma EAP válida", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        {
          key: "1",
          label: "Pacote 1",
          children: [
            { key: "1.1", label: "Atividade 1" },
            { key: "1.2", label: "Atividade 2" },
          ],
        },
        { key: "2", label: "Pacote 2" },
      ],
    };

    expect(validateTree(tree).valid).toBe(true);
  });

  it("rejeita identificador incorreto na raiz", () => {
    const tree = {
      key: "PROJETO",
      label: "Projeto",
      children: [],
    };

    expect(validateTree(tree).valid).toBe(false);
  });

  it("aceita filho da raiz com prefixo M", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "M.1", label: "Pacote inválido" },
      ],
    };

    expect(validateTree(tree).valid).toBe(true);
  });

  it("aceita identificadores alfanuméricos", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        {
          key: "1",
          label: "Pacote",
          children: [
            { key: "1.A", label: "Atividade inválida" },
          ],
        },
      ],
    };

    expect(validateTree(tree).valid).toBe(true);
  });

  it("rejeita identificadores duplicados", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "1", label: "Pacote A" },
        { key: "1", label: "Pacote B" },
      ],
    };

    expect(validateTree(tree).valid).toBe(false);
  });

  it("aceita códigos não consecutivos", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "1", label: "Pacote 1" },
        { key: "3", label: "Pacote 3" },
        { key: "4", label: "Pacote 4" },
      ],
    };

    expect(validateTree(tree).valid).toBe(true);
  });

  it("rejeita identificador zero", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "0", label: "Pacote inválido" },
      ],
    };

    expect(validateTree(tree).valid).toBe(false);
  });

  it("rejeita identificadores com zeros à esquerda", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        { key: "01", label: "Pacote inválido" },
      ],
    };

    expect(validateTree(tree).valid).toBe(false);
  });

  it("rejeita filhos associados ao pai incorreto", () => {
    const tree = {
      key: "M",
      label: "Projeto",
      children: [
        {
          key: "1",
          label: "Pacote 1",
          children: [
            { key: "2.1", label: "Atividade inválida" },
          ],
        },
      ],
    };

    expect(validateTree(tree).valid).toBe(false);
  });
});
