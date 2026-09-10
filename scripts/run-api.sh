#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/python ]; then
  echo 'Python 가상환경이 없습니다. README의 설치 순서를 먼저 진행하세요.' >&2
  exit 1
fi

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

API_PORT="${API_PORT:-8001}"
if ! [[ "$API_PORT" =~ ^[0-9]{1,5}$ ]] || (( 10#$API_PORT < 1 || 10#$API_PORT > 65535 )); then
  echo 'API_PORT는 1~65535 사이의 정수여야 합니다.' >&2
  exit 1
fi

echo "BlockWill 분석 API: http://127.0.0.1:${API_PORT}/docs"
echo "분석 모드: ${LLM_PROVIDER:-demo} / 종료: Ctrl+C"
exec .venv/bin/python -m uvicorn app.main:app --app-dir backend \
  --host 127.0.0.1 --port "$API_PORT"
