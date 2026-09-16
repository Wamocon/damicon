#!/usr/bin/env bash
# Installiert den Pre-commit Hook. Einmalig nach dem Klonen ausfuehren:
#
#   bash hooks/install.sh
#
# Setzt core.hooksPath auf dieses Verzeichnis. Damit gilt der Hook auch in
# jedem zusaetzlichen Arbeitsbaum (git worktree), ohne dort erneut
# installiert zu werden - alle Arbeitsbaeume teilen sich dieselbe
# Repository-Konfiguration.

set -euo pipefail

wurzel=$(git rev-parse --show-toplevel)
cd "$wurzel"

if [ ! -f hooks/pre-commit ]; then
  printf 'hooks/pre-commit fehlt. Falsches Verzeichnis?\n' >&2
  exit 1
fi

chmod +x hooks/pre-commit 2>/dev/null || true
git config core.hooksPath hooks

printf 'Pre-commit Hook aktiv (core.hooksPath = hooks).\n'
printf 'Er prueft vor jedem Commit auf Geheimnisse und faehrt typecheck und lint.\n'
printf 'Probelauf ohne Commit: bash hooks/pre-commit\n'
