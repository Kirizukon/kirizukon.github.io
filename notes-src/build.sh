#!/usr/bin/env bash
# Build MkDocs + format HTML output with djlint.
set -euo pipefail

cd "$(dirname "$0")"

mkdocs build

OUT="../notes"
echo "Formatting HTML in $OUT ..."

djlint "$OUT" \
  --reformat \
  --indent 2 \
  --profile html \
  --extension html \
  --quiet || true

echo "Done."
