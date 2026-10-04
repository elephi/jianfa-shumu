const PAGE_SIZE = 30;
const HOME_LIMIT = 100;
const HOME_SAMPLE_KEY = "jianfa-home-sample";
const state = { books: [], homeBooks: [], filteredBooks: [], rendered: 0, page: 1, query: "", tag: "全部", meta: {} };
const grid = document.querySelector("#book-grid");
const search = document.querySelector("#search");
const count = document.querySelector("#book-count");
const filters = document.querySelector("#tag-filters");
const empty = document.querySelector("#empty-state");
const dialog = document.querySelector("#book-dialog");
const template = document.querySelector("#book-template");
const sentinel = document.querySelector("#load-sentinel");
const pagination = document.querySelector("#pagination");
const palette = ["#16372b", "#8b3d2f", "#243a5a", "#66552b", "#4a315b", "#17656a"];

const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase();
const escapeHtml = value => String(value || "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

async function loadBooks() {
  try {
    const response = await fetch("books.json", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取书籍数据");
    const payload = await response.json();
    state.books = payload.books || [];
    state.homeBooks = createHomeSample();
    state.meta = payload.meta || {};
    document.querySelector("#updated-at").textContent = state.meta.updated_at || "未知";
    document.querySelector("#last-added-count").textContent = Math.max(0, Number(state.meta.last_added_count) || 0);
    document.querySelector("#total-book-count").textContent = Number(state.meta.count) || state.books.length;
    renderFilters();
    render();
  } catch (error) {
    grid.innerHTML = `<p class="load-error">${escapeHtml(error.message)}。请通过本地服务器打开页面。</p>`;
    grid.setAttribute("aria-busy", "false");
  }
}

function allTags() {
  const frequency = new Map();
  state.books.flatMap(book => book.tags || []).filter(tag => normalize(tag) !== "end").forEach(tag => frequency.set(tag, (frequency.get(tag) || 0) + 1));
  return [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([tag]) => tag);
}

function renderFilters() {
  filters.replaceChildren();
  const tags = allTags();
  const featured = tags.slice(0, 18);
  ["全部", ...featured].forEach(tag => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-filter";
    button.textContent = tag;
    button.setAttribute("aria-pressed", String(tag === state.tag));
    button.addEventListener("click", () => { state.tag = tag; state.page = 1; renderFilters(); render(); });
    filters.append(button);
  });
  if (tags.length > featured.length) {
    const select = document.createElement("select");
    select.className = "tag-select";
    select.setAttribute("aria-label", "选择更多标签");
    select.innerHTML = `<option value="">更多标签…</option>${tags.slice(featured.length).map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
    if (!featured.includes(state.tag) && state.tag !== "全部") select.value = state.tag;
    select.addEventListener("change", () => { if (select.value) { state.tag = select.value; state.page = 1; renderFilters(); render(); } });
    filters.append(select);
  }
}

function visibleBooks() {
  const query = normalize(state.query).trim();
  const source = isSearchMode() ? state.books : state.homeBooks;
  return source.filter(book => {
    const haystack = normalize([book.title, ...(book.authors || []), ...(book.tags || [])].join(" "));
    const matchesQuery = !query || query.split(/\s+/).every(term => haystack.includes(term));
    const matchesTag = state.tag === "全部" || (book.tags || []).includes(state.tag);
    return matchesQuery && matchesTag;
  });
}

function isSearchMode() {
  return normalize(state.query).trim() !== "" || state.tag !== "全部";
}

function shuffled(books) {
  const result = [...books];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function sampleSignature(books) {
  return books.map(book => String(book.id ?? book.title)).sort().join(",");
}

function createHomeSample() {
  const size = Math.min(HOME_LIMIT, state.books.length);
  let sample = shuffled(state.books).slice(0, size);
  let previous = "";
  try { previous = localStorage.getItem(HOME_SAMPLE_KEY) || ""; } catch (_) { /* storage may be unavailable */ }
  for (let attempt = 0; attempt < 5 && state.books.length > 1 && sampleSignature(sample) === previous; attempt += 1) {
    sample = shuffled(state.books).slice(0, size);
  }
  if (sampleSignature(sample) === previous && state.books.length > size) {
    const selected = new Set(sample.map(book => String(book.id ?? book.title)));
    const replacement = state.books.find(book => !selected.has(String(book.id ?? book.title)));
    if (replacement) sample[sample.length - 1] = replacement;
  }
  try { localStorage.setItem(HOME_SAMPLE_KEY, sampleSignature(sample)); } catch (_) { /* storage may be unavailable */ }
  return sample;
}

function render() {
  state.filteredBooks = visibleBooks();
  state.rendered = 0;
  grid.replaceChildren();
  count.textContent = state.filteredBooks.length;
  empty.hidden = state.filteredBooks.length > 0;
  grid.hidden = state.filteredBooks.length === 0;
  sentinel.hidden = true;
  pagination.hidden = true;
  if (isSearchMode()) renderSearchPage();
  else renderNextPage();
  grid.setAttribute("aria-busy", "false");
}

function renderNextPage() {
  if (state.rendered >= state.filteredBooks.length) {
    sentinel.hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  const nextBooks = state.filteredBooks.slice(state.rendered, state.rendered + PAGE_SIZE);
  nextBooks.forEach((book, index) => fragment.append(bookCard(book, state.rendered + index)));
  grid.append(fragment);
  state.rendered += nextBooks.length;
  sentinel.hidden = state.rendered >= state.filteredBooks.length;
}

function renderSearchPage() {
  const pageCount = Math.max(1, Math.ceil(state.filteredBooks.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pageCount);
  const start = (state.page - 1) * PAGE_SIZE;
  const fragment = document.createDocumentFragment();
  state.filteredBooks.slice(start, start + PAGE_SIZE).forEach((book, index) => fragment.append(bookCard(book, start + index)));
  grid.append(fragment);
  renderPagination(pageCount);
}

function renderPagination(pageCount) {
  pagination.replaceChildren();
  if (state.filteredBooks.length <= PAGE_SIZE) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  pagination.append(pageButton("上一页", state.page - 1, state.page === 1, "previous"));

  const pages = pageNumbers(state.page, pageCount);
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination-ellipsis";
      ellipsis.textContent = "…";
      pagination.append(ellipsis);
    }
    const button = pageButton(String(page), page, false);
    if (page === state.page) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    pagination.append(button);
  });

  pagination.append(pageButton("下一页", state.page + 1, state.page === pageCount, "next"));
}

function pageNumbers(current, total) {
  return [...new Set([1, current - 1, current, current + 1, total])]
    .filter(page => page >= 1 && page <= total)
    .sort((a, b) => a - b);
}

function pageButton(label, page, disabled, rel) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  if (rel) button.setAttribute("aria-label", rel === "previous" ? "上一页" : "下一页");
  button.addEventListener("click", () => {
    state.page = page;
    render();
    document.querySelector(".library").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return button;
}

function randomizeBooks() {
  state.homeBooks = createHomeSample();
  state.query = "";
  state.tag = "全部";
  state.page = 1;
  search.value = "";
  renderFilters();
  render();
  document.querySelector("#book-grid").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bookCard(book, index) {
  const card = template.content.firstElementChild.cloneNode(true);
  const cover = card.querySelector(".cover");
  const placeholder = card.querySelector(".cover-placeholder");
  const title = book.title || "未命名";
  if (book.cover) { cover.src = book.cover; cover.alt = `${title} 封面`; }
  else cover.removeAttribute("src");
  placeholder.style.setProperty("--placeholder", palette[(book.id ?? index) % palette.length]);
  placeholder.querySelector("span").textContent = title;
  placeholder.querySelector("small").textContent = (book.authors || []).join(" · ") || "未知作者";
  card.querySelector(".book-title").textContent = title;
  card.querySelector(".book-author").textContent = (book.authors || []).join(" · ") || "未知作者";
  card.querySelector(".book-tags").append(...(book.tags || []).filter(t => normalize(t) !== "end").slice(0, 3).map(tagChip));
  card.querySelector(".book-open").addEventListener("click", () => openBook(book));
  return card;
}

function tagChip(tag) { const span = document.createElement("span"); span.textContent = tag; return span; }

function openBook(book) {
  const tags = (book.tags || []).filter(t => normalize(t) !== "end").map(tag => `<span>${escapeHtml(tag)}</span>`).join("");
  const cover = book.cover ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} 封面">` : `<div class="cover-placeholder" style="position:relative;aspect-ratio:2/3;--placeholder:${palette[(book.id || 0) % palette.length]}"><span>${escapeHtml(book.title)}</span><small>${escapeHtml((book.authors || []).join(" · "))}</small></div>`;
  const calibreId = book.id == null ? "—" : escapeHtml(book.id);
  const isbn = book.isbn ? `<span class="dialog-isbn">ISBN ${escapeHtml(book.isbn)}</span>` : "";
  document.querySelector("#dialog-content").innerHTML = `<article class="dialog-book">${cover}<div class="dialog-meta"><p class="eyebrow">BOOK NOTES</p><h2>${escapeHtml(book.title)}</h2><div class="dialog-byline"><p class="dialog-author">${escapeHtml((book.authors || []).join(" · ") || "未知作者")}</p>${isbn}</div><div class="book-tags">${tags}</div><p class="dialog-description">${escapeHtml(book.description || "")}</p><p class="dialog-book-id">Calibre ID · ${calibreId}</p></div></article>`;
  dialog.showModal();
}

search.addEventListener("input", event => { state.query = event.target.value; state.page = 1; render(); });
document.querySelector("#clear-search").addEventListener("click", () => { search.value = ""; state.query = ""; state.tag = "全部"; state.page = 1; renderFilters(); render(); search.focus(); });
document.querySelector("#randomize").addEventListener("click", randomizeBooks);
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.focus(); } });
new IntersectionObserver(entries => {
  if (!isSearchMode() && entries.some(entry => entry.isIntersecting)) renderNextPage();
}, { rootMargin: "800px 0px" }).observe(sentinel);
loadBooks();
