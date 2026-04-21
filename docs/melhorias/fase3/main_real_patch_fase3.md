# main.tsx — fase 3 de patch

## Objetivo
Finalizar o bootstrap da aplicação com providers corretos e renderização estável.

## Estrutura de implementação sugerida
```tsx
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </trpc.Provider>
  </QueryClientProvider>
)
```

## Checklist de alteração
- Encapsular a aplicação com `QueryClientProvider`.
- Manter o provider do `trpc` com o mesmo `queryClient`.
- Preservar `ThemeProvider` e `TooltipProvider`.
- Garantir `Toaster` e `ErrorBoundary` no nível correto.
- Renderizar `App` por último na árvore visual.
- Evitar efeitos colaterais fora do bootstrap.

## Observações
- O objetivo é manter a app previsível na inicialização.
- Esse arquivo não deve carregar regra de negócio.
- Qualquer erro de API continua centralizado no fluxo de cache já existente.
