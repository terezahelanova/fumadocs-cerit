#!/bin/bash
set -euo pipefail

DEST=/opt/fumadocs

if [ -n "${URL:-}" ] && [ -n "${BRANCH:-}" ]; then
  SRC="$(mktemp -d)"

  # Shallow, single-branch checkout of exactly the branch requested.
  git clone --branch "$BRANCH" --single-branch --depth 1 "$URL" "$SRC"

  if [ -n "${DOCS_STORE:-}" ]; then
    find "$DOCS_STORE" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  fi

  # Export only tracked files into DEST — no .git metadata, and this
  # overlays without disturbing DEST/node_modules baked into the image.
  git -C "$SRC" archive HEAD | tar -x -C "$DEST"
  rm -rf "$SRC"

  cd "$DEST"

  # Remove every .gitignore so Tailwind v4 scans all source for classes.
  find . -type f -name .gitignore -delete

  pnpm build

  if [ "${INDEX_SEARCH:-true}" = "true" ]; then
    INDEXER_URL="${INDEXER_URL:-http://kube-docs-indexer:8080}"
    (
      set +e
      for i in $(seq 1 60); do
        curl -fs -o /dev/null http://127.0.0.1:3000/ && break
        sleep 2
      done

      for try in 1 2 3; do
        if [ -n "${REINDEX_TOKEN:-}" ]; then
          curl -fsS -X POST -H "X-Reindex-Token: $REINDEX_TOKEN" \
               "$INDEXER_URL/reindex" && break
        else
          curl -fsS -X POST "$INDEXER_URL/reindex" && break
        fi
        echo "INDEX-NOTIFY attempt $try failed" >&2
        sleep $((try * 10))
      done
    ) &
  fi

  exec pnpm start
else
  cd "$DEST"
  exec pnpm dev
fi
