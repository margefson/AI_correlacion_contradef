import { createContext, useContext } from "react";
import type { ReductionFileMetric } from "@shared/analysis";

export const LogEvidenceFileMetricsContext = createContext<readonly ReductionFileMetric[]>([]);

export function useEvidenceFileMetricRows(): readonly ReductionFileMetric[] {
  return useContext(LogEvidenceFileMetricsContext);
}
