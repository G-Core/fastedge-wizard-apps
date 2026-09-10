// node_modules/.pnpm/@gcore+wizard-step-kit@file+..+..+..+packages+wizard-step-kit_react@19.2.8/node_modules/@gcore/wizard-step-kit/src/gc-wizard-shell.js
var GcWizardShell = class extends HTMLElement {
  static observedAttributes = [
    "can-advance",
    "finished",
    "error",
    "label-back",
    "label-next",
    "label-finish",
    "label-finished"
  ];
  #current = 0;
  #highWaterMark = 0;
  #indicator = null;
  #errorDiv = null;
  #navDiv = null;
  #btnBack = null;
  #btnNext = null;
  #mo = null;
  #ro = null;
  #stuckToBottom = true;
  connectedCallback() {
    if (!this.#indicator) this.#build();
    this.#ro = new ResizeObserver(() => this.#followBottom());
    this.#ro.observe(this);
    window.addEventListener("scroll", this.#onScroll, { passive: true });
  }
  disconnectedCallback() {
    this.#mo?.disconnect();
    this.#ro?.disconnect();
    window.removeEventListener("scroll", this.#onScroll);
  }
  #onScroll = () => {
    if (this.#isVisible()) this.#stuckToBottom = this.#isAtBottom();
  };
  #isAtBottom() {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
  }
  // getClientRects() is empty when this element (or any ancestor, e.g. a host's
  // <main hidden> wrapper shown only after connect() resolves) isn't actually
  // rendered — cheaper than offsetParent and works for fixed/sticky ancestors too.
  #isVisible() {
    return this.getClientRects().length > 0;
  }
  #followBottom() {
    if (this.#stuckToBottom && this.#isVisible()) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
  }
  attributeChangedCallback(name) {
    if (!this.#navDiv) return;
    if (name === "can-advance") this.#updateNext();
    else if (name === "finished") {
      this.#updateNext();
      this.#updateNavVisibility();
    } else if (name === "error") this.#updateError();
    else this.#updateLabels();
  }
  #steps() {
    return [...this.querySelectorAll(":scope > gc-wizard-step")];
  }
  #build() {
    this.#indicator = document.createElement("nav");
    this.#indicator.className = "wizard-indicator";
    this.#indicator.setAttribute("aria-label", "Steps");
    this.#errorDiv = document.createElement("div");
    this.#errorDiv.className = "wizard-error";
    this.#errorDiv.setAttribute("role", "alert");
    this.#errorDiv.hidden = true;
    this.#btnBack = this.#mkBtn("wizard-btn-back", this.getAttribute("label-back") || "Back");
    this.#btnNext = this.#mkBtn("wizard-btn-next", this.getAttribute("label-next") || "Next");
    this.#btnBack.addEventListener("click", () => this.#go(this.#current - 1, "back"));
    this.#btnNext.addEventListener("click", () => {
      if (this.hasAttribute("finished")) {
        this.dispatchEvent(new CustomEvent("wizard-finished", { bubbles: true }));
        return;
      }
      this.#go(this.#current + 1, "next");
    });
    this.#navDiv = document.createElement("div");
    this.#navDiv.className = "wizard-nav";
    this.#navDiv.append(this.#btnBack, this.#btnNext);
    this.prepend(this.#indicator, this.#errorDiv);
    this.append(this.#navDiv);
    this.#rebuildIndicator();
    this.#show(0);
    this.#updateError();
    this.#mo = new MutationObserver(() => this.#rebuildIndicator());
    this.#mo.observe(this, { childList: true });
  }
  #mkBtn(className, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    return btn;
  }
  #rebuildIndicator() {
    const steps = this.#steps();
    this.#indicator.innerHTML = "";
    steps.forEach((step2, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-step-btn";
      if (i === this.#current) btn.setAttribute("aria-current", "step");
      if (i < this.#highWaterMark && i !== this.#current) btn.classList.add("wizard-step--complete");
      btn.disabled = i > this.#highWaterMark;
      btn.setAttribute("aria-disabled", String(i > this.#highWaterMark));
      btn.textContent = step2.getAttribute("title") || `Step ${i + 1}`;
      btn.addEventListener("click", () => this.#go(i, "goto"));
      this.#indicator.append(btn);
    });
    this.#updateNavVisibility();
    this.#updateNext();
  }
  #show(index) {
    const steps = this.#steps();
    this.#current = index;
    steps.forEach((s, i) => {
      s.hidden = i !== index;
    });
    if (this.#isVisible()) {
      window.scrollTo(0, 0);
      this.#stuckToBottom = this.#isAtBottom();
    } else {
      this.#stuckToBottom = false;
    }
    this.#indicator.querySelectorAll(".wizard-step-btn").forEach((btn, i) => {
      btn.toggleAttribute("aria-current", i === index);
      if (i === index) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
      btn.classList.toggle("wizard-step--complete", i < this.#highWaterMark && i !== index);
      btn.disabled = i > this.#highWaterMark;
      btn.setAttribute("aria-disabled", String(i > this.#highWaterMark));
    });
    this.#updateNavVisibility();
    this.#updateNext();
    const active = steps[index];
    if (active) {
      const heading = active.querySelector("h1,h2,h3,h4,h5,h6");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
  }
  #go(to, reason) {
    const steps = this.#steps();
    if (reason === "next" && this.#current === steps.length - 1) {
      this.dispatchEvent(new CustomEvent("finish", { bubbles: true }));
      return;
    }
    if (to < 0 || to >= steps.length) return;
    if (reason === "goto" && to > this.#highWaterMark) return;
    const ev = new CustomEvent("navigate", {
      bubbles: true,
      cancelable: true,
      detail: { from: this.#current, to, reason }
    });
    if (!this.dispatchEvent(ev)) return;
    const from = this.#current;
    this.#highWaterMark = Math.max(this.#highWaterMark, to);
    this.#show(to);
    this.dispatchEvent(new CustomEvent("navigated", {
      bubbles: true,
      detail: { from, to }
    }));
  }
  #updateNext() {
    if (!this.#btnNext) return;
    const steps = this.#steps();
    const isLast = this.#current === steps.length - 1;
    const finished = this.hasAttribute("finished");
    this.#btnNext.textContent = finished ? this.getAttribute("label-finished") || "Finished" : isLast ? this.getAttribute("label-finish") || "Finish" : this.getAttribute("label-next") || "Next";
    const disabled = finished ? false : !this.hasAttribute("can-advance");
    this.#btnNext.disabled = disabled;
    this.#btnNext.setAttribute("aria-disabled", String(disabled));
  }
  #updateError() {
    if (!this.#errorDiv) return;
    const msg = this.getAttribute("error");
    this.#errorDiv.hidden = !msg;
    this.#errorDiv.textContent = msg || "";
  }
  #updateLabels() {
    if (!this.#btnBack) return;
    this.#btnBack.textContent = this.getAttribute("label-back") || "Back";
    this.#updateNext();
  }
  #updateNavVisibility() {
    if (!this.#btnBack) return;
    this.#btnBack.hidden = this.#current === 0 || this.hasAttribute("finished");
  }
};
customElements.define("gc-wizard-shell", GcWizardShell);

// node_modules/.pnpm/@gcore+wizard-step-kit@file+..+..+..+packages+wizard-step-kit_react@19.2.8/node_modules/@gcore/wizard-step-kit/src/gc-optional-panels.js
var GcOptionalPanels = class extends HTMLElement {
  static observedAttributes = ["multiple"];
  #selected = /* @__PURE__ */ new Set();
  connectedCallback() {
    this.setAttribute("role", "listbox");
    this.setAttribute("aria-multiselectable", String(this.hasAttribute("multiple")));
    this.#initPanels();
    const mo = new MutationObserver(() => this.#initPanels());
    mo.observe(this, { childList: true });
    this._mo = mo;
  }
  disconnectedCallback() {
    this._mo?.disconnect();
  }
  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.setAttribute("aria-multiselectable", String(this.hasAttribute("multiple")));
    if (!this.hasAttribute("multiple")) {
      const first = [...this.#selected][0];
      this.#selected.clear();
      if (first) this.#selected.add(first);
      this.#updateDisplay();
    }
  }
  #panels() {
    return [...this.querySelectorAll(":scope > gc-wizard-panel")];
  }
  #initPanels() {
    this.#panels().forEach((panel) => {
      if (panel._initialized) return;
      panel._initialized = true;
      const val = panel.getAttribute("value") ?? "";
      panel.setAttribute("role", "option");
      panel.setAttribute("aria-selected", "false");
      panel.setAttribute("tabindex", "0");
      panel.classList.add("wizard-panel");
      const header = document.createElement("div");
      header.className = "wizard-panel-header";
      const indicator = document.createElement("span");
      indicator.className = "wizard-panel-indicator";
      indicator.setAttribute("aria-hidden", "true");
      const labelEl = document.createElement("span");
      labelEl.className = "wizard-panel-label";
      labelEl.textContent = panel.getAttribute("label") || val;
      header.append(indicator, labelEl);
      panel.append(header);
      panel.addEventListener("click", (e) => {
        if (e.target.closest(".wizard-panel-header")) this.#toggle(val);
      });
      panel.addEventListener("keydown", (e) => {
        if (e.target !== panel) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.#toggle(val);
        }
      });
    });
  }
  #toggle(val) {
    if (!this.hasAttribute("multiple")) {
      const wasSelected = this.#selected.has(val);
      this.#selected.clear();
      if (!wasSelected) this.#selected.add(val);
    } else {
      if (this.#selected.has(val)) this.#selected.delete(val);
      else this.#selected.add(val);
    }
    this.#updateDisplay();
    this.dispatchEvent(new CustomEvent("selection-change", {
      bubbles: true,
      detail: { selected: [...this.#selected] }
    }));
  }
  #updateDisplay() {
    this.#panels().forEach((panel) => {
      const selected = this.#selected.has(panel.getAttribute("value") ?? "");
      panel.setAttribute("aria-selected", String(selected));
    });
  }
};
customElements.define("gc-optional-panels", GcOptionalPanels);

