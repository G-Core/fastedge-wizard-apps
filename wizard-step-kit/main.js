// src/gc-wizard-shell.js
var GcWizardShell = class extends HTMLElement {
  static observedAttributes = ["can-advance", "error", "label-back", "label-next", "label-cancel", "label-finish"];
  #current = 0;
  #highWaterMark = 0;
  #indicator = null;
  #errorDiv = null;
  #navDiv = null;
  #btnBack = null;
  #btnNext = null;
  #btnCancel = null;
  #mo = null;
  connectedCallback() {
    if (!this.#indicator) this.#build();
  }
  disconnectedCallback() {
    this.#mo?.disconnect();
  }
  attributeChangedCallback(name) {
    if (!this.#navDiv) return;
    if (name === "can-advance") this.#updateNext();
    else if (name === "error") this.#updateError();
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
    this.#btnCancel = this.#mkBtn("wizard-btn-cancel", this.getAttribute("label-cancel") || "Cancel");
    this.#btnBack = this.#mkBtn("wizard-btn-back", this.getAttribute("label-back") || "Back");
    this.#btnNext = this.#mkBtn("wizard-btn-next", this.getAttribute("label-next") || "Next");
    this.#btnCancel.addEventListener(
      "click",
      () => this.dispatchEvent(new CustomEvent("cancel", { bubbles: true }))
    );
    this.#btnBack.addEventListener("click", () => this.#go(this.#current - 1, "back"));
    this.#btnNext.addEventListener("click", () => this.#go(this.#current + 1, "next"));
    this.#navDiv = document.createElement("div");
    this.#navDiv.className = "wizard-nav";
    this.#navDiv.append(this.#btnCancel, this.#btnBack, this.#btnNext);
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
    steps.forEach((step, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-step-btn";
      if (i === this.#current) btn.setAttribute("aria-current", "step");
      if (i < this.#highWaterMark && i !== this.#current) btn.classList.add("wizard-step--complete");
      btn.textContent = step.getAttribute("title") || `Step ${i + 1}`;
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
    this.#indicator.querySelectorAll(".wizard-step-btn").forEach((btn, i) => {
      btn.toggleAttribute("aria-current", i === index);
      if (i === index) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
      btn.classList.toggle("wizard-step--complete", i < this.#highWaterMark && i !== index);
    });
    this.#updateNavVisibility();
    this.#updateNext();
    const active = steps[index];
    if (active) {
      const heading = active.querySelector("h1,h2,h3,h4,h5,h6");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus();
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
    const canAdvance = this.hasAttribute("can-advance");
    this.#btnNext.textContent = isLast ? this.getAttribute("label-finish") || "Finish" : this.getAttribute("label-next") || "Next";
    this.#btnNext.disabled = !canAdvance;
    this.#btnNext.setAttribute("aria-disabled", String(!canAdvance));
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
    this.#btnCancel.textContent = this.getAttribute("label-cancel") || "Cancel";
    this.#updateNext();
  }
  #updateNavVisibility() {
    if (!this.#btnBack) return;
    this.#btnBack.hidden = this.#current === 0;
  }
};
customElements.define("gc-wizard-shell", GcWizardShell);

// src/gc-optional-panels.js
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

// src/gc-resource-row.js
var GcResourceRow = class extends HTMLElement {
  static observedAttributes = ["title", "sub", "set", "clearable", "label-set", "label-unset", "label-clear"];
  #main = null;
  #titleEl = null;
  #subEl = null;
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
    this.#main.append(this.#titleEl, this.#subEl);
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

// src/gc-deploy-progress.js
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

// example/main.js
function log(id, msg) {
  const pre = document.getElementById(id);
  if (pre) pre.textContent = msg;
}
var shell = document.getElementById("demo-shell");
shell.addEventListener("navigate", (e) => log("shell-log", `navigate: step ${e.detail.from} \u2192 ${e.detail.to} (${e.detail.reason})`));
shell.addEventListener("navigated", (e) => log("shell-log", `navigated: now on step ${e.detail.to}`));
shell.addEventListener("finish", () => log("shell-log", "finish fired"));
shell.addEventListener("cancel", () => log("shell-log", "cancel fired"));
document.getElementById("demo-panels").addEventListener(
  "selection-change",
  (e) => log("panels-log", `selected: ${JSON.stringify(e.detail.selected)}`)
);
document.getElementById("demo-multi").addEventListener(
  "selection-change",
  (e) => log("multi-log", `selected: ${JSON.stringify(e.detail.selected)}`)
);
document.getElementById("demo-row-set").addEventListener(
  "clear",
  () => log("row-log", "clear fired on the KV store row")
);
document.getElementById("btn-deploy").addEventListener("click", () => {
  const el = document.getElementById("demo-deploy");
  el.state = {
    status: "applying",
    plan: {
      planId: "demo",
      summary: "2 apps, 1 CDN origin, 2 rules",
      steps: [
        { action: "fastedge.apps.create", describe: "Create app totp-filter" },
        { action: "fastedge.apps.create", describe: "Create app totp-app" },
        { action: "cdn.rules.create", describe: "Route /auth/totp to the app" }
      ],
      warnings: ["MFA_AUDIENCE not set on the filter \u2014 Profile B will fail closed"]
    },
    progress: [
      { step: 1, total: 3, describe: "Created totp-filter" },
      { step: 2, total: 3, describe: "Created totp-app" }
    ],
    result: {
      status: "complete",
      createdFastedgeApps: [
        { ref: "filter", id: 101, url: "https://totp-filter.example" },
        { ref: "app", id: 102, url: "https://totp-app.example" }
      ]
    }
  };
});
document.getElementById("btn-theme").addEventListener("click", () => {
  document.body.classList.toggle("gc-theme-light");
  document.body.classList.toggle("gc-theme-dark");
});
