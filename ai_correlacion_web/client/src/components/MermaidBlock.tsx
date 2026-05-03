import { useEffect, useRef } from "react";

type Props = {
  chart: string;
  className?: string;
};

/** Renderiza código Mermaid só no cliente (import dinâmico). */
export function MermaidBlock({ chart, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    let cancelled = false;

    async function render() {
      if (!chart.trim() || !el) return;
      const mermaid = (await import("mermaid")).default;
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });
      } catch {
        /* segunda chamada pode ser ignorada */
      }
      try {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `m-${crypto.randomUUID()}`
            : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && el) el.innerHTML = svg;
      } catch {
        if (!cancelled && el)
          el.innerHTML = `<p class="text-sm text-destructive">Diagrama inválido para o motor Mermaid actual.</p>`;
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className={className} aria-busy aria-live="polite" />;
}