// node_modules/.pnpm/@gcore+wizard-step-kit@file+..+..+..+packages+wizard-step-kit_react@19.2.8/node_modules/@gcore/wizard-step-kit/src/gc-resource-row.js
var GcResourceRow = class extends HTMLElement {
  static observedAttributes = [
    "title",
    "sub",
    "value",
    "set",
    "clearable",
    "label-set",
    "label-unset",
    "label-clear"
  ];
  #main = null;
  #titleEl = null;
  #subEl = null;
  #valueEl = null;
  #badge = null;
  connectedCallback() {
    if (!this.#main) this.#build();
    else this.#update();
  }
  attributeChangedCallback() {
    if (this.#main) this.#update();
  }
  #build() {
    this.classList.add("wizard-row");
    this.#main = document.createElement("div");
    this.#main.className = "wizard-row-main";
    this.#titleEl = document.createElement("div");
    this.#titleEl.className = "wizard-row-title";
    this.#subEl = document.createElement("div");
    this.#subEl.className = "wizard-row-sub";
    this.#valueEl = document.createElement("div");
    this.#valueEl.className = "wizard-row-value";
    this.#main.append(this.#titleEl, this.#subEl, this.#valueEl);
    this.#badge = document.createElement("span");
    this.#badge.className = "wizard-row-badge";
    this.prepend(this.#main);
    this.append(this.#badge);
    this.#update();
  }
  #update() {
    this.#titleEl.textContent = this.getAttribute("title") || "";
    const sub = this.getAttribute("sub");
    this.#subEl.textContent = sub || "";
    this.#subEl.hidden = !sub;
    const value = this.getAttribute("value");
    this.#valueEl.textContent = value || "";
    this.#valueEl.hidden = !value;
    if (value) this.#valueEl.title = value;
    else this.#valueEl.removeAttribute("title");
    const isSet = this.hasAttribute("set");
    this.#badge.classList.toggle("wizard-row-badge--set", isSet);
    this.#badge.textContent = isSet ? this.getAttribute("label-set") || "set" : this.getAttribute("label-unset") || "not set";
    if (isSet && this.hasAttribute("clearable")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-row-clear";
      btn.textContent = "\xD7";
      btn.setAttribute("aria-label", this.getAttribute("label-clear") || "Clear");
      btn.addEventListener(
        "click",
        () => this.dispatchEvent(new CustomEvent("clear", { bubbles: true }))
      );
      this.#badge.append(btn);
    }
  }
};
customElements.define("gc-resource-row", GcResourceRow);

// node_modules/.pnpm/@gcore+wizard-step-kit@file+..+..+..+packages+wizard-step-kit_react@19.2.8/node_modules/@gcore/wizard-step-kit/src/gc-deploy-progress.js
var EMPTY = { status: "idle", plan: null, progress: [], result: null, error: null };
var STATUS_LABEL = { planning: "Planning\u2026", applying: "Applying\u2026" };
var GcDeployProgress = class extends HTMLElement {
  #state = EMPTY;
  set state(v) {
    this.#state = { ...EMPTY, ...v || {} };
    if (this.isConnected) this.#render();
  }
  get state() {
    return this.#state;
  }
  connectedCallback() {
    this.#render();
  }
  #render() {
    const { status, plan, progress, result, error } = this.#state;
    this.replaceChildren();
    const label = STATUS_LABEL[status];
    if (label) this.append(mk("div", "wizard-deploy-status", label));
    if (plan) {
      const box = mk("div", "wizard-deploy-plan");
      box.append(mk("div", "wizard-deploy-summary", `Plan: ${plan.summary}`));
      if (plan.steps?.length) {
        const ul = mk("ul", "wizard-deploy-steps");
        plan.steps.forEach((s) => ul.append(mk("li", null, s.describe)));
        box.append(ul);
      }
      (plan.warnings || []).forEach(
        (w) => box.append(mk("div", "wizard-deploy-warning", `\u26A0 ${w}`))
      );
      this.append(box);
    }
    (progress || []).forEach(
      (p) => this.append(mk("div", "wizard-deploy-progress-line", `[${p.step}/${p.total}] ${p.describe}`))
    );
    if (error) this.append(mk("div", "wizard-deploy-error", `Deploy failed: ${error}`));
    if (result) {
      const variant = String(result.status).replace(/_/g, "-");
      const box = mk("div", `wizard-deploy-result wizard-deploy-result--${variant}`);
      box.append(mk("strong", null, `Status: ${result.status}`));
      if (result.failedStep) {
        box.append(mk(
          "div",
          "wizard-deploy-error",
          `Failed at: ${result.failedStep.describe} \u2014 ${result.failedStep.error}`
        ));
      }
      const ul = mk("ul", "wizard-deploy-created");
      (result.createdFastedgeApps || []).forEach(
        (a) => ul.append(mk("li", null, `${a.ref}: app #${a.id}${a.url ? ` \u2192 ${a.url}` : ""}`))
      );
      appendCreated(ul, result.createdCdnOrigins, "CDN origin");
      appendCreated(ul, result.createdCdnRules, "CDN rule");
      if (ul.children.length) box.append(ul);
      this.append(box);
    }
  }
};
function mk(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function appendCreated(ul, items, noun) {
  (items || []).forEach(
    (r) => ul.append(mk("li", null, `${r.ref}: ${noun} #${r.id}${r.name ? ` (${r.name})` : ""}`))
  );
}
customElements.define("gc-deploy-progress", GcDeployProgress);

// node_modules/.pnpm/@gcoredev+fastedge-wizard-sdk@0.0.5/node_modules/@gcoredev/fastedge-wizard-sdk/dist/protocol.js
var WIZARD_PROTOCOL_VERSION = 1;
var MAX_MESSAGE_BYTES = 64 * 1024;
var HANDSHAKE_TIMEOUT_MS = 1e4;
var INTENT_TIMEOUT_MS = 6e4;

// node_modules/.pnpm/@gcoredev+fastedge-wizard-sdk@0.0.5/node_modules/@gcoredev/fastedge-wizard-sdk/dist/errors.js
var WizardError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WizardError";
    this.code = code;
  }
};
async function optional(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof WizardError && err.code === "user_cancelled")
      return null;
    throw err;
  }
}

