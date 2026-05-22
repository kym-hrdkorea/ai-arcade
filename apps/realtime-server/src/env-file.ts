import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath, resolve } from "node:path";

export type LoadRootEnvFileResult = {
  loadedKeys: string[];
  path?: string;
};

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  const normalizedContent = content.replace(/^\uFEFF/, "");

  for (const rawLine of normalizedContent.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = unquoteEnvValue(value);
  }

  return values;
}

function findWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return resolve(startDir);
    }

    current = parent;
  }
}

export function loadRootEnvFile(
  startDir = process.cwd(),
  override = false,
): LoadRootEnvFileResult {
  const root = findWorkspaceRoot(startDir);
  const envPaths = [join(root, ".env"), join(root, ".env.local")].filter((envPath) =>
    existsSync(envPath),
  );

  if (envPaths.length === 0) {
    return {
      loadedKeys: [],
    };
  }

  const shellProvidedKeys = new Set(Object.keys(process.env));
  const loadedKeys: string[] = [];

  for (const envPath of envPaths) {
    const parsed = parseEnvFile(readFileSync(envPath, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (override || !shellProvidedKeys.has(key)) {
        process.env[key] = value;
        loadedKeys.push(key);
      }
    }
  }

  return {
    loadedKeys,
    path: parsePath(envPaths[envPaths.length - 1] ?? "").dir
      ? envPaths.join(";")
      : undefined,
  };
}
