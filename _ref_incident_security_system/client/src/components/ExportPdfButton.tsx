import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportPdfButtonProps {
  category?: string;
  riskLevel?: string;
  adminMode?: boolean;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export default function ExportPdfButton({
  category,
  riskLevel,
  adminMode = false,
  label = "Exportar PDF",
  variant = "outline",
  className = "",
}: ExportPdfButtonProps) {
  const exportMutation = trpc.reports.exportPdf.useMutation({
    onSuccess: (data) => {
      // Decode base64 and trigger browser download
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`PDF gerado com ${data.incidentCount} incidente(s)`);
    },
    onError: (e) => {
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    },
  });

  return (
    <Button
      variant={variant}
      className={`font-mono text-sm gap-2 ${className}`}
      style={
        variant === "outline"
          ? {
              borderColor: "oklch(0.85 0.2 195 / 0.4)",
              color: "oklch(0.85 0.2 195)",
              background: "oklch(0.85 0.2 195 / 0.05)",
            }
          : undefined
      }
      disabled={exportMutation.isPending}
      onClick={() =>
        exportMutation.mutate({
          category: category || undefined,
          riskLevel: riskLevel || undefined,
          adminMode,
        })
      }
    >
      {exportMutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      {exportMutation.isPending ? "Gerando..." : label}
    </Button>
  );
}
