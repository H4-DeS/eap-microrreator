export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateTree(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenKeys = new Set<string>();

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);

  const visit = (
    value: unknown,
    parentKey?: string,
    location = "raiz"
  ): void => {
    if (!isRecord(value)) {
      errors.push(`${location}: elemento deve ser um objeto.`);
      return;
    }

    const key = value.key;
    const label = value.label;

    if (typeof key !== "string" || !key.trim()) {
      errors.push(`${location}: identificador ausente ou inválido.`);
    } else {
      if (seenKeys.has(key)) {
        errors.push(`Identificador duplicado: ${key}.`);
      }

      seenKeys.add(key);

      if (parentKey === undefined) {
        if (key !== "M" && key !== "1") {
          errors.push(
            `Identificador inválido para a raiz: ${key}. Esperado: M ou 1.`
          );
        }
      } else {
        const suffix = key.startsWith(parentKey + ".")
          ? key.slice(parentKey.length + 1)
          : parentKey === "M"
            ? key
            : "";

        const validSuffix =
          /^[A-Za-z0-9]+$/.test(suffix) &&
          !/^(0|0[0-9]+)$/.test(suffix);

        if (!validSuffix) {
          errors.push(
            `Hierarquia ou código inválido: ${key} não é filho direto válido de ${parentKey}.`
          );
        }
      }
    }

    if (typeof label !== "string") {
      errors.push(`${location}: rótulo ausente ou inválido.`);
    } else if (!label.trim()) {
      warnings.push(`${location}: rótulo vazio.`);
    }

    if (value.docs !== undefined) {
      if (
        !Array.isArray(value.docs) ||
        !value.docs.every(doc => typeof doc === "string")
      ) {
        errors.push(`${location}: docs deve ser uma lista de textos.`);
      }
    }

    if (value.children !== undefined) {
      if (!Array.isArray(value.children)) {
        errors.push(`${location}: children deve ser uma lista.`);
      } else {
        value.children.forEach((child, index) => {
          visit(
            child,
            typeof key === "string" ? key : undefined,
            `${location} > filho ${index + 1}`
          );
        });
      }
    }

    for (const field of ["bg", "fg"] as const) {
      const color = value[field];

      if (
        color !== undefined &&
        (
          typeof color !== "string" ||
          !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
        )
      ) {
        warnings.push(
          `${location}: cor inválida no campo ${field}.`
        );
      }
    }
  };

  visit(data);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
