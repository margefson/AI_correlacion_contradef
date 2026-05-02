import { createContext, useContext } from "react";

export type LogEvidenceShellContextValue = {
  /** Fecha o fluxo e volta ao separador Resumo (tabela MITRE). */
  onBackToSummary?: () => void;
};

export const LogEvidenceShellContext = createContext<LogEvidenceShellContextValue | null>(null);

export function useLogEvidenceShell() {
  return useContext(LogEvidenceShellContext);
}
