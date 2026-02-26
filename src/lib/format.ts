export function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

export function isRecent(lastSeen?: string | null, windowMinutes = 5): boolean {
  if (!lastSeen) return false;
  const ms = new Date(lastSeen).getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= Date.now() - windowMinutes * 60_000;
}

export function sanitizePath(path: string): string {
  return path.replace(/\//g, "\\");
}

export function summarizeOutput(stdout?: string | null, stderr?: string | null): string {
  const text = (stdout?.trim() || stderr?.trim() || "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
