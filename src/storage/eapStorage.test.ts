import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFromStorage,
  saveToStorage,
  getRecoveryData,
  replaceStoredTree,
  clearStorage,
} from "./eapStorage";

const STORAGE_KEY = "wbs_studio_v1";
const RECOVERY_KEY = "wbs_studio_recovery_v1";

const validTree = {
  key: "M",
  label: "Projeto de teste",
  children: [],
};

const validate = (data: unknown) => ({
  valid:
    typeof data === "object" &&
    data !== null &&
    "key" in data &&
    data.key === "M",
  errors: ["Estrutura inválida"],
});

beforeEach(() => {
  const items = new Map<string, string>();

  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      items.delete(key);
    }),
  });
});

describe("Armazenamento da EAP", () => {
  it("retorna null quando não existem dados armazenados", () => {
    const result = loadFromStorage(
      STORAGE_KEY,
      RECOVERY_KEY,
      validate
    );

    expect(result.tree).toBeNull();
    expect(result.recoveryRequired).toBe(false);
  });

  it("carrega uma EAP válida", () => {
    saveToStorage(STORAGE_KEY, validTree);

    const result = loadFromStorage(
      STORAGE_KEY,
      RECOVERY_KEY,
      validate
    );

    expect(result.tree).toEqual(validTree);
    expect(result.recoveryRequired).toBe(false);
  });

  it("ativa recuperação quando encontra JSON inválido", () => {
    localStorage.setItem(STORAGE_KEY, "{json-invalido");

    const result = loadFromStorage(
      STORAGE_KEY,
      RECOVERY_KEY,
      validate
    );

    expect(result.tree).toBeNull();
    expect(result.recoveryRequired).toBe(true);
    expect(localStorage.getItem(RECOVERY_KEY)).toBe("{json-invalido");
  });

  it("ativa recuperação quando encontra estrutura inválida", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: "INVALIDO" })
    );

    const result = loadFromStorage(
      STORAGE_KEY,
      RECOVERY_KEY,
      validate
    );

    expect(result.tree).toBeNull();
    expect(result.recoveryRequired).toBe(true);
  });

  it("exporta os dados originais de recuperação", () => {
    localStorage.setItem(STORAGE_KEY, "{json-invalido");

    expect(
      getRecoveryData(STORAGE_KEY, RECOVERY_KEY)
    ).toBe("{json-invalido");
  });

  it("substitui a EAP armazenada", () => {
    localStorage.setItem(STORAGE_KEY, "{json-invalido");

    replaceStoredTree(STORAGE_KEY, validTree);

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    ).toEqual(validTree);
  });

  it("remove apenas a EAP principal", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validTree));
    localStorage.setItem(RECOVERY_KEY, "backup");

    clearStorage(STORAGE_KEY);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(RECOVERY_KEY)).toBe("backup");
  });

  it("propaga erros de escrita", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Armazenamento indisponível");
    });

    expect(() => saveToStorage(STORAGE_KEY, validTree)).toThrow(
      "Armazenamento indisponível"
    );
  });
});
