(() => {
  "use strict";

  const STORAGE_PREFIX = "jsonPayload:";
  const THEME_KEY = "json-viewer-theme";
  const INDENT_WIDTH = 18;
  const RENDER_DELAY = 120;
  const TOGGLE_ICONS = {
    open: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    closed: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'
  };

  const elements = {
    rawInput: document.getElementById("rawInput"),
    jsonTree: document.getElementById("jsonTree"),
    parseStatus: document.getElementById("parseStatus"),
    treeStatus: document.getElementById("treeStatus"),
    expandAllBtn: document.getElementById("expandAllBtn"),
    collapseAllBtn: document.getElementById("collapseAllBtn"),
    copyBtn: document.getElementById("copyBtn"),
    minifyBtn: document.getElementById("minifyBtn"),
    searchBar: document.getElementById("searchBar"),
    searchInput: document.getElementById("searchInput"),
    searchCount: document.getElementById("searchCount"),
    prevMatchBtn: document.getElementById("prevMatchBtn"),
    nextMatchBtn: document.getElementById("nextMatchBtn"),
    closeSearchBtn: document.getElementById("closeSearchBtn"),
    themeToggle: document.getElementById("themeToggle"),
    toast: document.getElementById("toast"),
    floatingTooltip: document.getElementById("floatingTooltip")
  };

  const state = {
    parsed: null,
    formatted: "",
    parseError: null,
    fixes: [],
    collapsedPaths: new Set(),
    searchExpandedPaths: new Set(),
    searchTerm: "",
    activeMatchIndex: 0,
    matchCount: 0,
    toastTimer: 0
  };

  let renderTimer = 0;

  init();

  function init() {
    applyInitialTheme();
    bindEvents();
    bindTooltips();
    loadPayloadFromQuery();
    renderNow();
  }

  function bindEvents() {
    elements.rawInput.addEventListener("input", () => {
      scheduleRender();
    });

    elements.expandAllBtn.addEventListener("click", () => {
      state.collapsedPaths.clear();
      renderTree();
    });

    elements.collapseAllBtn.addEventListener("click", () => {
      if (!hasJson()) {
        return;
      }

      const paths = new Set();
      collectContainerPaths(state.parsed, "$", paths);
      paths.delete("$");
      state.collapsedPaths = paths;
      renderTree();
    });

    elements.copyBtn.addEventListener("click", () => {
      copyFormattedJson();
    });

    elements.minifyBtn.addEventListener("click", () => {
      minifyRawJson();
    });

    elements.themeToggle.addEventListener("change", () => {
      const theme = elements.themeToggle.checked ? "dark" : "light";
      applyTheme(theme);
      localStorage.setItem(THEME_KEY, theme);
    });

    elements.searchInput.addEventListener("input", () => {
      state.searchTerm = elements.searchInput.value;
      state.activeMatchIndex = 0;
      updateSearchExpansion();
      renderTree();
    });

    elements.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        navigateMatch(event.shiftKey ? -1 : 1);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    });

    elements.prevMatchBtn.addEventListener("click", () => {
      navigateMatch(-1);
    });

    elements.nextMatchBtn.addEventListener("click", () => {
      navigateMatch(1);
    });

    elements.closeSearchBtn.addEventListener("click", () => {
      closeSearch();
    });

    document.addEventListener("keydown", (event) => {
      const wantsFind = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f";

      if (!wantsFind) {
        return;
      }

      event.preventDefault();
      openSearch();
    });
  }

  function bindTooltips() {
    document.querySelectorAll("[data-tooltip]").forEach((element) => {
      element.addEventListener("pointerenter", () => {
        showFloatingTooltip(element);
      });

      element.addEventListener("pointerleave", () => {
        hideFloatingTooltip();
      });

      element.addEventListener("focusin", () => {
        showFloatingTooltip(element);
      });

      element.addEventListener("focusout", () => {
        hideFloatingTooltip();
      });

      element.addEventListener("click", () => {
        showFloatingTooltip(element);
      });
    });
  }

  function showFloatingTooltip(target) {
    const text = target.dataset.tooltip;

    if (!text) {
      return;
    }

    const tooltip = elements.floatingTooltip;
    tooltip.textContent = text;
    tooltip.classList.add("show");
    tooltip.style.opacity = "1";
    tooltip.style.transform = "translateY(0)";
    tooltip.style.visibility = "visible";
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;
    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    let top = targetRect.bottom + gap;

    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding)
    );

    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, targetRect.top - tooltipRect.height - gap);
    }

    const arrowLeft = Math.max(
      10,
      Math.min(targetRect.left + targetRect.width / 2 - left, tooltipRect.width - 10)
    );

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.setProperty("--tooltip-arrow-left", `${Math.round(arrowLeft)}px`);
  }

  function hideFloatingTooltip() {
    elements.floatingTooltip.classList.remove("show");
    elements.floatingTooltip.style.opacity = "0";
    elements.floatingTooltip.style.transform = "translateY(-4px)";
    elements.floatingTooltip.style.visibility = "hidden";
  }

  function loadPayloadFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const payloadKey = params.get("payload");

    if (!payloadKey || !payloadKey.startsWith(STORAGE_PREFIX) || !globalThis.chrome?.storage?.local) {
      return;
    }

    chrome.storage.local.get([payloadKey], (result) => {
      const payload = result[payloadKey];

      if (payload?.text) {
        elements.rawInput.value = payload.text;
        renderNow();
      }

      chrome.storage.local.remove(payloadKey);
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderNow, RENDER_DELAY);
  }

  function renderNow() {
    parseInput();
    updateSearchExpansion();
    renderTree();
  }

  function parseInput() {
    const raw = elements.rawInput.value;

    if (!raw.trim()) {
      state.parsed = null;
      state.formatted = "";
      state.parseError = null;
      state.fixes = [];
      updateStatus();
      updateToolbarState();
      return;
    }

    const result = JsonRepair.parse(raw);

    if (result.error) {
      state.parsed = null;
      state.formatted = "";
      state.parseError = result.error;
      state.fixes = [];
    } else {
      state.parsed = result.value;
      state.formatted = JSON.stringify(state.parsed, null, 2);
      state.parseError = null;
      state.fixes = result.fixes;
    }

    updateStatus();
    updateToolbarState();
  }

  function updateStatus() {
    elements.parseStatus.classList.remove("error", "muted", "fixed");
    elements.parseStatus.removeAttribute("title");

    if (!elements.rawInput.value.trim()) {
      elements.parseStatus.textContent = "等待输入";
      elements.parseStatus.classList.add("muted");
      elements.treeStatus.textContent = "0 items";
      return;
    }

    if (state.parseError) {
      elements.parseStatus.textContent = "JSON 解析错误";
      elements.parseStatus.classList.add("error");
      elements.treeStatus.textContent = "0 items";
      return;
    }

    if (state.fixes.length) {
      const detail = state.fixes.join("、");
      elements.parseStatus.textContent = `已自动修复：${detail}`;
      elements.parseStatus.title = `右侧为自动修复后的 JSON（${detail}）`;
      elements.parseStatus.classList.add("fixed");
    } else {
      elements.parseStatus.textContent = "有效 JSON";
    }

    elements.treeStatus.textContent = `${countRootItems(state.parsed)} items`;
  }

  function updateToolbarState() {
    const available = hasJson();

    setPseudoDisabled(elements.expandAllBtn, !available);
    setPseudoDisabled(elements.collapseAllBtn, !available);
    setPseudoDisabled(elements.copyBtn, !available);
    setPseudoDisabled(elements.minifyBtn, !available);
    setPseudoDisabled(elements.prevMatchBtn, !available || state.matchCount === 0);
    setPseudoDisabled(elements.nextMatchBtn, !available || state.matchCount === 0);
  }

  function setPseudoDisabled(element, disabled) {
    element.classList.toggle("is-disabled", disabled);
    element.setAttribute("aria-disabled", String(disabled));
  }

  function renderTree() {
    elements.jsonTree.replaceChildren();
    state.matchCount = 0;

    if (!elements.rawInput.value.trim()) {
      elements.jsonTree.appendChild(createMessage("empty-state", "等待 JSON 输入"));
      updateSearchCount();
      updateToolbarState();
      return;
    }

    if (state.parseError) {
      elements.jsonTree.appendChild(
        createMessage("error-state", normalizeErrorMessage(state.parseError.message))
      );
      updateSearchCount();
      updateToolbarState();
      return;
    }

    const fragment = document.createDocumentFragment();
    renderValue(state.parsed, {
      fragment,
      key: "",
      hasKey: false,
      path: "$",
      depth: 0,
      trailingComma: false,
      isRoot: true
    });
    elements.jsonTree.appendChild(fragment);

    if (state.searchTerm && state.matchCount > 0 && state.activeMatchIndex >= state.matchCount) {
      state.activeMatchIndex = state.matchCount - 1;
      renderTree();
      return;
    }

    updateSearchCount();
    updateToolbarState();
    scrollActiveMatchIntoView();
  }

  function renderValue(value, options) {
    if (isContainer(value)) {
      renderContainer(value, options);
      return;
    }

    renderPrimitive(value, options);
  }

  function renderContainer(value, options) {
    const { fragment, key, hasKey, path, depth, trailingComma } = options;
    const isArrayValue = Array.isArray(value);
    const open = isArrayValue ? "[" : "{";
    const close = isArrayValue ? "]" : "}";
    const entries = getEntries(value);
    const count = entries.length;

    if (count === 0) {
      const line = createLine(depth);
      line.appendChild(createSpacer());
      appendKeyPrefix(line, key, hasKey);
      line.appendChild(createToken("punctuation", `${open}${close}${trailingComma ? "," : ""}`));
      fragment.appendChild(line);
      return;
    }

    const collapsed = isCollapsed(path);
    const headerLine = createLine(depth);
    headerLine.classList.add("clickable");
    headerLine.appendChild(createToggle(path, collapsed));
    appendKeyPrefix(headerLine, key, hasKey);

    if (collapsed) {
      headerLine.appendChild(createToken("punctuation", `${open} ... ${close}`));
      headerLine.appendChild(createItemCount(count));
      if (trailingComma) {
        headerLine.appendChild(createToken("punctuation", ","));
      }
    } else {
      headerLine.appendChild(createToken("punctuation", open));
    }

    headerLine.addEventListener("click", () => {
      togglePath(path);
    });
    fragment.appendChild(headerLine);

    if (collapsed) {
      return;
    }

    entries.forEach((entry, index) => {
      renderValue(entry.value, {
        fragment,
        key: entry.key,
        hasKey: !isArrayValue,
        path: childPath(path, entry.key),
        depth: depth + 1,
        trailingComma: index < entries.length - 1,
        isRoot: false
      });
    });

    const closingLine = createLine(depth);
    closingLine.appendChild(createSpacer());
    closingLine.appendChild(createToken("punctuation", `${close}${trailingComma ? "," : ""}`));
    fragment.appendChild(closingLine);
  }

  function renderPrimitive(value, options) {
    const { fragment, key, hasKey, depth, trailingComma } = options;
    const line = createLine(depth);
    line.appendChild(createSpacer());
    appendKeyPrefix(line, key, hasKey);
    line.appendChild(createPrimitiveToken(value));

    if (trailingComma) {
      line.appendChild(createToken("punctuation", ","));
    }

    fragment.appendChild(line);
  }

  function createLine(depth) {
    const line = document.createElement("div");
    line.className = "json-line";
    line.style.paddingLeft = `${depth * INDENT_WIDTH}px`;
    return line;
  }

  function createToggle(path, collapsed) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-toggle";
    button.title = collapsed ? "展开" : "收起";
    button.ariaLabel = collapsed ? "展开节点" : "收起节点";
    button.innerHTML = collapsed ? TOGGLE_ICONS.closed : TOGGLE_ICONS.open;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePath(path);
    });
    return button;
  }

  function createSpacer() {
    const spacer = document.createElement("span");
    spacer.className = "tree-spacer";
    return spacer;
  }

  function appendKeyPrefix(line, key, shouldRenderKey) {
    if (!shouldRenderKey) {
      return;
    }

    line.appendChild(createToken("key", JSON.stringify(key)));
    line.appendChild(createToken("punctuation", ": "));
  }

  function createPrimitiveToken(value) {
    if (typeof value === "string") {
      return createToken("string", JSON.stringify(value));
    }

    if (typeof value === "number") {
      return createToken("number", String(value));
    }

    if (typeof value === "boolean") {
      return createToken("boolean", String(value));
    }

    return createToken("null", "null");
  }

  function createToken(className, text) {
    const span = document.createElement("span");
    span.className = className;
    appendHighlightedText(span, text);
    return span;
  }

  function createItemCount(count) {
    const span = document.createElement("span");
    span.className = "item-count";
    span.textContent = `${count} ${count === 1 ? "item" : "items"}`;
    return span;
  }

  function createMessage(className, text) {
    const message = document.createElement("div");
    message.className = className;
    message.textContent = text;
    return message;
  }

  function appendHighlightedText(parent, text) {
    const needle = state.searchTerm;

    if (!needle) {
      parent.textContent = text;
      return;
    }

    const haystack = text.toLowerCase();
    const normalizedNeedle = needle.toLowerCase();
    let cursor = 0;
    let matchIndex = haystack.indexOf(normalizedNeedle, cursor);

    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        parent.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
      }

      const mark = document.createElement("mark");
      mark.className = "search-match";
      mark.dataset.searchIndex = String(state.matchCount);
      mark.textContent = text.slice(matchIndex, matchIndex + needle.length);

      if (state.matchCount === state.activeMatchIndex) {
        mark.classList.add("is-active");
      }

      parent.appendChild(mark);
      state.matchCount += 1;
      cursor = matchIndex + needle.length;
      matchIndex = haystack.indexOf(normalizedNeedle, cursor);
    }

    if (cursor < text.length) {
      parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  function updateSearchExpansion() {
    state.searchExpandedPaths.clear();

    if (!hasJson() || !state.searchTerm) {
      return;
    }

    collectSearchExpandedPaths(state.parsed, "$", state.searchTerm.toLowerCase());
  }

  function collectSearchExpandedPaths(value, path, normalizedTerm) {
    if (!isContainer(value)) {
      if (primitiveSearchText(value).toLowerCase().includes(normalizedTerm)) {
        addAncestors(path);
      }
      return;
    }

    getEntries(value).forEach((entry) => {
      const nextPath = childPath(path, entry.key);

      if (!Array.isArray(value) && String(entry.key).toLowerCase().includes(normalizedTerm)) {
        addAncestors(nextPath);
      }

      if (isContainer(entry.value)) {
        collectSearchExpandedPaths(entry.value, nextPath, normalizedTerm);
        return;
      }

      if (primitiveSearchText(entry.value).toLowerCase().includes(normalizedTerm)) {
        addAncestors(nextPath);
      }
    });
  }

  function addAncestors(path) {
    let current = parentPath(path);

    while (current) {
      state.searchExpandedPaths.add(current);

      if (current === "$") {
        break;
      }

      current = parentPath(current);
    }
  }

  function parentPath(path) {
    if (path === "$") {
      return "";
    }

    const index = path.lastIndexOf("/");
    return index <= 0 ? "$" : path.slice(0, index);
  }

  function openSearch() {
    elements.searchBar.hidden = false;
    elements.searchInput.focus();
    elements.searchInput.select();
  }

  function closeSearch() {
    elements.searchBar.hidden = true;
    elements.searchInput.value = "";
    state.searchTerm = "";
    state.activeMatchIndex = 0;
    state.searchExpandedPaths.clear();
    renderTree();
    elements.jsonTree.focus({ preventScroll: true });
  }

  function navigateMatch(direction) {
    if (!state.matchCount) {
      return;
    }

    state.activeMatchIndex = (state.activeMatchIndex + direction + state.matchCount) % state.matchCount;
    renderTree();
  }

  function updateSearchCount() {
    if (!state.searchTerm) {
      elements.searchCount.textContent = "0/0";
      setPseudoDisabled(elements.prevMatchBtn, true);
      setPseudoDisabled(elements.nextMatchBtn, true);
      return;
    }

    if (!state.matchCount) {
      elements.searchCount.textContent = "0/0";
      setPseudoDisabled(elements.prevMatchBtn, true);
      setPseudoDisabled(elements.nextMatchBtn, true);
      return;
    }

    elements.searchCount.textContent = `${state.activeMatchIndex + 1}/${state.matchCount}`;
    setPseudoDisabled(elements.prevMatchBtn, false);
    setPseudoDisabled(elements.nextMatchBtn, false);
  }

  function scrollActiveMatchIntoView() {
    if (!state.searchTerm || !state.matchCount) {
      return;
    }

    requestAnimationFrame(() => {
      const active = elements.jsonTree.querySelector("mark.search-match.is-active");

      if (active) {
        active.scrollIntoView({ block: "center", inline: "nearest" });
      }
    });
  }

  async function copyFormattedJson() {
    if (!hasJson()) {
      showToast("没有可复制的 JSON");
      return;
    }

    try {
      await navigator.clipboard.writeText(state.formatted);
      showToast("已复制");
    } catch {
      fallbackCopy(state.formatted);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.inset = "0 auto auto 0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      showToast("已复制");
    } catch {
      showToast("复制失败");
    } finally {
      textArea.remove();
    }
  }

  function minifyRawJson() {
    if (!hasJson()) {
      showToast(state.parseError ? "JSON 解析错误" : "没有可压缩的 JSON");
      return;
    }

    elements.rawInput.value = JSON.stringify(state.parsed);
    state.collapsedPaths.clear();
    renderNow();
    showToast("已压缩");
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("show");
    }, 1800);
  }

  function applyInitialTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme || (prefersDark ? "dark" : "light");

    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    elements.themeToggle.checked = theme === "dark";
  }

  function togglePath(path) {
    if (state.collapsedPaths.has(path)) {
      state.collapsedPaths.delete(path);
    } else {
      state.collapsedPaths.add(path);
    }

    renderTree();
  }

  function isCollapsed(path) {
    return state.collapsedPaths.has(path) && !state.searchExpandedPaths.has(path);
  }

  function collectContainerPaths(value, path, paths) {
    if (!isContainer(value)) {
      return;
    }

    paths.add(path);
    getEntries(value).forEach((entry) => {
      collectContainerPaths(entry.value, childPath(path, entry.key), paths);
    });
  }

  function childPath(parent, key) {
    return `${parent}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
  }

  function getEntries(value) {
    if (Array.isArray(value)) {
      return value.map((item, index) => ({
        key: index,
        value: item
      }));
    }

    return Object.entries(value).map(([key, entryValue]) => ({
      key,
      value: entryValue
    }));
  }

  function isContainer(value) {
    return value !== null && typeof value === "object";
  }

  function hasJson() {
    return Boolean(elements.rawInput.value.trim()) && state.parseError === null;
  }

  function countRootItems(value) {
    if (Array.isArray(value)) {
      return value.length;
    }

    if (isContainer(value)) {
      return Object.keys(value).length;
    }

    return 1;
  }

  function primitiveSearchText(value) {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }

  function normalizeErrorMessage(message) {
    if (!message) {
      return "JSON 解析错误";
    }

    return message.replace(/^JSON\.parse:\s*/i, "");
  }
})();
