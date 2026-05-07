"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <Topbar onToggleSidebar={() => setSidebarCollapsed((c) => !c)} />
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Sidebar collapsed={sidebarCollapsed} />
        <main
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--bg-base)",
            padding: 24,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
