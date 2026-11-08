import { createHash } from "node:crypto";
import { getSiteSettings, getWidgetSettings } from "@/lib/data/site";
import { publicOrigin } from "@/lib/auth/request";
import { COLOR_THEMES, colorThemeOf } from "@/lib/color-themes";
import { isHexColor } from "@/lib/widget";

/**
 * The embed script for the help widget: `<script src="https://docs…/widget.js" async></script>`.
 * Plain JavaScript (no framework) that adds a launcher button in a shadow root
 * and, on first open, a frame of /widget. Optional attributes on the script tag:
 * data-position="left|right", data-label="…", data-query="…" (search to open with),
 * data-launcher="false" (no button; open it with DocskuWidget.open() or any
 * element with data-docsku-help="search words").
 * While the widget is off this returns a script that does nothing.
 */
export async function GET(request: Request) {
  const [widget, site] = await Promise.all([getWidgetSettings(), getSiteSettings()]);
  const theme = COLOR_THEMES.find((t) => t.id === colorThemeOf(site.colorTheme)) ?? COLOR_THEMES[0];
  const body = widget.enabled
    ? SCRIPT.replace(
        "__CONFIG__",
        // "<" escaped so a label can never close a surrounding <script>.
        JSON.stringify({
          origin: publicOrigin(request),
          allowed: widget.allowedOrigins,
          label: widget.label,
          position: widget.position === "left" ? "left" : "right",
          accent: widget.accent && isHexColor(widget.accent) ? widget.accent : theme.light.accent,
          title: `Bantuan ${site.name}`,
        }).replace(/</g, "\\u003c"),
      )
    : "/* Docsku: widget bantuan sedang tidak aktif. */\n";

  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}

const SCRIPT = String.raw`(function () {
  "use strict";
  if (window.DocskuWidget) return;
  var C = __CONFIG__;
  var script = document.currentScript;
  var ds = (script && script.dataset) || {};

  function allowed(origin) {
    origin = origin.toLowerCase();
    for (var i = 0; i < C.allowed.length; i++) {
      var entry = C.allowed[i];
      if (entry.indexOf("://*.") < 0) { if (entry === origin) return true; continue; }
      var parts = entry.split("://*.");
      var m = /^(https?):\/\/([^/]+)$/.exec(origin);
      if (m && m[1] === parts[0] && m[2].slice(-(parts[1].length + 1)) === "." + parts[1]) return true;
    }
    return false;
  }
  if (!allowed(location.origin)) {
    console.warn("[Docsku] Widget bantuan belum diizinkan untuk " + location.origin + ". Tambahkan di Pengaturan → Widget bantuan.");
    return;
  }

  var side = ds.position === "left" || ds.position === "right" ? ds.position : C.position;
  var host = document.createElement("div");
  host.setAttribute("data-docsku-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var css =
    ":host{all:initial}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "height:48px;padding:0 18px 0 14px;border:0;border-radius:999px;background:" + C.accent + ";color:#fff;cursor:pointer;" +
    "font:600 14px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.12);transition:transform .15s}" +
    ".launcher:hover{transform:translateY(-1px)}.launcher:focus-visible{outline:3px solid " + C.accent + ";outline-offset:3px}" +
    ".launcher svg{width:20px;height:20px;flex:none}.launcher[hidden]{display:none}" +
    ".panel{position:fixed;bottom:80px;" + side + ":20px;z-index:2147483001;width:400px;height:min(640px,calc(100vh - 110px));" +
    "border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 12px 48px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.1)}" +
    ".panel[hidden]{display:none}.panel iframe{display:block;width:100%;height:100%;border:0}" +
    "@media (max-width:640px){.panel{inset:0;width:100%;height:100%;border-radius:0}.open .launcher{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.launcher{transition:none}}";
  root.innerHTML =
    "<style>" + css + "</style>" +
    '<div class="wrap"><button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg><span></span></button>' +
    '<div class="panel" role="dialog" hidden></div></div>';
  var wrap = root.querySelector(".wrap");
  var launcher = root.querySelector(".launcher");
  var panel = root.querySelector(".panel");
  launcher.querySelector("span").textContent = ds.label || C.label;
  panel.setAttribute("aria-label", C.title);
  if (ds.launcher === "false") launcher.hidden = true;

  var frame = null, ready = false, pending = null, lastFocus = null;
  function post(message) { if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, C.origin); }
  function isOpen() { return !panel.hidden; }

  function open(query) {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.src = C.origin + "/widget";
      frame.title = C.title;
      frame.setAttribute("allow", "clipboard-write");
      frame.addEventListener("load", function () { post({ type: "docsku:init" }); });
      panel.appendChild(frame);
    }
    if (!isOpen()) lastFocus = document.activeElement;
    panel.hidden = false;
    wrap.classList.add("open");
    launcher.setAttribute("aria-expanded", "true");
    var message = { type: "docsku:open", query: typeof query === "string" ? query : ds.query || "" };
    if (ready) { post(message); frame.focus(); } else pending = message;
  }

  function close() {
    if (!isOpen()) return;
    panel.hidden = true;
    wrap.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
    // Focus inside the launcher's shadow root shows up as the host element itself.
    var back = lastFocus && lastFocus !== document.body && lastFocus !== host && lastFocus.focus ? lastFocus : launcher.hidden ? null : launcher;
    if (back) back.focus();
  }

  window.addEventListener("message", function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== C.origin) return;
    var data = event.data || {};
    if (data.type === "docsku:hello") post({ type: "docsku:init" });
    else if (data.type === "docsku:ready") {
      ready = true;
      if (pending) { post(pending); pending = null; }
      if (isOpen()) frame.focus();
    } else if (data.type === "docsku:close") close();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && isOpen()) close(); });
  launcher.addEventListener("click", function () { isOpen() ? close() : open(); });
  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-docsku-help]") : null;
    if (!target) return;
    event.preventDefault();
    open(target.getAttribute("data-docsku-help") || "");
  });

  window.DocskuWidget = {
    open: function (query) { open(query); },
    close: close,
    toggle: function (query) { isOpen() ? close() : open(query); },
  };
  function mount() { document.body.appendChild(host); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
`;
