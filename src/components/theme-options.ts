import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

/**
 * The themes a person picks between, wherever they pick one: the account
 * menus, the command menu, a room's settings and the navigation sheet. Its
 * words are under lib/claims-register.test.ts.
 */
export const THEMES = [
  { id: "light", label: "Light", keywords: ["theme", "light mode"] },
  { id: "dark", label: "Dark", keywords: ["theme", "dark mode"] },
  { id: "system", label: "System", keywords: ["theme", "auto"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Each theme's icon, the same wherever it is drawn. */
export const THEME_ICONS: Record<ThemeId, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };
