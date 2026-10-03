const state = { books: [], query: "", tag: "全部", meta: {} };
const grid = document.querySelector("#book-grid");
const search = document.querySelector("#search");
const count = document.querySelector("#book-count");
const filters = document.querySelector("#tag-filters");
const empty = document.querySelector("#empty-state");
const dialog = document.querySelector("#book-dialog");
const template = document.querySelector("#book-template");
const palette = ["#16372b", "#8b3d2f", "#243a5a", "#66552b", "#4a315b", "#17656a"];

const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase();
const escapeHtml = value => String(value || "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

async function loadBooks() {
  try {
    const response = await fetch("books.json", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取书籍数据");
    const payload = await response.json();
    state.books = payload.books || [];
    state.meta = payload.meta || {};
    document.querySelector("#updated-at").textContent = state.meta.updated_at || "未知";
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
    button.addEventListener("click", () => { state.tag = tag; renderFilters(); render(); });
    filters.append(button);
  });
  if (tags.length > featured.length) {
    const select = document.createElement("select");
    select.className = "tag-select";
    select.setAttribute("aria-label", "选择更多标签");
    select.innerHTML = `<option value="">更多标签…</option>${tags.slice(featured.length).map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
    if (!featured.includes(state.tag) && state.tag !== "全部") select.value = state.tag;
    select.addEventListener("change", () => { if (select.value) { state.tag = select.value; renderFilters(); render(); } });
    filters.append(select);
  }
}

function visibleBooks() {
  const query = normalize(state.query).trim();
  return state.books.filter(book => {
    const haystack = normalize([book.title, ...(book.authors || []), ...(book.tags || [])].join(" "));
    const matchesQuery = !query || query.split(/\s+/).every(term => haystack.includes(term));
    const matchesTag = state.tag === "全部" || (book.tags || []).includes(state.tag);
    return matchesQuery && matchesTag;
  });
}

function render() {
  const books = visibleBooks();
  grid.replaceChildren();
  count.textContent = books.length;
  empty.hidden = books.length > 0;
  grid.hidden = books.length === 0;
  books.forEach((book, index) => grid.append(bookCard(book, index)));
  grid.setAttribute("aria-busy", "false");
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
  document.querySelector("#dialog-content").innerHTML = `<article class="dialog-book">${cover}<div class="dialog-meta"><p class="eyebrow">BOOK NOTES</p><h2>${escapeHtml(book.title)}</h2><p class="dialog-author">${escapeHtml((book.authors || []).join(" · ") || "未知作者")}</p><div class="book-tags">${tags}</div><p class="dialog-description">${escapeHtml(book.description || "")}</p></div></article>`;
  dialog.showModal();
}

search.addEventListener("input", event => { state.query = event.target.value; render(); });
document.querySelector("#clear-search").addEventListener("click", () => { search.value = ""; state.query = ""; state.tag = "全部"; renderFilters(); render(); search.focus(); });
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.focus(); } });
loadBooks();
