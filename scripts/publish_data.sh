#!/usr/bin/env bash
# publish_data.sh — Convierte un Excel oficial nuevo y lo publica para todo el equipo en un solo paso:
#   1. Corre scripts/build_data.py (agrega/actualiza data/*.json)
#   2. git add + commit + push
#
# Uso:
#   ./scripts/publish_data.sh --att ruta/GIEDCBFOR01.xlsx --sat ruta/GIEDCBFOR02.xlsx
#   ./scripts/publish_data.sh --att ruta/GIEDCBFOR01.xlsx        # solo asistencia
#
# Requiere: git configurado (usuario/email) y acceso de push al repositorio.

set -e  # se detiene si algo falla, en vez de seguir con datos a medias

cd "$(dirname "$0")/.."  # ubicarse en la raíz del proyecto sin importar desde dónde se llame

echo "→ Convirtiendo Excel a JSON…"
python3 scripts/build_data.py "$@"

if git diff --quiet data/ && git diff --cached --quiet data/; then
  echo "→ No hay cambios nuevos en data/ — nada que publicar."
  exit 0
fi

PERIODOS=$(python3 -c "
import json, glob
periodos = set()
for f in glob.glob('data/*.json'):
    with open(f, encoding='utf-8') as fh:
        for r in json.load(fh):
            if r.get('periodo'): periodos.add(r['periodo'])
print(', '.join(sorted(periodos)))
")

echo "→ Subiendo a GitHub…"
git add data/
git commit -m "Actualiza datos (periodos: ${PERIODOS})"
git push

echo "✓ Listo. GitHub Pages se actualizará en 1-2 minutos — todo el equipo verá los datos nuevos al recargar el link."
