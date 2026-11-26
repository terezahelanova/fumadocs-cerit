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

  # Start Fumadocs so /api/toc is available for indexing.
  pnpm start &
  SERVER_PID=$!

  # Forward termination signals to the server.
  trap 'kill "$SERVER_PID" 2>/dev/null || true' TERM INT EXIT

  if [ "${INDEX_SEARCH:-true}" = "true" ]; then
    # Wait until Fumadocs is available.
    for i in $(seq 1 60); do
      if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
        break
      fi

      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "Fumadocs server stopped before indexing" >&2
        exit 1
      fi

      if [ "$i" -eq 60 ]; then
        echo "Fumadocs server did not become available" >&2
        exit 1
      fi

      sleep 2
    done

    python3 "$DEST/upload_data.py" "$DEST/content/docs"
  fi

  touch /tmp/successful-reindex

  wait "$SERVER_PID"
else
  cd "$DEST"
  exec pnpm dev
fi
