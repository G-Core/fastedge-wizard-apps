/**
 * <gc-resource-row> — a managed-resource / picker row: title + sub on the left,
 * host-supplied action controls in the middle, a "set / not set" status badge
 * (with optional clear button) on the right. Maps to "pick or create a
 * secret / store / CDN resource" flows.
 *
 * Usage:
 *   <gc-resource-row title="Session key" sub="HS256, shared" set clearable>
 *     <button>Generate</button>
 *   </gc-resource-row>
 *
 * Attributes:
 *   title        (string)  — row title (fixed purpose label — never overwrite with a picked
 *                            resource's name; that goes in `value` instead)
 *   sub          (string)  — secondary line under the title
 *   value        (string)  — resolved resource's own name once set (e.g. the picked secret's
 *                            name); rendered as a third, truncating line — never in the badge,
 *                            which is fixed-width and would overflow on narrow screens
 *   set          (boolean) — resource is set → badge reads label-set, styled "success"
 *   clearable    (boolean) — show a clear (×) button in the badge while set
 *   label-set    (string, default "set")
 *   label-unset  (string, default "not set")
 *   label-clear  (string, default "Clear") — aria-label for the × button
 *   locked       (boolean) — can't change (e.g. fixed after the first deploy, from the SDK
 *                            field map's `locks()`): compact row, a neutral "🔒 locked" badge, no
 *                            clear button, host actions hidden, aria-disabled
 *   reason       (string)  — why it's locked; replaces `sub` while locked
 *   label-locked (string, default "locked")
 *
 * Events (bubble):
 *   clear — the × button was clicked
 *
 * Like the other kit elements, the row builds its own chrome (title/sub/badge)
 * but never touches the host-supplied action children — they stay as direct
 * children between the prepended main block and the appended badge, so a
 * framework keeps DOM ownership. ("Host owns truth, element owns choreography".)
 */
class GcResourceRow extends HTMLElement {
    static observedAttributes = [
        'title', 'sub', 'value', 'set', 'clearable', 'label-set', 'label-unset', 'label-clear',
        'locked', 'reason', 'label-locked',
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
        this.classList.add('wizard-row');

        // Left: element-owned title + sub, prepended before the host's actions.
        this.#main = document.createElement('div');
        this.#main.className = 'wizard-row-main';
        this.#titleEl = document.createElement('div');
        this.#titleEl.className = 'wizard-row-title';
        this.#subEl = document.createElement('div');
        this.#subEl.className = 'wizard-row-sub';
        this.#valueEl = document.createElement('div');
        this.#valueEl.className = 'wizard-row-value';
        this.#main.append(this.#titleEl, this.#subEl, this.#valueEl);

        // Right: element-owned status badge, appended after the host's actions.
        this.#badge = document.createElement('span');
        this.#badge.className = 'wizard-row-badge';

        this.prepend(this.#main);
        this.append(this.#badge);
        this.#update();
    }

    #update() {
        this.#titleEl.textContent = this.getAttribute('title') || '';
        const locked = this.hasAttribute('locked');
        if (locked) this.setAttribute('aria-disabled', 'true'); else this.removeAttribute('aria-disabled');
        const sub = locked ? this.getAttribute('reason') || this.getAttribute('sub') : this.getAttribute('sub');
        this.#subEl.textContent = sub || '';
        this.#subEl.hidden = !sub;

        const value = this.getAttribute('value');
        this.#valueEl.textContent = value || '';
        this.#valueEl.hidden = !value;
        if (value) this.#valueEl.title = value; else this.#valueEl.removeAttribute('title');

        const isSet = this.hasAttribute('set');
        this.#badge.classList.toggle('wizard-row-badge--set', isSet && !locked);
        this.#badge.classList.toggle('wizard-row-badge--locked', locked);
        this.#badge.textContent = locked
            ? `🔒 ${this.getAttribute('label-locked') || 'locked'}`
            : isSet
                ? (this.getAttribute('label-set') || 'set')
                : (this.getAttribute('label-unset') || 'not set');

        if (isSet && !locked && this.hasAttribute('clearable')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wizard-row-clear';
            btn.textContent = '×';
            btn.setAttribute('aria-label', this.getAttribute('label-clear') || 'Clear');
            btn.addEventListener('click', () =>
                this.dispatchEvent(new CustomEvent('clear', { bubbles: true }))
            );
            this.#badge.append(btn);
        }
    }
}

customElements.define('gc-resource-row', GcResourceRow);
