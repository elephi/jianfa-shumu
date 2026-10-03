#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "用法: ./scripts/sync-and-publish.sh '/你的/Calibre Library'"
  exit 2
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SITE_DIR=$(dirname "$SCRIPT_DIR")

python3 "$SCRIPT_DIR/export_calibre.py" --library "$1" --output "$SITE_DIR/dist" --tag END

if git -C "$SITE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 && git -C "$SITE_DIR" remote get-url origin >/dev/null 2>&1; then
  git -C "$SITE_DIR" add dist/books.json dist/covers
  if ! git -C "$SITE_DIR" diff --cached --quiet; then
    git -C "$SITE_DIR" commit -m "Update Calibre library"
    git -C "$SITE_DIR" push
    echo "已推送更新。托管平台会自动发布。"
  else
    echo "书库内容没有变化。"
  fi
else
  echo "已更新本地网站数据。配置 GitHub Pages 后，此命令也会自动提交并推送。"
fi
