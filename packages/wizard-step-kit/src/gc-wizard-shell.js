/**
 * <gc-wizard-shell> — stepped navigation shell.
 *
 * Usage:
 *   <gc-wizard-shell can-advance label-next="Next" label-finish="Deploy">
 *     <gc-wizard-step title="App">...</gc-wizard-step>
 *     <gc-wizard-step title="Secrets">...</gc-wizard-step>
 *   </gc-wizard-shell>
 *
 * Events (all bubble):
 *   navigate       — cancelable; detail: { from, to, reason: 'next'|'back'|'goto' }
 *   navigated      — settled;    detail: { from, to }
 *   finish         — last step Next clicked
 *   wizard-finished — Finished button clicked (only reachable once `finished` is set)
 *
 * Attributes:
 *   can-advance      (boolean) — enables the Next/Finish button
 *   finished         (boolean) — once set, Back is hidden and Next becomes a single "Finished"
 *                                button that dispatches `wizard-finished` instead of navigating
 *   error            (string)  — validation message shown above nav
 *   label-back       (string, default "Back")
 *   label-next       (string, default "Next")
 *   label-finish     (string, default "Finish")
 *   label-finished   (string, default "Finished")
 */
class GcWizardShell extends HTMLElement {
    static observedAttributes = [
        'can-advance',
        'finished',
        'error',
        'label-back',
        'label-next',
        'label-finish',
        'label-finished',
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
        // Auto-follow growing step content (e.g. streaming deploy progress) the way a
        // terminal/chat log does: keep the bottom in view, but only while the user hasn't
        // scrolled away to reread something above.
        this.#ro = new ResizeObserver(() => this.#followBottom());
        this.#ro.observe(this);
        window.addEventListener('scroll', this.#onScroll, { passive: true });
    }

    disconnectedCallback() {
        this.#mo?.disconnect();
        this.#ro?.disconnect();
        window.removeEventListener('scroll', this.#onScroll);
    }

    #onScroll = () => {
        const doc = document.documentElement;
        this.#stuckToBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
    };

    #followBottom() {
        if (this.#stuckToBottom) {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
    }

    attributeChangedCallback(name) {
        if (!this.#navDiv) return;
        if (name === 'can-advance') this.#updateNext();
        else if (name === 'finished') { this.#updateNext(); this.#updateNavVisibility(); }
        else if (name === 'error') this.#updateError();
        else this.#updateLabels();
    }

    #steps() {
        return [...this.querySelectorAll(':scope > gc-wizard-step')];
    }

    #build() {
        this.#indicator = document.createElement('nav');
        this.#indicator.className = 'wizard-indicator';
        this.#indicator.setAttribute('aria-label', 'Steps');

        this.#errorDiv = document.createElement('div');
        this.#errorDiv.className = 'wizard-error';
        this.#errorDiv.setAttribute('role', 'alert');
        this.#errorDiv.hidden = true;

        this.#btnBack   = this.#mkBtn('wizard-btn-back',   this.getAttribute('label-back')   || 'Back');
        this.#btnNext   = this.#mkBtn('wizard-btn-next',   this.getAttribute('label-next')   || 'Next');

        this.#btnBack.addEventListener('click', () => this.#go(this.#current - 1, 'back'));
        this.#btnNext.addEventListener('click', () => {
            if (this.hasAttribute('finished')) {
                this.dispatchEvent(new CustomEvent('wizard-finished', { bubbles: true }));
                return;
            }
            this.#go(this.#current + 1, 'next');
        });

        this.#navDiv = document.createElement('div');
        this.#navDiv.className = 'wizard-nav';
        this.#navDiv.append(this.#btnBack, this.#btnNext);

        this.prepend(this.#indicator, this.#errorDiv);
        this.append(this.#navDiv);

        this.#rebuildIndicator();
        this.#show(0);
        this.#updateError();

        // Rebuild indicator when gc-wizard-step children are added/removed
        this.#mo = new MutationObserver(() => this.#rebuildIndicator());
        this.#mo.observe(this, { childList: true });
    }

    #mkBtn(className, label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.textContent = label;
        return btn;
    }

