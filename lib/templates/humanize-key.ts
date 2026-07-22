export function humanizeTemplateKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}
