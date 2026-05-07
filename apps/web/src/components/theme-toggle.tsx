"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEMES } from "@/lib/theme";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute={THEME_ATTRIBUTE}
      defaultTheme={DEFAULT_THEME}
      enableSystem={false}
      themes={[...THEMES]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
      className="h-8 w-8 shrink-0"
    >
      {isDark ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
    </Button>
  );
}
