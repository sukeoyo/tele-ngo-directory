import type { ReactNode } from "react";

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warn" | "error"; children: ReactNode }) {
  return (
    <div className={`notice is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
