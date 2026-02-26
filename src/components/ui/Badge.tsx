export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "ok" | "warn" | "error" | "info" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
