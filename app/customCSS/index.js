const fs = require("node:fs");
const path = require("node:path");

// Track every webContents and webFrame we've injected the user's custom CSS
// into, plus the insertCSS key (for webContents) so we can remove the old
// stylesheet on file-change and re-insert the new one. Lets an external
// theme manager toggle Teams' look without a restart.
const contentRegistry = new Map(); // content -> cssKey (string|null)
const frameRegistry = new Set();   // webFrame
let activeWatch = null;            // { path, watcher }

exports.onDidFinishLoad = function onDidFinishLoad(content, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToContent(content, customCssLocation);
    ensureWatcher(customCssLocation);
  }
  content.insertCSS(
    "#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }"
  );
  content.insertCSS(".zoetrope { animation-iteration-count: 1 !important; }");
};

exports.onDidFrameFinishLoad = function onDidFrameFinishLoad(webFrame, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToFrame(webFrame, customCssLocation);
    ensureWatcher(customCssLocation);
  }
};

function getCustomCssLocation(config) {
  if (config.customCSSName) {
    return path.join(__dirname, "assets", "css", config.customCSSName + ".css");
  } else if (config.customCSSLocation) {
    return config.customCSSLocation;
  }
  return null;
}

function applyCustomCSSToContent(content, cssLocation) {
  fs.readFile(cssLocation, "utf-8", async (error, data) => {
    if (error) return;
    try {
      const previousKey = contentRegistry.get(content);
      if (previousKey) {
        await content.removeInsertedCSS(previousKey).catch(() => {});
      }
      const key = await content.insertCSS(data);
      contentRegistry.set(content, key);
      if (!content._tflCustomCssCleanup) {
        content._tflCustomCssCleanup = true;
        content.once("destroyed", () => contentRegistry.delete(content));
      }
    } catch {
      /* webContents may have been destroyed mid-write — ignore */
    }
  });
}

/**
 * Applies custom CSS to iframe-based content for Teams V2.
 * Teams V2 uses iframes for the main view where content.insertCSS() doesn't work,
 * so we inject <style> elements directly into the DOM using JavaScript execution.
 * This is a workaround for iframe CSS isolation in Electron.
 *
 * The injected snippet is idempotent: if the #tfl-custom-css-style element
 * already exists we just update its textContent, so live reloads re-skin
 * the frame without leaving stale stylesheets behind.
 *
 * @param {Electron.WebFrameMain} webFrame - The iframe's web frame
 * @param {string} cssLocation - Path to the CSS file to inject
 */
function applyCustomCSSToFrame(webFrame, cssLocation) {
  const customCssId = "tfl-custom-css-style";

  fs.readFile(cssLocation, "utf-8", (error, data) => {
    if (error) {
      return;
    }

    data = data.replaceAll(String.fromCharCode(96), "\\u0060");

    webFrame.executeJavaScript(`
			(() => {
				let style = document.getElementById("${customCssId}");
				if (!style) {
					style = document.createElement('style');
					style.id = "${customCssId}";
					style.type = "text/css";
					document.head.appendChild(style);
				}
				style.textContent = ${JSON.stringify(data)};
			})();
		`).catch(() => {});

    frameRegistry.add(webFrame);
  });
}

// Watch the active CSS file. On change, re-apply to every webContents and
// webFrame we've ever attached to. fs.watch is debounced because editors
// often write in two operations (truncate + write).
function ensureWatcher(cssLocation) {
  if (activeWatch && activeWatch.path === cssLocation) return;
  if (activeWatch) activeWatch.watcher.close();

  let debounce = null;
  const watcher = fs.watch(cssLocation, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => reapplyAll(cssLocation), 50);
  });

  activeWatch = { path: cssLocation, watcher };
}

function reapplyAll(cssLocation) {
  for (const content of Array.from(contentRegistry.keys())) {
    if (content.isDestroyed?.()) {
      contentRegistry.delete(content);
      continue;
    }
    applyCustomCSSToContent(content, cssLocation);
  }
  for (const frame of Array.from(frameRegistry)) {
    try {
      applyCustomCSSToFrame(frame, cssLocation);
    } catch {
      frameRegistry.delete(frame);
    }
  }
}
