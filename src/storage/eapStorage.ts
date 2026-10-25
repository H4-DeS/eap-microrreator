/**
 * WBS Studio — Armazenamento e recuperação da EAP.
 *
 * Este módulo não depende de componentes React.
 */

export type StorageLoadResult<T> = {
  tree: T | null;
  recoveryRequired: boolean;
};

export function loadFromStorage<T>(
  storageKey: string,
  recoveryKey: string,
  validate: (data: unknown) => { valid: boolean; errors: string[] }
): StorageLoadResult<T> {
  let raw: string | null;

  try {
    raw = localStorage.getItem(storageKey);
  } catch (error) {
    console.warn("Não foi possível acessar o armazenamento local:", error);
    return { tree: null, recoveryRequired: true };
  }

  if (raw === null) {
    return { tree: null, recoveryRequired: false };
  }

  try {
    const data: unknown = JSON.parse(raw);
    const validation = validate(data);

    if (validation.valid) {
      return { tree: data as T, recoveryRequired: false };
    }

    console.error("EAP armazenada inválida:", validation.errors);
  } catch (error) {
    console.error("JSON armazenado inválido:", error);
  }

  try {
    if (localStorage.getItem(recoveryKey) === null) {
      localStorage.setItem(recoveryKey, raw);
    }
  } catch (error) {
    console.warn("Falha ao criar cópia de recuperação:", error);
  }

  return { tree: null, recoveryRequired: true };
}


/**
 * Salva a EAP no armazenamento local.
 * Propaga erros para que o chamador decida como tratá-los.
 */
export function saveToStorage<T>(
  storageKey: string,
  tree: T
): void {
  localStorage.setItem(storageKey, JSON.stringify(tree));
}

/**
 * Obtém os dados originais para exportação de recuperação.
 */
export function getRecoveryData(
  storageKey: string,
  recoveryKey: string
): string | null {
  const current = localStorage.getItem(storageKey);

  if (current !== null) {
    return current;
  }

  return localStorage.getItem(recoveryKey);
}

/**
 * Substitui a EAP armazenada por uma estrutura válida.
 * Não remove a cópia auxiliar de recuperação.
 */
export function replaceStoredTree<T>(
  storageKey: string,
  tree: T
): void {
  saveToStorage(storageKey, tree);
}

/**
 * Remove a EAP principal do armazenamento local.
 * Não remove a cópia auxiliar de recuperação.
 */
export function clearStorage(storageKey: string): void {
  localStorage.removeItem(storageKey);
}
