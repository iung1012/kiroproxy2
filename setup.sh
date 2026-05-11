#!/usr/bin/env bash
# setup.sh — deploy do kiro-stack na VPS
# Uso: bash setup.sh
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$STACK_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[ERRO]${NC} $*"; exit 1; }

# ── 1. Dependências ───────────────────────────────────────────────────────────
info "Verificando dependências..."

command -v docker &>/dev/null  || error "'docker' não encontrado. Instale: https://get.docker.com"
docker compose version &>/dev/null || error "'docker compose' (plugin v2) não encontrado."

# ── 2. .env ───────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Criando .env a partir de .env.example..."
  cp .env.example .env
  warn "Edite o arquivo .env agora — no mínimo defina PROXY_API_KEY"
  echo ""
  read -r -p "Pressione Enter após salvar o .env..."
fi

# Valida variável obrigatória
source .env
if [ -z "${PROXY_API_KEY:-}" ] || [ "$PROXY_API_KEY" = "troque-por-uma-senha-forte" ]; then
  error "Defina um valor real para PROXY_API_KEY no arquivo .env"
fi

# ── 3. Diretórios de dados ────────────────────────────────────────────────────
info "Criando diretórios de dados..."
mkdir -p data/kirobug

# ── 4. Build e deploy ─────────────────────────────────────────────────────────
info "Fazendo build e subindo containers (pode levar alguns minutos)..."
docker compose up -d --build

# ── 5. Aguarda serviços ficarem prontos ───────────────────────────────────────
info "Aguardando kirobug ficar saudável..."
for i in $(seq 1 30); do
  if docker compose ps kirobug | grep -q "healthy"; then
    break
  fi
  echo -n "."
  sleep 5
done
echo ""

# ── 6. Status final ───────────────────────────────────────────────────────────
docker compose ps

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
APP_PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2 || echo "80")

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Stack no ar!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  Acesso único  →  http://${HOST_IP}:${APP_PORT}"
echo ""
echo "  Rotas disponíveis:"
echo "  /         → Painel kirobug (registro de contas)"
echo "  /v1/      → API Gateway (OpenAI/Anthropic compat)"
echo "  /health   → Status do gateway"
echo ""
echo "  Próximos passos:"
echo "  1. Acesse http://${HOST_IP}:${APP_PORT} e registre contas Kiro em massa"
echo "  2. O bridge sincroniza automaticamente a cada ${SYNC_INTERVAL:-300}s"
echo "  3. Use a API com: Authorization: Bearer \$PROXY_API_KEY"
echo ""
echo "  Logs:   docker compose logs -f"
echo "  Status: docker compose ps"
echo ""
