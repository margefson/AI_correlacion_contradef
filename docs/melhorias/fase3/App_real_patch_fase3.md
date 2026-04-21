# App.tsx — fase 3 de patch

## Objetivo
Completar o roteamento e a composição visual da aplicação.

## Estrutura de implementação sugerida
```tsx
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/reduce-logs" component={ReduceLogs} />
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  )
}
```

## Checklist de alteração
- Definir a rota inicial para `Home`.
- Mapear a tela de redução para `ReduceLogs`.
- Tratar rota inexistente com `NotFound`.
- Manter `ThemeProvider` e `TooltipProvider` no topo.
- Preservar `Toaster` e `ErrorBoundary` na composição.
- Evitar lógica fora da camada de UI.

## Observações
- O app deve continuar simples de navegar.
- As telas principais precisam ficar acessíveis por rota direta.
- Esse arquivo deve só compor, não processar dados.
