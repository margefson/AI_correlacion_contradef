# Variáveis de ambiente no Render (produção)

Defina estas variáveis no **Web Service** (Settings → Environment).  
**Importante:** qualquer alteração a `VITE_*` exige **novo deploy** (com *build*), porque o Vite incorpora esses valores no bundle do cliente.

## Cenário recomendado: login local + PostgreSQL

| Variável | Obrigatório | Valor / exemplo | Notas |
|----------|-------------|-----------------|--------|
| `NODE_VERSION` | Recomendado | `22.12.0` (ou `20.x` LTS) | Garante Corepack + pnpm conforme o projeto. |
| `NODE_ENV` | Sim | `production` | |
| `AUTH_MODE` | Sim | `local` | Login com email e palavra-passe; registo em `/register`. |
| `VITE_AUTH_MODE` | Sim | `local` | Deve coincidir com `AUTH_MODE`; entra no **build**. |
| `JWT_SECRET` | Sim | String longa e aleatória | Não commite nem partilhe. |
| `DATABASE_URL` | Sim | `postgresql://USER:PASS@HOST:5432/DB?sslmode=require` | Use a instância Postgres do Render ou outra; `sslmode` se o host exigir TLS. |
| `DATABASE_SSL` | Opcional | `true` | Só se precisar de TLS e a URL não trouxer `sslmode`. |

## OAuth institucional (WebDev), além do login local

Se quiser o botão **«Entrar com OAuth»** funcional, preencha **também** (além da tabela acima):

| Variável | Obrigatório | Valor / exemplo | Notas |
|----------|-------------|-----------------|--------|
| `OAUTH_SERVER_URL` | Sim para OAuth | `https://<sua-api-webdev>` | Base da API que expõe `ExchangeToken` / serviço WebDev. |
| `VITE_OAUTH_PORTAL_URL` | Sim para OAuth | `https://<url-do-portal-no-browser>` | Página onde o utilizador faz login institucional. **Build + runtime.** |
| `VITE_APP_ID` | Sim para OAuth | id da aplicação WebDev | No **servidor** e no build; necessário para trocar o código OAuth. |

Registe o redirect **exato**: `https://<nome-do-serviço>.onrender.com/api/oauth/callback` no fornecedor OAuth / consola WebDev.

## Semente de administrador (opcional, só `AUTH_MODE=local`)

| Variável | Obrigatório | Exemplo | Notas |
|----------|-------------|---------|--------|
| `DEFAULT_LOCAL_ADMIN_EMAIL` | Opcional | `admin@empresa.com` | Criada/actualizada no arranque se ainda não existir. |
| `DEFAULT_LOCAL_ADMIN_PASSWORD` | Opcional | palavra-passe temporária | Altere de seguida no perfil; use palavra forte em produção. |

## Só com `AUTH_MODE=oidc` (Google / Microsoft)

| Variável | Obrigatório | Notas |
|----------|-------------|--------|
| `AUTH_MODE` | | `oidc` |
| `VITE_AUTH_MODE` | | `oidc` |
| `PUBLIC_APP_URL` | Sim | `https://<sua-app>.onrender.com` (sem `/` no fim) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Pelo menos um fornecedor | Com Microsoft em alternativa. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | | |

## Outros (opcionais)

| Variável | Uso |
|----------|------|
| `SKIP_DB_AUTO_PUSH` | `1` — desliga o *drizzle push* automático no arranque. |
| `OWNER_OPEN_ID` | Cenários legado / *owner* WebDev. |
| `CONTRADEF_WORK_TMP`, `CONTRADEF_REDUCE_LOGS_TMP` | Caminhos de disco para trabalhos pesados. |

**Build e start** sugeridos: ver ficheiro `render.yaml` na raiz do repositório.
