#!/usr/bin/env python3
"""Export books carrying a Calibre tag into a static website data set."""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path


def plain_description(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"<\s*br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</\s*p\s*>", "\n\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def export(library: Path, output: Path, tag: str) -> int:
    database = library / "metadata.db"
    if not database.is_file():
        raise FileNotFoundError(f"找不到 Calibre 数据库：{database}")

    output.mkdir(parents=True, exist_ok=True)
    covers = output / "covers"
    covers.mkdir(exist_ok=True)
    cache_dir = output.parent / ".cache"
    cache_dir.mkdir(exist_ok=True)
    cover_state_path = cache_dir / "cover-state.json"
    try:
        cover_state = json.loads(cover_state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        cover_state = {}
    next_cover_state = {}

    uri = f"file:{database.resolve()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT b.id, b.title, b.path, b.last_modified, c.text AS description
        FROM books b
        JOIN books_tags_link btl ON btl.book = b.id
        JOIN tags selected_tag ON selected_tag.id = btl.tag
        LEFT JOIN comments c ON c.book = b.id
        WHERE lower(selected_tag.name) = lower(?)
          AND NOT EXISTS (
              SELECT 1
              FROM books_tags_link hidden_link
              JOIN tags hidden_tag ON hidden_tag.id = hidden_link.tag
              WHERE hidden_link.book = b.id
                AND lower(hidden_tag.name) = lower('HIDDEN')
          )
        ORDER BY b.sort COLLATE NOCASE
        """,
        (tag,),
    ).fetchall()

    author_query = """
        SELECT a.name FROM authors a
        JOIN books_authors_link bal ON bal.author = a.id
        WHERE bal.book = ? ORDER BY bal.id
    """
    tag_query = """
        SELECT t.name FROM tags t
        JOIN books_tags_link btl ON btl.tag = t.id
        WHERE btl.book = ? ORDER BY t.name COLLATE NOCASE
    """

    books = []
    active_covers = set()
    exported_cover_paths = []
    for row in rows:
        book_id = row["id"]
        authors = [item[0] for item in connection.execute(author_query, (book_id,))]
        tags = [item[0] for item in connection.execute(tag_query, (book_id,))]
        source_cover = library / row["path"] / "cover.jpg"
        cover_url = None
        if source_cover.is_file():
            filename = f"{book_id}.jpg"
            target_cover = covers / filename
            source_stat = source_cover.stat()
            signature = f"{source_stat.st_size}:{source_stat.st_mtime_ns}"
            # Existing covers predate the cache and were just generated from the
            # same library. Register them without re-encoding every book once.
            if not target_cover.is_file() or (filename in cover_state and cover_state[filename] != signature):
                shutil.copy2(source_cover, target_cover)
                exported_cover_paths.append(target_cover)
            active_covers.add(filename)
            next_cover_state[filename] = signature
            cover_url = f"covers/{filename}"
        books.append({
            "id": book_id,
            "title": row["title"],
            "authors": authors,
            "tags": tags,
            "cover": cover_url,
            "description": plain_description(row["description"]),
        })

    connection.close()
    for existing in covers.glob("*.jpg"):
        if existing.name not in active_covers:
            existing.unlink()

    # Keep a large library lightweight on the web. macOS ships `sips`; on other
    # systems the original cover is preserved unless the user adds an optimizer.
    sips = shutil.which("sips")
    if sips:
        for start in range(0, len(exported_cover_paths), 100):
            subprocess.run(
                [sips, "-Z", "720", "--setProperty", "formatOptions", "60", *map(str, exported_cover_paths[start : start + 100])],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    cover_state_path.write_text(json.dumps(next_cover_state, indent=2) + "\n", encoding="utf-8")

    payload = {
        "meta": {
            "tag": tag,
            "updated_at": max((row["last_modified"] for row in rows), default="未知"),
            "count": len(books),
        },
        "books": books,
    }
    (output / "books.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(books)


def main() -> int:
    parser = argparse.ArgumentParser(description="把带指定标签、且没有 HIDDEN 标签的 Calibre 书籍导出为静态网站数据")
    parser.add_argument("--library", type=Path, required=True, help="Calibre 书库目录（包含 metadata.db）")
    parser.add_argument("--tag", default="END", help="需要导出的标签，默认 END")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "dist", help="网站输出目录")
    args = parser.parse_args()
    try:
        count = export(args.library.expanduser().resolve(), args.output.resolve(), args.tag)
    except (OSError, sqlite3.Error) as error:
        print(f"导出失败：{error}", file=sys.stderr)
        return 1
    print(f"已导出 {count} 本带有 {args.tag!r}、且不带 'HIDDEN' 标签的书。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
