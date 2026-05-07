/**
 * Vimium-style keyboard navigation for the Teams renderer.
 *
 * Modes:
 *   - normal:    j/k scroll, d/u page, gg top, G bottom, i focus composer,
 *                f hint-mode, Esc blur active input
 *   - hint:      overlay labels appear on clickable elements; typing matches
 *                a label and clicks it. Esc / any non-hint key cancels.
 *
 * Activation rules:
 *   - When focus is in an editable element (input/textarea/contenteditable),
 *     vim keys are passed through to the app. Esc blurs the field so the
 *     user can return to normal mode.
 *   - The whole module is gated by config.vimNavEnabled (default true).
 */

const HINT_CHARS = "asdfghjkl";
const SCROLL_STEP = 80;
const HINT_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[contenteditable="true"]',
  "[tabindex]:not([tabindex=\"-1\"])",
  "[onclick]",
].join(",");

let enabled = false;
let mode = "normal";
let pendingG = false;
let hintState = null;
let overlayHost = null;

function init(config) {
  if (config && config.vimNavEnabled === false) {
    return;
  }
  enabled = true;
  attachListeners();
}

function attachListeners() {
  document.addEventListener("keydown", onKeyDown, true);
  attachToIframes();
  const observer = new MutationObserver(attachToIframes);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function attachToIframes() {
  const frames = document.getElementsByTagName("iframe");
  for (const frame of frames) {
    try {
      const doc = frame.contentDocument;
      if (!doc || doc.__vimNavBound) continue;
      doc.__vimNavBound = true;
      doc.addEventListener("keydown", onKeyDown, true);
    } catch {
      /* cross-origin iframe — skip */
    }
  }
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function activeEditable() {
  const a = document.activeElement;
  if (isEditable(a)) return a;
  const frames = document.getElementsByTagName("iframe");
  for (const frame of frames) {
    try {
      const inner = frame.contentDocument && frame.contentDocument.activeElement;
      if (isEditable(inner)) return inner;
    } catch {
      /* skip */
    }
  }
  return null;
}

function onKeyDown(event) {
  if (!enabled) return;

  if (mode === "hint") {
    handleHintKey(event);
    return;
  }

  if (event.key === "Escape") {
    const a = activeEditable();
    if (a) {
      a.blur();
      event.preventDefault();
      event.stopPropagation();
    }
    pendingG = false;
    return;
  }

  if (activeEditable()) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  const key = event.key;

  if (pendingG) {
    pendingG = false;
    if (key === "g") {
      scrollWindow(0, -1e9);
      event.preventDefault();
      return;
    }
  }

  switch (key) {
    case "j":
      scrollWindow(0, SCROLL_STEP); event.preventDefault(); break;
    case "k":
      scrollWindow(0, -SCROLL_STEP); event.preventDefault(); break;
    case "h":
      scrollWindow(-SCROLL_STEP, 0); event.preventDefault(); break;
    case "l":
      scrollWindow(SCROLL_STEP, 0); event.preventDefault(); break;
    case "d":
      scrollWindow(0, viewportHeight() / 2); event.preventDefault(); break;
    case "u":
      scrollWindow(0, -viewportHeight() / 2); event.preventDefault(); break;
    case "G":
      scrollWindow(0, 1e9); event.preventDefault(); break;
    case "g":
      pendingG = true; event.preventDefault(); break;
    case "i":
      focusComposer(); event.preventDefault(); break;
    case "f":
      enterHintMode(); event.preventDefault(); break;
    default:
      break;
  }
}

function viewportHeight() {
  return window.innerHeight || document.documentElement.clientHeight || 600;
}

function scrollWindow(dx, dy) {
  const target = findScrollContainer();
  if (target === window) {
    window.scrollBy({ left: dx, top: dy, behavior: "auto" });
  } else {
    target.scrollBy({ left: dx, top: dy, behavior: "auto" });
  }
}

function findScrollContainer() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  let el = document.elementFromPoint(cx, cy);
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return window;
}

function focusComposer() {
  const candidates = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-tid*="messageEditor"]',
    'div[contenteditable="true"]',
    'textarea[aria-label*="message" i]',
  ];
  for (const sel of candidates) {
    const els = document.querySelectorAll(sel);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (isVisible(el)) {
        el.focus();
        return;
      }
    }
  }
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (parseFloat(style.opacity) === 0) return false;
  return true;
}

