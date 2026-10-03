import type { ReactNode } from "react";

export function Notice({ tone, children }: { tone: "ok" | "warn"; children: ReactNode }) {
  return (
    <div className={tone === "ok" ? "notice notice-ok" : "notice notice-warn"} role="status">
      {children}
    </div>
  );
}
