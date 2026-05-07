export type Theme = "dark" | "light";

export const THEMES = ["dark", "light"] as const;
export const DEFAULT_THEME: Theme = "dark";
export const THEME_ATTRIBUTE = "class" as const;
