#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/backend"
export LLM_PROVIDER=demo
exec .venv/bin/python -m pytest backend/tests -q
