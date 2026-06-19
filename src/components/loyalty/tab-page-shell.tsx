import type { ReactNode } from "react";

interface TabPageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function TabPageShell({ title, subtitle, children }: TabPageShellProps) {
  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">{title}</h2>
        <p className="tab-sub">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}