    #rebuildIndicator() {
        const steps = this.#steps();
        this.#indicator.innerHTML = '';
        steps.forEach((step, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wizard-step-btn';
            if (i === this.#current) btn.setAttribute('aria-current', 'step');
            if (i < this.#highWaterMark && i !== this.#current) btn.classList.add('wizard-step--complete');
            // Beyond the high-water mark isn't reachable yet — only Next (gated by can-advance)
            // extends the mark, so jumping ahead here would bypass per-step validation entirely.
            btn.disabled = i > this.#highWaterMark;
            btn.setAttribute('aria-disabled', String(i > this.#highWaterMark));
            btn.textContent = step.getAttribute('title') || `Step ${i + 1}`;
            btn.addEventListener('click', () => this.#go(i, 'goto'));
            this.#indicator.append(btn);
        });
        this.#updateNavVisibility();
        this.#updateNext();
    }

    #show(index) {
        const steps = this.#steps();
        this.#current = index;
        this.#stuckToBottom = true;
        steps.forEach((s, i) => { s.hidden = i !== index; });

        this.#indicator.querySelectorAll('.wizard-step-btn').forEach((btn, i) => {
            btn.toggleAttribute('aria-current', i === index);
            if (i === index) btn.setAttribute('aria-current', 'step');
            else btn.removeAttribute('aria-current');
            btn.classList.toggle('wizard-step--complete', i < this.#highWaterMark && i !== index);
            btn.disabled = i > this.#highWaterMark;
            btn.setAttribute('aria-disabled', String(i > this.#highWaterMark));
        });

        this.#updateNavVisibility();
        this.#updateNext();

        // Move focus to the active step's first heading
        const active = steps[index];
        if (active) {
            const heading = active.querySelector('h1,h2,h3,h4,h5,h6');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus();
            }
        }
    }

    #go(to, reason) {
        const steps = this.#steps();

        // Last step + next → finish
        if (reason === 'next' && this.#current === steps.length - 1) {
            this.dispatchEvent(new CustomEvent('finish', { bubbles: true }));
            return;
        }

        if (to < 0 || to >= steps.length) return;

        // goto (stepper-indicator click) can only revisit an already-reached step — only
        // Next (gated by can-advance) may extend the high-water mark forward.
        if (reason === 'goto' && to > this.#highWaterMark) return;

        const ev = new CustomEvent('navigate', {
            bubbles: true,
            cancelable: true,
            detail: { from: this.#current, to, reason },
        });
        if (!this.dispatchEvent(ev)) return; // host vetoed

        const from = this.#current;
        this.#highWaterMark = Math.max(this.#highWaterMark, to);
        this.#show(to);
        this.dispatchEvent(new CustomEvent('navigated', {
            bubbles: true,
            detail: { from, to },
        }));
    }

    #updateNext() {
        if (!this.#btnNext) return;
        const steps = this.#steps();
        const isLast = this.#current === steps.length - 1;
        const finished = this.hasAttribute('finished');
        this.#btnNext.textContent = finished
            ? (this.getAttribute('label-finished') || 'Finished')
            : isLast
                ? (this.getAttribute('label-finish') || 'Finish')
                : (this.getAttribute('label-next')   || 'Next');
        const disabled = finished ? false : !this.hasAttribute('can-advance');
        this.#btnNext.disabled = disabled;
        this.#btnNext.setAttribute('aria-disabled', String(disabled));
    }

    #updateError() {
        if (!this.#errorDiv) return;
        const msg = this.getAttribute('error');
        this.#errorDiv.hidden = !msg;
        this.#errorDiv.textContent = msg || '';
    }

    #updateLabels() {
        if (!this.#btnBack) return;
        this.#btnBack.textContent = this.getAttribute('label-back') || 'Back';
        this.#updateNext();
    }

    #updateNavVisibility() {
        if (!this.#btnBack) return;
        this.#btnBack.hidden = this.#current === 0 || this.hasAttribute('finished');
    }
}

customElements.define('gc-wizard-shell', GcWizardShell);
