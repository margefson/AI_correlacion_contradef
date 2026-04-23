import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background via-muted/30 to-muted/60">
      <Card className="mx-4 w-full max-w-lg border-border bg-card text-card-foreground shadow-lg backdrop-blur-sm">
        <CardContent className="pb-8 pt-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-destructive/15 dark:bg-destructive/25" />
              <AlertCircle className="relative h-16 w-16 text-destructive" />
            </div>
          </div>

          <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>

          <h2 className="mb-4 text-xl font-semibold text-foreground">Página não encontrada</h2>

          <p className="mb-8 leading-relaxed text-muted-foreground">
            A página que procura não existe ou foi movida.
            <br />
            Verifique o endereço ou regresse ao início.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col justify-center gap-3 sm:flex-row"
          >
            <Button onClick={handleGoHome} size="lg" className="px-6 shadow-md transition-all hover:shadow-lg">
              <Home className="mr-2 h-4 w-4" />
              Ir para o início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
