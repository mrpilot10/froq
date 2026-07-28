import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/support/docs-sidebar";

/** Two-column documentation frame. The ticket page sits outside this group. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs">
      <DocsSidebar />
      <div className="docs-main">{children}</div>
    </div>
  );
}
