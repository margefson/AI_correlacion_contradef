# Guia de Deployment - Incident Security System

## Pré-requisitos

### Sistema Operacional
- **Linux** (Ubuntu 22.04 LTS recomendado)
- **Node.js** 22.13.0 ou superior
- **Python** 3.11 ou superior
- **npm** ou **pnpm** (gerenciador de pacotes)

### Dependências do Sistema
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv git curl
```

### Dependências Python (ML Services)
As dependências Python são instaladas automaticamente durante o startup do servidor Node.js. O arquivo `ml/requirements.txt` contém:

```
flask==3.1.0
joblib==1.4.2
scikit-learn==1.8.0
pandas==2.2.3
openpyxl==3.1.2
```

Se você precisar instalar manualmente:
```bash
cd ml
pip install -r requirements.txt
```

## Instalação

### 1. Clonar o Repositório
```bash
git clone <repository-url>
cd incident_security_system
```

### 2. Instalar Dependências Node.js
```bash
pnpm install
# ou
npm install
```

### 3. Configurar Variáveis de Ambiente
Criar arquivo `.env` na raiz do projeto:
```env
DATABASE_URL=mysql://user:password@localhost:3306/incident_security_system
JWT_SECRET=seu_secret_jwt_aqui
VITE_APP_ID=seu_app_id
OAUTH_SERVER_URL=https://api.manus.im
```

### 4. Executar Migrações do Banco de Dados
```bash
pnpm db:push
```

## Inicialização

### Desenvolvimento
```bash
pnpm dev
```

O servidor iniciará em `http://localhost:3000` e automaticamente:
1. Instalará dependências Python (se necessário)
2. Iniciará o serviço Flask ML na porta 5001 (com lazy loading de modelo)
3. Iniciará o serviço Flask PDF na porta 5002
4. Emitirá notificação quando Flask iniciar com sucesso (Startup Hooks)

### Otimizações de Performance (Sessão 32)

#### Lazy Loading de Modelo ML
- O modelo TF-IDF + Naive Bayes é carregado apenas na primeira requisição
- Reduz tempo de startup do Flask de 8-12s para ~1s
- Primeira classificação leva 8-12s, subsequentes <1s

#### Cache em Memória
- Modelo mantido em cache global após primeira carga
- Evita recarregamento desnecessário
- Requisições em cache respondem em <500ms

#### Startup Hooks
- Notificação automática quando Flask inicia com sucesso
- Timestamp de carregamento do modelo (`model_loaded_at`)
- Health check com informações de dataset

#### Health Check com Fallback
- Classificação por palavras-chave se Flask indisponível
- Mantém sistema funcional mesmo com serviço ML offline
- Fallback retorna categorias baseadas em keywords

### Produção
```bash
pnpm build
pnpm start
```

## Tempos de Inicialização

### Startup Inicial
| Componente | Tempo Esperado | Descrição |
|-----------|----------------|-----------|
| Node.js Server | 2-3s | Inicialização do Express + tRPC |
| Python Dependencies | 5-10s | Instalação de pip packages (primeira vez) |
| Flask ML Startup | 8-12s | Carregamento do modelo TF-IDF + Naive Bayes |
| Flask PDF Startup | 3-5s | Inicialização do serviço de PDF |
| **Total** | **20-30s** | Tempo total até sistema estar pronto |

### Restart de Serviço Flask
Quando você clica em "Reiniciar Serviço" na interface:
- **Tempo de espera**: 15 segundos (configurável em `server/routers.ts`)
- **Motivo**: O Flask leva ~8-12s para carregar o modelo ML

## Health Check

O sistema fornece dois endpoints de health check:

### 1. Status Simples (online/offline)
```bash
GET /api/trpc/admin.getFlaskStatus
```

Resposta:
```json
{
  "overall": "online",
  "checked_at": "2026-04-09T15:50:00Z",
  "services": [
    {
      "name": "Flask ML",
      "port": 5001,
      "status": "online",
      "latency": 45,
      "details": { ... }
    }
  ]
}
```

### 2. Status Progressivo (ready/loading/error)
```bash
GET /api/trpc/admin.getFlaskStatusDetailed
```

Resposta:
```json
{
  "overall": "ready",
  "checked_at": "2026-04-09T15:50:00Z",
  "services": [
    {
      "name": "Flask ML",
      "port": 5001,
      "status": "ready",
      "latency": 45
    }
  ]
}
```

