# Deploy gratuito em produção (testes)

A aplicação em `ai_correlacion_web` é **um único servidor Node** (Express + tRPC + ficheiros estáticos do Vite). O cliente chama a API em URLs **relativas** (`/api/trpc`, `/api/oauth/...`), por isso o front e o back devem servir-se do **mesmo domínio**.

## Por que não é o caso típico do Vercel?

O **Vercel** é forte em sites estáticos, Next.js e funções serverless curtas. Este projeto usa:

- processo **Node contínuo** (Express, uploads grandes, timeouts longos);
- **ficheiros em disco** para uploads e artefatos (em ambientes serverless o disco é efémero e limitado);
- opcionalmente **MySQL** (`DATABASE_URL`).

Colocar isto no Vercel exigiria partir o backend em funções serverless e redesenhar armazenamento — trabalho grande. Para **testes gratuitos**, use um **Web Service** que execute `node dist/index.js`.

## Opção recomendada: Render (plano Free)

1. Conta em [render.com](https://render.com) e ligue o repositório GitHub.
2. **New → Web Service**, escolha este repo.
3. Configure:
   - **Root Directory:** `ai_correlacion_web`
   - **Runtime:** Node
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm run start`
   - **Instance type:** Free

4. **Variáveis de ambiente** — em `NODE_ENV=production` o servidor **exige** BD real, OAuth e segredo de sessão (ver código em `server/_core/env.ts`). Localmente podes omitir `DATABASE_URL` e usar memória.

| Variável | Produção (Render) | Notas |
|----------|---------------------|--------|
| `NODE_ENV` | Sim | `production` |
| `JWT_SECRET` | **Obrigatório** | String longa e aleatória (JWT da sessão em cookie). |
| `DATABASE_URL` | **Obrigatório** | MySQL (Drizzle/mysql2), ex.: `mysql://user:pass@host:3306/db`. Após definir: `npm run db:push` a partir de `ai_correlacion_web` (ou migrações equivalentes). |
| `DATABASE_SSL` | Opcional | `true`, `1` ou `require` se o fornecedor MySQL exigir TLS; caso contrário omitir. |
| `OAUTH_SERVER_URL` | **Obrigatório** | Base URL do serviço OAuth (gRPC-gateway / WebDev auth). |
| `VITE_APP_ID` | **Obrigatório** | ID da app no portal; tem de existir no **runtime** (servidor) e no **build** (cliente embutido pelo Vite). |
| `VITE_OAUTH_PORTAL_URL` | **Obrigatório para login no browser** | Base do portal OAuth; **só entra no bundle se estiver definida no momento do `npm run build`** no Render. Se mudares esta variável, faz **redeploy** para rebuildar. |
| `OWNER_OPEN_ID` | Opcional | OpenID do utilizador que recebe role admin na primeira sincronização. |
| `PORT` | Não | O Render define automaticamente. |

5. **OAuth / callback:** o redirect efetivo é `https://<teu-serviço>.onrender.com/api/oauth/callback` (o cliente usa `window.location.origin`). Esse URL tem de estar autorizado no portal OAuth. O servidor usa `trust proxy` para respeitar `X-Forwarded-Proto: https` e marcar cookies de sessão como `secure` atrás do proxy do Render.

6. **Cookies entre domínios:** as opções de cookie usam `SameSite=None` e `Secure` em HTTPS; sem trust proxy correto, o login OAuth pode falhar após o redirect.

7. **Limitações do plano Free (Render):**
   - O serviço **adormece** após inatividade; o primeiro pedido pode demorar ~1 minuto a “acordar”.
   - Disco **efémero**: uploads e ficheiros gerados no disco local da instância podem **perder-se** entre restarts ou deploys (usa armazenamento externo se precisares de persistência de ficheiros).
   - Em produção, jobs e utilizadores dependem do **MySQL** configurado; sem BD a app não arranca.

### Blueprint (ficheiro `render.yaml` na raiz do repo)

Podes usar **Blueprint → New Blueprint Instance** no Render e apontar para o `render.yaml` deste repositório; depois preenche no painel os segredos (`JWT_SECRET`, `DATABASE_URL`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, etc.). Garante que **todas** as `VITE_*` estão definidas **antes** do primeiro build com sucesso.

## Outras opções gratuitas (resumo)

| Plataforma | Ideia |
|------------|--------|
| [Fly.io](https://fly.io/docs/about/pricing/) | Máquina virtual leve; free allowance em créditos; necessitas `fly.toml` e CLI. |
| [Koyeb](https://www.koyeb.com/) | Web service gratuito com limites; semelhante ao Render. |
| [Railway](https://railway.app/) | Costuma ser pago após créditos iniciais; verificar política atual. |

Em todas: mesmo padrão — **build** `npm ci && npm run build` na pasta `ai_correlacion_web`, **start** `npm run start`, variáveis como acima.

## Verificação local do build de produção

Na pasta `ai_correlacion_web`:

```bash
npm ci
npm run build
set NODE_ENV=production
set JWT_SECRET=um-segredo-longo-para-teste-local
set DATABASE_URL=mysql://...
set OAUTH_SERVER_URL=https://...
set VITE_APP_ID=...
set VITE_OAUTH_PORTAL_URL=https://...
npm run start
```

Abre `http://localhost:3000` (ou a porta indicada no log). Sem as variáveis de produção completas, `validateProductionEnv` falha ao iniciar em `NODE_ENV=production`.

## Base de dados MySQL (obrigatório em produção no Render)

Precisas de um MySQL acessível a partir da internet (ex.: tiers gratuitos de fornecedores cloud; políticas mudam com frequência). Define `DATABASE_URL` no Render e, **uma vez**, aplica o esquema:

```bash
cd ai_correlacion_web
set DATABASE_URL=mysql://...
npm run db:push
```

Consulta `drizzle/` e o manual do sistema para o esquema.

---

**Resumo:** para testes em produção **sem custo** e com o mínimo de alterações de código, usa **Render (Web Service Free)** com `rootDir = ai_correlacion_web`, não Vercel para o stack completo atual.
