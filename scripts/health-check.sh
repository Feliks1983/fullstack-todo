cd "$(dirname "$0")/.." || exit 1

if command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"; else DC="docker compose"; fi
FILES=(-f docker-compose.yml)
if [ "${PROD:-0}" = "1" ]; then FILES=(--env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml); fi

FAILED=0
check() {  
  local name="$1"; shift
  if out=$("$@" 2>&1); then
    echo "  [ OK ] $name"
  else
    echo "  [FAIL] $name"; FAILED=1
  fi
}

echo "== Состояние контейнеров =="
$DC "${FILES[@]}" ps

echo
echo "== Проверки =="
check "frontend /health (внутри контейнера)" $DC "${FILES[@]}" exec -T frontend wget -qO- http://127.0.0.1/health
check "backend /health (через nginx, curl)"   curl -fsS --max-time 5 http://localhost/health
check "nginx stub_status"                     $DC "${FILES[@]}" exec -T nginx wget -qO- http://127.0.0.1/nginx-status
check "API /api/todos (через nginx)"          curl -fsSLk --max-time 5 "http://localhost/api/todos?limit=1"

echo
echo "== Ответ backend /health =="
curl -sS --max-time 5 http://localhost/health || true
echo

if [ "$FAILED" -eq 0 ]; then echo "Все проверки пройдены"; else echo "Есть проблемы"; exit 1; fi
