/**
 * <gc-locked> — marks the fields inside it as locked and says why, the same way a locked
 * <gc-resource-row> does. Use it for anything that can't change on Re-entry (from the SDK field
 * map's `locks()`, or a host-fixed value such as the app name).
 *
 * Usage:
 *   <gc-locked reason="Fixed after the first deploy.">
 *     <label>Auth prefix <input value="/auth/totp" disabled></label>
 *   </gc-locked>
 *
 * Attributes:
 *   reason  (string) — shown under the fields as "🔒 <reason>"; no attribute → no line, no lock styling
 *
 * The element only adds its reason line (appended, element-owned). It never touches the fields:
 * disable them yourself (`disabled`), so a framework keeps owning them. Without `reason` it renders
 * its children unchanged, so a wizard can wrap a field unconditionally.
 */
class GcLocked extends HTMLElement {
    static observedAttributes = ['reason'];

    #line = null;

    connectedCallback() {
        if (!this.#line) {
            this.#line = document.createElement('div');
            this.#line.className = 'wizard-locked-reason';
            this.append(this.#line);
        }
        this.#update();
    }

    attributeChangedCallback() {
        if (this.#line) this.#update();
    }

    #update() {
        const reason = this.getAttribute('reason');
        this.#line.textContent = reason ? `🔒 ${reason}` : '';
        this.#line.hidden = !reason;
        // Keep the reason line last even after a framework appends children.
        if (this.lastElementChild !== this.#line) this.append(this.#line);
    }
}

customElements.define('gc-locked', GcLocked);
