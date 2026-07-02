export function readEnvValue(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const singleQuoted = trimmed.match(/^'([\s\S]*)'$/);
  if (singleQuoted) return singleQuoted[1].trim() || null;

  const doubleQuoted = trimmed.match(/^"([\s\S]*)"$/);
  if (doubleQuoted) return doubleQuoted[1].trim() || null;

  return trimmed;
}
