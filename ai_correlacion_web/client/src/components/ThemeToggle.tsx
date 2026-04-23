import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme, switchable } = useTheme();
  if (!switchable || !toggleTheme) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0 border-border bg-background/80 shadow-sm"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
