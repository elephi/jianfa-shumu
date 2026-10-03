# 减法书目 — Calibre END 精选书单

一个零后端、可免费托管的 Calibre 精选书单网站。“减法书目”只公开经过筛选、带 `END` 标签的书籍，并支持按书名、作者和标签搜索。

## 本地预览

```bash
cd site
python3 -m http.server 8000 --directory dist
```

浏览器打开 `http://localhost:8000`。

## 从 Calibre 更新

先关闭 Calibre，或确保它当前没有修改书库。运行：

```bash
cd site
python3 scripts/export_calibre.py --library "/你的/Calibre Library"
```

脚本会只读打开 `metadata.db`，导出带 `END` 标签的书名、作者、标签、封面和简介到 `dist/`。不会上传电子书文件。

## 免费公开部署：GitHub Pages

1. 把 `site` 目录初始化为 Git 仓库并推送到一个 GitHub 仓库的 `main` 分支。
2. 在仓库 Settings → Pages → Build and deployment 中，把 Source 设为 **GitHub Actions**。
3. 推送后，仓库内置的工作流会自动发布 `dist/`。

以后更新并发布只需：

```bash
./scripts/sync-and-publish.sh "/你的/Calibre Library"
```

该命令会重新导出、提交并推送改动。GitHub Pages 随后自动发布。

## 隐私说明

- 网站公开的是元数据和封面，不包含 EPUB、PDF 等电子书文件。
- 简介和封面可能受版权保护；公开分享前请确认你的使用场景和所在地规则。
- 若不希望公开某个标签，可在导出脚本中改变筛选标签，或从 Calibre 移除该书的 `END` 标签。
