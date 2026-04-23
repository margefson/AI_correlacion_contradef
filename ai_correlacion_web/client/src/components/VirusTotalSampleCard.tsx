import { ExplicitSha256Block } from "@/components/ExplicitSha256Block";

type Props = {
  sampleSha256?: string | null;
  className?: string;
};

export function VirusTotalSampleCard({ sampleSha256, className = "" }: Props) {
  if (!sampleSha256 || sampleSha256.length !== 64) {
    return null;
  }

  const hex = sampleSha256.toLowerCase();

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Correlação VirusTotal (amostra registada no job)</p>
      <ExplicitSha256Block
        sha256Lowercase={hex}
        variant="emerald"
        helperText="Este é o hash guardado nesta análise. No VirusTotal, confirme que a página do ficheiro apresenta exactamente o mesmo SHA-256."
      />
    </div>
  );
}