// node_modules/.pnpm/@gcoredev+fastedge-wizard-sdk@0.0.5/node_modules/@gcoredev/fastedge-wizard-sdk/dist/version.js
var SDK_VERSION = "0.0.5";

// node_modules/.pnpm/@gcoredev+fastedge-wizard-sdk@0.0.5/node_modules/@gcoredev/fastedge-wizard-sdk/dist/sdk.js
function applyTheme(theme) {
  if (typeof document === "undefined")
    return;
  document.body.classList.remove("gc-theme-light", "gc-theme-dark");
  document.body.classList.add(`gc-theme-${theme}`);
}
var CLIENT_INTENT_TIMEOUT_MS = INTENT_TIMEOUT_MS + 3e4;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
var WizardSessionImpl = class {
  constructor(port) {
    this.pending = /* @__PURE__ */ new Map();
    this.eventHandlers = /* @__PURE__ */ new Map();
    this.nextId = 0;
    this.disposed = false;
    this.port = port;
    this.context = { get: () => this.invoke("context.get", {}) };
    this.fastedge = {
      templates: {
        list: (params) => this.invoke("fastedge.templates.list", params ?? {}),
        read: (params) => this.invoke("fastedge.templates.read", params)
      },
      apps: {
        list: () => this.invoke("fastedge.apps.list", {}),
        get: (params) => this.invoke("fastedge.apps.get", params),
        create: (params) => this.invoke("fastedge.apps.create", params),
        update: (params) => this.invoke("fastedge.apps.update", params),
        link: (params) => this.invoke("fastedge.apps.link", params)
      },
      secrets: {
        pickOrCreate: (params) => this.invoke("fastedge.secrets.pickOrCreate", params ?? {}),
        generateKeypair: (params) => this.invoke("fastedge.secrets.generateKeypair", params)
      },
      stores: {
        pickOrCreate: () => this.invoke("fastedge.stores.pickOrCreate", {})
      }
    };
    this.cdn = {
      resources: {
        list: () => this.invoke("cdn.resources.list", {}),
        pick: () => this.invoke("cdn.resources.pick", {})
      },
      origins: {
        create: (params) => this.invoke("cdn.origins.create", params),
        list: () => this.invoke("cdn.origins.list", {})
      },
      rules: {
        create: (params) => this.invoke("cdn.rules.create", params),
        list: (params) => this.invoke("cdn.rules.list", params)
      }
    };
    this.deployment = {
      plan: (params) => this.invoke("deployment.plan", params),
      apply: (params) => this.invoke("deployment.apply", params),
      deploy: async (params, options) => {
        const plan = await this.invoke("deployment.plan", params);
        options?.onPlan?.(plan);
        const off = this.on("deployment.progress", (p) => {
          options?.onProgress?.(p);
        });
        try {
          return await this.invoke("deployment.apply", { planId: plan.planId });
        } finally {
          off();
        }
      }
    };
    this.wizard = {
      finish: () => this.invoke("wizard.finish", {})
    };
    this.port.onmessage = (event) => this.handlePortMessage(event);
    this.on("theme.changed", (p) => {
      const payload = p;
      applyTheme(payload.theme);
    });
  }
  handlePortMessage(event) {
    const data = event.data;
    if (!isRecord(data) || data["v"] !== WIZARD_PROTOCOL_VERSION)
      return;
    if (data["type"] === "result") {
      this.handleResult(data);
    } else if (data["type"] === "event") {
      this.handleEvent(data);
    }
  }
  handleResult(msg) {
    const pending = this.pending.get(msg.id);
    if (!pending)
      return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.ok) {
      pending.resolve(msg.data);
    } else {
      const err = msg.error ?? { code: "upstream_error", message: "Unknown error" };
      pending.reject(new WizardError(err.code, err.message));
    }
  }
  handleEvent(msg) {
    const handlers = this.eventHandlers.get(msg.event);
    if (!handlers)
      return;
    for (const handler of handlers)
      handler(msg.payload);
  }
  invoke(intent, params) {
    if (this.disposed) {
      return Promise.reject(new WizardError("protocol_error", "Session is disposed"));
    }
    const id = `req-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new WizardError("timeout", `Intent "${intent}" timed out`));
      }, CLIENT_INTENT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      const message = { v: WIZARD_PROTOCOL_VERSION, type: "intent", id, intent, params };
      this.port.postMessage(message);
    });
  }
  on(event, handler) {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);
    return () => handlers?.delete(handler);
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new WizardError("protocol_error", "Session disposed"));
    }
    this.pending.clear();
    this.eventHandlers.clear();
    this.port.onmessage = null;
    this.port.close();
  }
};
function connect(options) {
  if (typeof window === "undefined") {
    return Promise.reject(new WizardError("protocol_error", "connect() requires a browser environment"));
  }
  const { expectedHostOrigin, handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS } = options;
  return new Promise((resolve, reject) => {
    let settled = false;
    let port;
    const timeoutTimer = setTimeout(() => {
      finish(() => reject(new WizardError("timeout", "Handshake did not complete in time")));
    }, handshakeTimeoutMs);
    function finish(fn) {
      if (settled)
        return;
      settled = true;
      clearTimeout(timeoutTimer);
      window.removeEventListener("message", onWindowMessage);
      fn();
    }
    function onWindowMessage(event) {
      if (settled)
        return;
      if (event.source !== window.parent)
        return;
      if (event.origin !== expectedHostOrigin)
        return;
      const data = event.data;
      if (!isRecord(data) || data["type"] !== "init")
        return;
      if (data["v"] !== WIZARD_PROTOCOL_VERSION) {
        finish(() => reject(new WizardError("protocol_error", `Protocol version mismatch: host=${String(data["v"])}, sdk=${WIZARD_PROTOCOL_VERSION}`)));
        return;
      }
      const capturedPort = event.ports.length === 1 ? event.ports[0] : void 0;
      if (!capturedPort)
        return;
      port = capturedPort;
      capturedPort.onmessage = onPortMessage;
      capturedPort.start();
    }
    function onPortMessage(event) {
      if (settled)
        return;
      const data = event.data;
      if (!isRecord(data) || data["type"] !== "hello")
        return;
      if (data["v"] !== WIZARD_PROTOCOL_VERSION) {
        finish(() => reject(new WizardError("protocol_error", `Protocol version mismatch: host=${String(data["v"])}, sdk=${WIZARD_PROTOCOL_VERSION}`)));
        return;
      }
      const hello = data;
      applyTheme(hello.hostContext.theme ?? "light");
      if (typeof document !== "undefined") {
        document.documentElement.lang = hello.hostContext.locale ?? "en";
      }
      const ready = { v: WIZARD_PROTOCOL_VERSION, type: "ready", sdkVersion: SDK_VERSION };
      port.postMessage(ready);
      finish(() => resolve(new WizardSessionImpl(port)));
    }
    window.addEventListener("message", onWindowMessage);
  });
}

// src/main.js
var hostOrigin = new URLSearchParams(location.search).get("hostOrigin") || "https://portal.gcore.com";
var main = document.querySelector("main");
var shell = document.querySelector("gc-wizard-shell");
var appNameInput = document.getElementById("app-name");
var cdnRow = document.getElementById("cdn-row");
var pickButton = document.querySelector("[data-action=pick-resource]");
var deployProgress = document.getElementById("deploy-progress");
var reviewName = document.getElementById("review-name");
var reviewCdn = document.getElementById("review-cdn");
function setError(msg) {
  if (msg) shell.setAttribute("error", msg);
  else shell.removeAttribute("error");
}
var pickedResource = null;
var step = 0;
var deployState = { status: "idle", plan: null, progress: [], result: null, error: null };
function setDeployState(patch) {
  deployState = { ...deployState, ...patch };
  deployProgress.state = deployState;
  shell.toggleAttribute("finished", deployState.status === "done");
  updateCanAdvance();
}
function updateCanAdvance() {
  let ready;
  if (step === 0) ready = appNameInput.value.trim().length > 0;
  else if (step === 1) ready = !!pickedResource;
  else ready = deployState.status === "idle" || deployState.status === "error";
  shell.toggleAttribute("can-advance", ready);
  setError("");
}
function updateCdnRow() {
  cdnRow.toggleAttribute("set", !!pickedResource);
  if (pickedResource) cdnRow.setAttribute("value", `${pickedResource.cname} (#${pickedResource.id})`);
  else cdnRow.removeAttribute("value");
}
function populateReview() {
  reviewName.textContent = appNameInput.value.trim();
  reviewCdn.textContent = pickedResource ? `${pickedResource.cname} (#${pickedResource.id})` : "\u2014";
}
var session;
try {
  session = await connect({ expectedHostOrigin: hostOrigin });
  const ctx = await session.context.get();
  document.body.classList.add(ctx.theme);
  main.hidden = false;
  if (ctx.launchTemplateId === null) {
    setError("This wizard must be launched from the html2md template.");
    shell.removeAttribute("can-advance");
  } else {
    updateCanAdvance();
    pickButton.addEventListener("click", async () => {
      pickButton.disabled = true;
      try {
        const r = await optional(() => session.cdn.resources.pick());
        if (r) {
          pickedResource = r;
          updateCdnRow();
          updateCanAdvance();
        }
      } catch (err) {
        console.error("CDN resource pick failed:", err);
      } finally {
        pickButton.disabled = false;
      }
    });
    cdnRow.addEventListener("clear", () => {
      pickedResource = null;
      updateCdnRow();
      updateCanAdvance();
    });
    appNameInput.addEventListener("input", updateCanAdvance);
    shell.addEventListener("navigated", ({ detail: { to } }) => {
      step = to;
      if (step === 2) populateReview();
      updateCanAdvance();
    });
    shell.addEventListener("finish", async () => {
      if (!pickedResource) return;
      setDeployState({ status: "planning", plan: null, progress: [], result: null, error: null });
      shell.removeAttribute("can-advance");
      setError("");
      try {
        const result = await session.deployment.deploy(
          {
            fastedgeApps: [
              {
                ref: "html2md-filter",
                name: `${appNameInput.value.trim()}-filter`,
                api_type: "proxy-wasm",
                source: { fromTemplateId: ctx.launchTemplateId }
              }
            ],
            cdnResourceId: pickedResource.id,
            cdnResourceFastedgeHandlers: {
              on_request_headers: { appRef: "html2md-filter" },
              on_response_headers: { appRef: "html2md-filter" },
              on_response_body: { appRef: "html2md-filter" }
            }
          },
          {
            onPlan: (plan) => setDeployState({ status: "applying", plan }),
            onProgress: (ev) => setDeployState({ progress: [...deployState.progress, ev] })
          }
        );
        setDeployState({ status: "done", result });
      } catch (err) {
        if (err instanceof WizardError && err.code === "user_cancelled") {
          setDeployState({ status: "idle" });
        } else {
          setDeployState({ status: "error", error: err.message });
          console.error(err);
        }
      } finally {
        updateCanAdvance();
      }
    });
    shell.addEventListener("wizard-finished", () => session.wizard.finish());
  }
} catch (err) {
  const p = document.createElement("p");
  p.className = "wizard-error";
  p.textContent = `${err.code ?? "error"}: ${err.message}`;
  document.body.replaceChildren(p);
}
window.addEventListener("beforeunload", () => session?.dispose());
