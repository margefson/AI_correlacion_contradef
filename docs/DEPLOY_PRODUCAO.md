# Deploy em produção (`ai_correlacion_web`)

A aplicação é **um único servidor Node** (Express + tRPC + ficheiros estáticos do Vite). O cliente usa URLs **relativas** (`/api/trpc`, `/api/oauth/...`), por isso o front-end e a API devem ser servidos no **mesmo domínio**.

**Requisitos típicos:** processo Node **contínuo** (não serverless de curta duração), suporte a **uploads** e tempos de resposta longos quando necessário, e **PostgreSQL** acessível a partir do serviço (`DATABASE_URL`). No Render, podes criar um **PostgreSQL gerido** e ligar a `Internal Database URL` ao Web Service.

---

## Passo a passo recomendado: [Render](https://render.com) (Web Service)

1. Cria conta no Render e liga o repositório Git (ex.: GitHub).
2. **New → PostgreSQL** (opcional mas recomendado no Render) e anota a **Internal Database URL** ou **External Database URL** (`postgresql://...`).
3. **New → Web Service** e seleciona este repositório.
4. Configura o serviço:
   - **Root Directory:** `ai_correlacion_web`
   - **Runtime:** Node
   - **Build Command:** `npm ci --include=dev && npm run build` — com `NODE_ENV=production` no painel, o `npm ci` **não** instala `devDependencies` por omissão; Vite e esbuild estão em devDependencies, por isso é preciso `--include=dev`. O ficheiro `ai_correlacion_web/.npmrc` mantém `legacy-peer-deps=true` para o plugin Builder.io com Vite 7.
   - **Start Command:** `npm run start`
   - **Instance type:** escolhe o plano que fizer sentido para carga e disponibilidade (o Render atribui `PORT` automaticamente).

5. **Variáveis de ambiente** — com `NODE_ENV=production`, o servidor **exige** base de dados, OAuth e segredo de sessão (ver `server/_core/env.ts`). Em desenvolvimento local podes omitir `DATABASE_URL` e usar armazenamento em memória.

| Variável | Em produção | Notas |
|----------|-------------|--------|
| `NODE_ENV` | Sim | `production` |
| `JWT_SECRET` | **Obrigatório** | String longa e aleatória (JWT da sessão em cookie). |
| `DATABASE_URL` | **Obrigatório** | PostgreSQL (Drizzle + `pg`), ex.: `postgresql://user:pass@host:5432/db`. No Render, usa a URL que o painel do Postgres mostra. Depois de criar a BD, aplica o esquema com `npm run db:push` a partir de `ai_correlacion_web` (base vazia ou migrações geridas por ti). |
| `DATABASE_SSL` | Opcional | `true`, `1` ou `require` força TLS no cliente `pg`. A URL com `sslmode=require` também activa SSL no código. |
| `OAUTH_SERVER_URL` | **Obrigatório** | Base URL do serviço OAuth (gRPC-gateway / WebDev auth). |
| `VITE_APP_ID` | **Obrigatório** | ID da app no portal; tem de existir no **runtime** (servidor) e no **build** (cliente embutido pelo Vite). |
| `VITE_OAUTH_PORTAL_URL` | **Obrigatório para login no browser** | Base do portal OAuth; **só entra no bundle se estiver definida no momento do `npm run build`**. Se alterares este valor, faz **redeploy** para voltar a compilar o front-end. |
| `OWNER_OPEN_ID` | Opcional | OpenID do utilizador que recebe role admin na primeira sincronização. |
| `PORT` | Não | O Render define automaticamente; a app já usa `process.env.PORT`. |

6. **OAuth / callback:** o redirect é `https://<o-teu-dominio>/api/oauth/callback` (em `onrender.com`, por exemplo `https://<nome-do-serviço>.onrender.com/api/oauth/callback`). O cliente usa `window.location.origin`. Esse URL tem de estar autorizado no portal OAuth.

7. **Proxy e cookies:** o servidor usa `trust proxy` para respeitar `X-Forwarded-Proto: https` e marcar cookies de sessão como `secure` atrás do proxy. As opções de cookie usam `SameSite=None` e `Secure` em HTTPS; sem isto correto atrás do proxy, o login OAuth pode falhar após o redirect.

8. **Disco e disponibilidade:** em muitos PaaS o disco da instância é **efémero** — uploads e ficheiros gerados localmente podem perder-se entre restarts ou deploys; usa armazenamento externo (object storage, etc.) se precisares de persistência de ficheiros. Consoante o plano, o serviço pode **suspender por inatividade**; o primeiro pedido após um período sem tráfego pode demorar mais. Em produção, jobs e utilizadores persistem no **PostgreSQL** configurado; sem BD válida a app não arranca.

### Blueprint (`render.yaml` na raiz do repositório)

Podes usar **Blueprint → New Blueprint Instance** no Render e apontar para o `render.yaml`. Depois preenche no painel os segredos (`JWT_SECRET`, `DATABASE_URL`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, etc.). Garante que todas as **`VITE_*`** necessárias estão definidas **antes** do primeiro build com sucesso.

---

## Outras plataformas

Qualquer fornecedor que permita um **processo Node de longa duração** com comandos de **build** e **start** personalizados pode seguir o mesmo padrão:

- diretório de trabalho: `ai_correlacion_web`
- build: `npm ci --include=dev && npm run build` (se `NODE_ENV=production` durante o build)
- start: `npm run start`
- mesmas variáveis de ambiente que na tabela acima

---

## Verificação local do build de produção

Na pasta `ai_correlacion_web`:

```bash
npm ci --include=dev
npm run build
set NODE_ENV=production
set JWT_SECRET=um-segredo-longo-para-teste-local
set DATABASE_URL=postgresql://user:pass@localhost:5432/db
set OAUTH_SERVER_URL=https://...
set VITE_APP_ID=...
set VITE_OAUTH_PORTAL_URL=https://...
npm run start
```

Abre `http://localhost:3000` (ou a porta indicada no log). Sem as variáveis de produção completas, `validateProductionEnv` falha ao iniciar com `NODE_ENV=production`.

---

## Base de dados PostgreSQL

Precisas de um PostgreSQL acessível a partir do ambiente onde o serviço corre. No **Render**, cria uma instância **PostgreSQL** e copia a URL (`postgresql://...`) para `DATABASE_URL` do Web Service.

**Migração desde MySQL:** este repositório passou a usar só PostgreSQL; **não** há migração automática de dados. Para bases MySQL antigas, exporta/importa manualmente ou recria o esquema vazio e faz `db:push`.

Numa base **nova**, aplica o esquema Drizzle **uma vez**:

```bash
cd ai_correlacion_web
set DATABASE_URL=postgresql://...
npm run db:push
```

Consulta `drizzle/schema.ts` e a documentação do projeto para o modelo.

---

**Resumo:** o caminho documentado aqui é um **Web Service Node** no Render com `rootDir = ai_correlacion_web`, **PostgreSQL** (nativo no Render), variáveis de ambiente de produção preenchidas e esquema aplicado com `db:push` antes ou logo após o primeiro deploy.
