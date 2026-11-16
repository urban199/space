#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null || { printf 'Python 3.10+ diperlukan.
' >&2; exit 1; }
python3 "$ROOT/scripts/build.py" --check
printf 'Siap. Jalankan bash run-game.sh, lalu buka http://127.0.0.1:8791/
'