function collectHintTargets() {
  const targets = [];
  for (const el of document.querySelectorAll(HINT_SELECTOR)) {
    if (isVisible(el)) targets.push(el);
  }
  return targets;
}

function generateLabels(count) {
  const labels = [];
  const chars = HINT_CHARS.split("");
  if (count <= chars.length) {
    for (let i = 0; i < count; i++) labels.push(chars[i]);
    return labels;
  }
  const needed = Math.ceil(Math.log(count) / Math.log(chars.length));
  let total = Math.pow(chars.length, needed);
  let i = 0;
  while (labels.length < count && i < total) {
    let n = i;
    let s = "";
    for (let p = 0; p < needed; p++) {
      s = chars[n % chars.length] + s;
      n = Math.floor(n / chars.length);
    }
    labels.push(s);
    i++;
  }
  return labels;
}

function ensureOverlayHost() {
  if (overlayHost && overlayHost.isConnected) return overlayHost;
  overlayHost = document.createElement("div");
  overlayHost.id = "vim-nav-hints";
  overlayHost.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
    "font-family:monospace",
    "font-weight:bold",
    "font-size:12px",
  ].join(";");
  document.body.appendChild(overlayHost);
  return overlayHost;
}

function enterHintMode() {
  const targets = collectHintTargets();
  if (targets.length === 0) return;
  const labels = generateLabels(targets.length);
  const host = ensureOverlayHost();
  host.textContent = "";
  const items = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const rect = target.getBoundingClientRect();
    const label = labels[i].toUpperCase();
    const tag = document.createElement("span");
    tag.textContent = label;
    tag.style.cssText = [
      "position:fixed",
      `top:${Math.max(0, rect.top)}px`,
      `left:${Math.max(0, rect.left)}px`,
      "background:#ffd400",
      "color:#000",
      "padding:1px 3px",
      "border:1px solid #b89000",
      "border-radius:2px",
      "box-shadow:0 1px 2px rgba(0,0,0,.4)",
      "line-height:1",
    ].join(";");
    host.appendChild(tag);
    items.push({ target, label, tag });
  }
  hintState = { items, typed: "" };
  mode = "hint";
}

function exitHintMode() {
  mode = "normal";
  hintState = null;
  if (overlayHost) overlayHost.textContent = "";
}

function handleHintKey(event) {
  if (event.key === "Escape" || event.key === "Enter") {
    exitHintMode();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === "Backspace") {
    if (hintState.typed.length > 0) {
      hintState.typed = hintState.typed.slice(0, -1);
      refilterHints();
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key.length !== 1) return;
  const ch = event.key.toUpperCase();
  if (!HINT_CHARS.toUpperCase().includes(ch)) {
    exitHintMode();
    return;
  }
  hintState.typed += ch;
  event.preventDefault();
  event.stopPropagation();

  const matches = hintState.items.filter((item) => item.label.startsWith(hintState.typed));
  if (matches.length === 0) {
    exitHintMode();
    return;
  }
  if (matches.length === 1 && matches[0].label === hintState.typed) {
    activate(matches[0].target);
    exitHintMode();
    return;
  }
  refilterHints();
}

function refilterHints() {
  for (const item of hintState.items) {
    const matches = item.label.startsWith(hintState.typed);
    item.tag.style.display = matches ? "" : "none";
    if (matches && hintState.typed.length > 0) {
      item.tag.innerHTML =
        `<span style="opacity:.4">${hintState.typed}</span>` +
        item.label.slice(hintState.typed.length);
    } else {
      item.tag.textContent = item.label;
    }
  }
}

function activate(el) {
  if (isEditable(el)) {
    el.focus();
    return;
  }
  el.focus({ preventScroll: false });
  el.click();
}

module.exports = { init };
