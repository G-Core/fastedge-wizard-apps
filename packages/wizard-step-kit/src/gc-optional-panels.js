/**
 * <gc-optional-panels> — choose-one or choose-many panel group.
 *
 * Usage:
 *   <gc-optional-panels>
 *     <gc-wizard-panel value="a" label="Option A">...</gc-wizard-panel>
 *     <gc-wizard-panel value="b" label="Option B">...</gc-wizard-panel>
 *   </gc-optional-panels>
 *
 *   Add `multiple` attribute for checkbox (multi-select) behaviour.
 *
 * Events (all bubble):
 *   selection-change — detail: { selected: string[] }
 *
 * Property:
 *   selected — string[]; setting it selects those panels without firing selection-change
 *              (e.g. a form loaded from an existing deployment).
 */
class GcOptionalPanels extends HTMLElement {
    static observedAttributes = ['multiple'];

    #selected = new Set();

    connectedCallback() {
        this.setAttribute('role', 'listbox');
        this.setAttribute('aria-multiselectable', String(this.hasAttribute('multiple')));
        this.#initPanels();

        // Watch for dynamically added panels
        const mo = new MutationObserver(() => this.#initPanels());
        mo.observe(this, { childList: true });
        this._mo = mo;
    }

    disconnectedCallback() {
        this._mo?.disconnect();
    }

    attributeChangedCallback() {
        if (!this.isConnected) return;
        this.setAttribute('aria-multiselectable', String(this.hasAttribute('multiple')));
        if (!this.hasAttribute('multiple')) {
            // Collapse to at most one selection
            const first = [...this.#selected][0];
            this.#selected.clear();
            if (first) this.#selected.add(first);
            this.#updateDisplay();
        }
    }

    get selected() {
        return [...this.#selected];
    }

    set selected(values) {
        const next = this.hasAttribute('multiple') ? values : values.slice(0, 1);
        this.#selected = new Set(next);
        this.#updateDisplay();
    }

    #panels() {
        return [...this.querySelectorAll(':scope > gc-wizard-panel')];
    }

    #initPanels() {
        this.#panels().forEach(panel => {
            if (panel._initialized) return;
            panel._initialized = true;

            const val = panel.getAttribute('value') ?? '';
            panel.setAttribute('role', 'option');
            // From the stored selection: `selected` may have been set before this panel existed.
            panel.setAttribute('aria-selected', String(this.#selected.has(val)));
            panel.setAttribute('tabindex', '0');
            panel.classList.add('wizard-panel');

            // Header row (label + indicator). Appended LAST and never reparents the
            // panel's existing children — React (or any framework) owns those nodes,
            // and moving them into a wrapper corrupts its reconciliation. CSS orders
            // the header first and collapses the body when aria-selected is false.
            const header = document.createElement('div');
            header.className = 'wizard-panel-header';
            const indicator = document.createElement('span');
            indicator.className = 'wizard-panel-indicator';
            indicator.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'wizard-panel-label';
            labelEl.textContent = panel.getAttribute('label') || val;
            header.append(indicator, labelEl);
            panel.append(header);

            panel.addEventListener('click', e => {
                // Only the header toggles; clicks in the body pass through to controls.
                if (e.target.closest('.wizard-panel-header')) this.#toggle(val);
            });
            panel.addEventListener('keydown', e => {
                if (e.target !== panel) return; // ignore keys bubbling from body controls
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.#toggle(val); }
            });
        });
    }

    #toggle(val) {
        if (!this.hasAttribute('multiple')) {
            const wasSelected = this.#selected.has(val);
            this.#selected.clear();
            if (!wasSelected) this.#selected.add(val);
        } else {
            if (this.#selected.has(val)) this.#selected.delete(val);
            else this.#selected.add(val);
        }
        this.#updateDisplay();
        this.dispatchEvent(new CustomEvent('selection-change', {
            bubbles: true,
            detail: { selected: [...this.#selected] },
        }));
    }

    #updateDisplay() {
        this.#panels().forEach(panel => {
            const selected = this.#selected.has(panel.getAttribute('value') ?? '');
            panel.setAttribute('aria-selected', String(selected));
        });
    }
}

customElements.define('gc-optional-panels', GcOptionalPanels);