**Status Possíveis:**
- `ready`: Serviço respondendo normalmente
- `loading`: Serviço retornou HTTP 503 (carregando)
- `error`: Serviço não respondeu ou retornou erro

## Monitoramento

### Logs do Servidor
```bash
# Ver logs em tempo real
tail -f /tmp/server.log

# Ver logs do Flask ML
tail -f ml/flask_5001.log

# Ver logs do Flask PDF
tail -f ml/flask_5002.log
```

### Verificar Status dos Serviços
```bash
# Verificar se Flask ML está respondendo
curl http://localhost:5001/health

# Verificar se Flask PDF está respondendo
curl http://localhost:5002/health
```

## Troubleshooting

### Flask ML não inicia
**Sintoma**: Erro "Classifier server did not respond in time"

**Solução**:
1. Verificar se Python 3.11+ está instalado: `python3 --version`
2. Instalar dependências manualmente: `cd ml && pip install -r requirements.txt`
3. Verificar logs: `cat ml/flask_5001.log`

### Erro "Service Unavailable" ao reiniciar (Sessão 33-37)
**Sintoma**: Ao clicar em "Reiniciar Serviço", recebe erro "Unexpected token 'S', 'Service Unavailable' is not valid JSON"

**Causa Raiz**: O Flask retorna HTTP 503 com corpo HTML durante o carregamento do modelo. O código tentava fazer `.json()` sem validar o Content-Type.

**Solução** (Implementada em S33-S35):
1. Validação dupla: Content-Type + try/catch para parse JSON (S35)
2. Tratamento completo de todos os status HTTP: 2xx (sucesso), 503 (retry), 4xx/5xx (erro com retry)
3. Tratamento robusto de erros de conexão: timeout, ECONNREFUSED, ENOTFOUND
4. Retry automático mantido: até 3 tentativas com 2s entre elas
5. Startup do servidor tenta 3 vezes inicializar Flask antes de usar fallback

**Fallback Automático** (Sessão 34):
- Se Flask não iniciar em produção, sistema usa classificação por palavras-chave
- Classificação por palavras-chave funciona 100% mesmo sem Flask
- Sistema continua 100% funcional em modo fallback

**Se ainda tiver problemas**:
1. Verificar logs: `tail -f ml/flask_5001.log`
2. Aumentar timeout em `server/_core/index.ts` linha 110 se necessário
3. Verificar recursos do sistema (CPU, memória) - modelo ML requer ~200MB
4. Em produção, usar `pnpm start` ao invés de `pnpm dev`
5. Se Flask não estiver disponível, sistema usará fallback automático com 100% de funcionalidade

### Porta 5001/5002 já em uso
**Sintoma**: Erro "Address already in use"

**Solução**:
```bash
# Encontrar processo usando a porta
lsof -i :5001
lsof -i :5002

# Matar processo
kill -9 <PID>
```

## Performance

### Otimizações Recomendadas

1. **Aumentar Memória Disponível**
   - Flask ML requer ~200MB para carregar o modelo
   - Node.js requer ~150MB
   - Recomendado: 1GB+ de RAM

2. **Usar SSD**
   - Melhora tempo de carregamento do modelo (~30% mais rápido)

3. **Configurar Swap**
   - Se memória for limitada, configurar swap de 2GB

## Deployment em Produção

### Usando Systemd
Criar arquivo `/etc/systemd/system/incident-security.service`:

```ini
[Unit]
Description=Incident Security System
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/incident_security_system
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Ativar serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable incident-security
sudo systemctl start incident-security
```

### Usando Docker
Dockerfile exemplo:
```dockerfile
FROM node:22-alpine
FROM python:3.11-alpine

WORKDIR /app
COPY . .

RUN pnpm install && pnpm build
RUN cd ml && pip install -r requirements.txt

EXPOSE 3000 5001 5002

CMD ["pnpm", "start"]
```

## Segurança

- ✅ Todas as senhas são hasheadas com bcrypt (saltRounds=12)
- ✅ Cookies são httpOnly e secure
- ✅ CORS configurado para aceitar apenas origem do frontend
- ✅ Rate limiting ativo (100 req/IP/15min global)
- ✅ Helmet middleware ativo para headers de segurança

Veja `README.md` seção "Segurança" para mais detalhes.

## Suporte

Para reportar problemas ou sugestões, abra uma issue no repositório GitHub.
