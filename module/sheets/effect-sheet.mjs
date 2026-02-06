/**
 * Item Sheet classes for Active and Passive Effects
 */
import { saveSelection, restoreSelection, createColorPicker, applyForeColor, applyBackgroundColor, applyFontSizeToSelection, pastePlain } from '../helpers/text-editor.mjs';
export class WayfinderActiveEffectSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "item"],
    position: {
      width: 600,
      height: 700
    },
    window: {
      colorScheme: "light",
      resizable: true
    },
    actions: {
      onEditImage: WayfinderActiveEffectSheet._onEditImage
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/wayfinder/templates/item/item-active-effect-sheet.hbs"
    }
  };

  get form() {
    return this.element?.querySelector('form');
  }

  /**
   * Replace an HTML <datalist> inside a dialog with a custom, scrollable dropdown
   * that supports mouse-wheel scrolling and click selection.
   */
  _attachPathDropdown(dlg, optionSource) {
    try {
      if (!dlg) return;
      // Support being passed either the Dialog instance or an HTMLElement root
      let root = null;
      if (dlg?.element) root = (dlg.element.jquery && dlg.element.length) ? dlg.element[0] : dlg.element; // Dialog instance
      else root = (dlg.jquery && dlg.length) ? dlg[0] : dlg; // raw element possibly wrapped
      if (!root) return;
      const input = root.querySelector('input[name="targetPath"]');
      const datalist = root.querySelector('datalist#wf-paths');
      if (!input) return;
      // Prevent multiple attachments for the same dialog
      if (root.dataset.wfPathDropdownAttached) return;
      root.dataset.wfPathDropdownAttached = '1';
      // Remove native datalist behavior so only our custom dropdown is shown
      try { input.removeAttribute('list'); } catch (e) {}

      // Build dropdown container
      const dropdown = document.createElement('div');
      dropdown.className = 'wf-path-dropdown';
      dropdown.style.position = 'absolute';
      dropdown.style.zIndex = '2000';
      dropdown.style.maxHeight = '220px';
      dropdown.style.overflow = 'auto';
      dropdown.style.border = '1px solid rgba(0,0,0,0.25)';
      dropdown.style.background = 'var(--wf-surface, #0f1720)';
      dropdown.style.color = 'var(--color-text-primary, #fff)';
      dropdown.style.boxShadow = '0 6px 18px rgba(2,6,23,0.6)';
      dropdown.style.display = 'none';
      dropdown.style.fontSize = '0.95rem';

      let options = [];
      if (datalist) {
        options = Array.from(datalist.querySelectorAll('option')).map(o => String(o.value || o.textContent || '').trim()).filter(Boolean);
      } else if (optionSource) {
        // Accept either an array of strings or an HTML string with <option> tags
        if (Array.isArray(optionSource)) {
          options = optionSource.map(s => String(s).trim()).filter(Boolean);
        } else if (typeof optionSource === 'string') {
          // Try to extract value attributes from <option value="..."></option>
          const vals = [];
          try {
            const re = /<option[^>]*value=["']([^"']+)["'][^>]*>/gi;
            let m;
            while ((m = re.exec(optionSource)) !== null) vals.push(m[1]);
          } catch (e) {}
          if (vals.length) options = vals.map(s => String(s).trim()).filter(Boolean);
          else {
            // Fallback: split by newlines or commas
            options = optionSource.split(/\r?\n|,|;/).map(s => String(s).trim()).filter(Boolean);
          }
        }
      } else {
        return;
      }

      const buildList = (items) => {
        dropdown.innerHTML = '';
        for (const it of items) {
          const el = document.createElement('div');
          el.className = 'wf-path-item';
          el.textContent = it;
          el.style.padding = '8px 10px';
          el.style.cursor = 'pointer';
          el.style.color = 'var(--color-text-primary, #fff)';
          el.addEventListener('click', () => {
            input.value = it;
            dropdown.style.display = 'none';
            input.focus();
          });
          el.addEventListener('mouseenter', () => { el.style.background = 'rgba(255,255,255,0.06)'; });
          el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
          dropdown.appendChild(el);
        }
      };

      buildList(options);

      // Attach dropdown to body so we don't depend on jQuery or dialog internals
      dropdown.setAttribute('data-wf-dropdown-for', 'modifier-path');
      dropdown.dataset.attachedTo = (root.id) ? root.id : `wfdlg-${Date.now()}`;
      if (!root.id) try { root.id = dropdown.dataset.attachedTo; } catch (e) {}
      document.body.appendChild(dropdown);

      const positionDropdown = () => {
        const rect = input.getBoundingClientRect();
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
        dropdown.style.minWidth = `${rect.width}px`;
      };

      let hideTimeout = null;
      const showDropdown = () => { positionDropdown(); dropdown.style.display = 'block'; };
      const hideDropdownSoon = (delay = 150) => { hideTimeout = setTimeout(() => { dropdown.style.display = 'none'; hideTimeout = null; }, delay); };
      const cancelHide = () => { if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } };

      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
        buildList(filtered);
        showDropdown();
      });

      input.addEventListener('focus', () => { showDropdown(); });
      input.addEventListener('blur', () => { hideDropdownSoon(150); });
      window.addEventListener('resize', positionDropdown);
      window.addEventListener('scroll', positionDropdown, true);

      // Allow wheel events to scroll the dropdown (prevent parent scroll capture)
      dropdown.style.overscrollBehavior = 'contain';
      dropdown.tabIndex = -1;
      dropdown.addEventListener('mouseenter', () => { try { dropdown.focus(); cancelHide(); } catch (e) {} });
      dropdown.addEventListener('mouseleave', () => { hideDropdownSoon(120); });
      dropdown.addEventListener('wheel', (ev) => {
        try {
          dropdown.scrollTop += ev.deltaY;
          ev.stopPropagation();
          ev.preventDefault();
        } catch (e) {}
      }, { passive: false });

      // If the input receives wheel events while focused, forward them to dropdown
      input.addEventListener('wheel', (ev) => {
        if (dropdown.style.display === 'block') {
          try {
            dropdown.scrollTop += ev.deltaY;
            ev.stopPropagation();
            ev.preventDefault();
          } catch (e) {}
        }
      }, { passive: false });

      // Remove dropdown when dialog root is removed from DOM (cleanup)
      const observer = new MutationObserver(() => {
        if (!document.body.contains(root)) {
          try { dropdown.remove(); } catch (e) {}
          try { observer.disconnect(); } catch (e) {}
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

    } catch (err) {
      console.warn('Wayfinder: could not attach path dropdown', err);
    }
  }

  get title() {
    return this.document?.name || "Effect";
  }

  async _prepareContext(options) {
    const traitUuids = Array.isArray(this.document.system?.traits) ? this.document.system.traits : [];

    const traitsResolved = [];

    const normalizeColor = (raw) => {
      try {
        if (!raw && raw !== '') return '#666666';
        let c = raw;
        if (typeof c === 'object' && c !== null) {
          if (typeof c.value === 'string') c = c.value;
          else return '#666666';
        }
        if (typeof c !== 'string') return '#666666';
        c = c.trim();
        if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c}`;
        if (/^[0-9A-Fa-f]{3}$/.test(c)) return `#${c}`;
        return c || '#666666';
      } catch (e) {
        return '#666666';
      }
    };

    const getContrastColor = (color) => {
      try {
        if (!color || typeof color !== 'string') return '#fff';
        const c = color.trim();
        if (c.startsWith('#')) {
          const h = c.substring(1);
          const r = parseInt(h.length === 3 ? h[0]+h[0] : h.substring(0,2), 16);
          const g = parseInt(h.length === 3 ? h[1]+h[1] : h.substring(2,4), 16);
          const b = parseInt(h.length === 3 ? h[2]+h[2] : h.substring(4,6), 16);
          const yiq = (r*299 + g*587 + b*114) / 1000;
          return yiq >= 128 ? '#000' : '#fff';
        }
      } catch (e) {}
      return '#fff';
    };

    for (const uuid of traitUuids) {
      try {
        const doc = await fromUuid(uuid);
        if (doc && doc.type === 'trait') {
          const c = normalizeColor(doc.system?.color);
          traitsResolved.push({
            uuid,
            id: doc.id,
            name: doc.name,
            color: c,
            textColor: getContrastColor(c)
          });
        }
      } catch (err) {
        console.warn('Erro ao resolver trait para efeito:', uuid, err);
      }
    }

    const context = {
      item: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      editable: this.isEditable,
      cssClasses: this.constructor.DEFAULT_OPTIONS.classes.join(" "),
      traitsResolved
    };
    return context;
  }

  _saveScrollPosition() {
    try {
      const sheetBody = this.element?.querySelector('.sheet-body');
      const appEl = this.element?.closest('.app') || this.element?.closest('.window-app') || null;
      const windowScroll = (typeof window !== 'undefined') ? window.scrollY : 0;
      const sheetScroll = sheetBody ? sheetBody.scrollTop : null;
      const appScroll = appEl ? appEl.scrollTop : null;
      this._wayfinderSavedScrolls = { windowScroll, sheetScroll, appScroll };
      console.log('Wayfinder: saved scrolls', this._wayfinderSavedScrolls);
    } catch (err) {
      this._wayfinderSavedScrolls = null;
    }
  }

  _saveFocusedElement() {
    try {
      const active = document.activeElement;
      if (!active) {
        this._wayfinderSavedFocus = null;
        return;
      }
      // Only save if element is inside this sheet
      if (!this.element?.contains(active)) {
        this._wayfinderSavedFocus = null;
        return;
      }
      const info = {
        tagName: active.tagName,
        id: active.id || null,
        name: active.getAttribute ? active.getAttribute('name') : null,
        datasetField: active.dataset ? active.dataset.field || null : null,
        classList: active.className || null
      };
      this._wayfinderSavedFocus = info;
      console.log('Wayfinder: saved focused element', info);
    } catch (err) {
      this._wayfinderSavedFocus = null;
    }
  }

  _restoreFocusedElement() {
    try {
      const info = this._wayfinderSavedFocus;
      if (!info) return;
      let el = null;
      if (info.name) el = this.element.querySelector(`[name="${info.name}"]`);
      if (!el && info.datasetField) el = this.element.querySelector(`[data-field="${info.datasetField}"]`);
      if (!el && info.id) el = this.element.querySelector(`#${info.id}`);
      if (!el && info.classList) {
        // try find by one class
        const cls = info.classList.split(' ')[0];
        if (cls) el = this.element.querySelector('.' + cls);
      }
      if (el) {
        try {
          el.focus();
          if (el.setSelectionRange && typeof el.value === 'string') {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
          if (el.isContentEditable) {
            // place caret at end
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          console.log('Wayfinder: restored focus to element', info);
        } catch (err) {
          console.warn('Wayfinder: could not restore focus', err);
        }
      }
      this._wayfinderSavedFocus = null;
    } catch (err) {
      this._wayfinderSavedFocus = null;
    }
  }

  _restoreScrollPosition() {
    try {
      if (this._wayfinderSavedScroll == null) return;
      const apply = () => {
        try {
          const sheetBody = this.element?.querySelector('.sheet-body');
          const appEl = this.element?.closest('.app') || this.element?.closest('.window-app') || null;
          if (this._wayfinderSavedScrolls?.sheetScroll != null && sheetBody) {
            sheetBody.scrollTop = this._wayfinderSavedScrolls.sheetScroll;
          }
          if (this._wayfinderSavedScrolls?.appScroll != null && appEl) {
            appEl.scrollTop = this._wayfinderSavedScrolls.appScroll;
          }
          if (this._wayfinderSavedScrolls?.windowScroll != null) {
            window.scrollTo(0, this._wayfinderSavedScrolls.windowScroll);
          }
          console.log('Wayfinder: restored scrolls', this._wayfinderSavedScrolls);
        } catch (err) {
          console.warn('Wayfinder: failed to restore scrolls', err);
        }
        this._wayfinderSavedScrolls = null;
      };
      // Try to restore on next paint for reliability
      requestAnimationFrame(() => requestAnimationFrame(apply));
    } catch (err) {
      this._wayfinderSavedScroll = null;
    }
  }

  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    return context;
  }

  static _onEditImage(event) {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: (path) => {
        this.document.update({ img: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    if (!html) return;

    try {
      const heightened = this.document.system?.heightened ?? [];
      console.log('Wayfinder: rendering Effect sheet, current heightened count:', Array.isArray(heightened) ? heightened.length : 0, 'contents:', JSON.stringify(heightened));
      // Restore last saved scroll position and focused element (if any)
      setTimeout(() => {
        this._restoreScrollPosition();
        this._restoreFocusedElement();
      }, 10);
    } catch (err) {
      console.log('Wayfinder: rendering Effect sheet, could not stringify heightened', this.document.system?.heightened, err);
    }

    if (this.isEditable) {
      if (!html.dataset.wayfinderChangeBound) {
        html.dataset.wayfinderChangeBound = '1';
        html.addEventListener('change', (ev) => {
          try { this._saveFocusedElement(ev.target); } catch (e) {}
          this._submitForm(ev);
        });
      }

      this._setupInlineEditor(html);
      this._setupMagicSection(html);
      this._setupModifiersSection(html);
      // Bind remove/edit effect buttons when editing an effect directly
      if (!html.dataset.wayfinderEffectActionsBound) {
        html.dataset.wayfinderEffectActionsBound = '1';
        html.addEventListener('click', (ev) => {
          const removeBtn = ev.target.closest('.remove-effect-btn');
          if (removeBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            return this._onRemoveEffect(ev);
          }
          const editBtn = ev.target.closest('.edit-effect-btn');
          if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            // Open the edit form for this effect (if implemented elsewhere)
            try {
              const uuid = editBtn.dataset.uuid;
              // If this is an embedded effect inside a pack/document, try to open its sheet
              if (uuid && typeof fromUuid === 'function') {
                try { fromUuid(uuid).then(doc => doc?.sheet?.render?.(true)).catch(()=>{}); } catch(e){}
              }
            } catch (e) {}
            return;
          }
        });
      }
    }

    html.addEventListener('dragover', (ev) => ev.preventDefault());
    html.addEventListener('drop', (ev) => this._onDrop(ev));

    // Tab switching
    const tabButtons = html.querySelectorAll('.sheet-tabs .item');
    const tabContents = html.querySelectorAll('.sheet-body .tab');

    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = button.dataset.tab;

        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(tab => tab.classList.remove('active'));

        button.classList.add('active');

        const activeTab = html.querySelector(`.sheet-body .tab[data-tab="${tabName}"]`);
        if (activeTab) {
          activeTab.classList.add('active');
        }
      });
    });
  }

  /**
   * Setup modifiers tab handlers (add/edit/delete)
   */
  _setupModifiersSection(html) {
    if (!html) return;
    if (!html.dataset.wayfinderModifiersBound) {
      html.dataset.wayfinderModifiersBound = '1';
      html.addEventListener('click', async (ev) => {
        const addBtn = ev.target.closest('.add-modifier-btn');
        if (addBtn) {
          ev.preventDefault();
            console.log('Wayfinder: add-modifier clicked on', this.document.id);
            const current = Array.isArray(this.document.system?.modifiers) ? [...this.document.system.modifiers] : [];
            current.push({ name: 'New Modifier', description: '', value: 0 });
          this._saveScrollPosition();
          this._saveFocusedElement();
          const updated = await this.document.update({ 'system.modifiers': current });
          console.log('Wayfinder: modifiers updated (add) ->', Array.isArray(updated.system?.modifiers) ? updated.system.modifiers.length : 0);
          try { this.render(); } catch (e) { console.warn('Wayfinder: render failed after modifiers update', e); }
          setTimeout(() => {
            try {
              const tabBtn = this.element?.querySelector('.sheet-tabs .item[data-tab="effects"]');
              if (tabBtn) tabBtn.click();
            } catch (err) {}
          }, 40);
          return;
        }

        const deleteBtn = ev.target.closest('.delete-modifier');
        if (deleteBtn) {
          ev.preventDefault();
          console.log('Wayfinder: delete-modifier clicked on', this.document.id, 'idx=', deleteBtn.dataset.idx);
          const idx = Number(deleteBtn.dataset.idx);
          const current = Array.isArray(this.document.system?.modifiers) ? [...this.document.system.modifiers] : [];
          if (!Number.isNaN(idx) && idx >= 0 && idx < current.length) {
            current.splice(idx, 1);
            this._saveScrollPosition();
            this._saveFocusedElement();
            const updated = await this.document.update({ 'system.modifiers': current });
            console.log('Wayfinder: modifiers updated (delete) ->', Array.isArray(updated.system?.modifiers) ? updated.system.modifiers.length : 0);
            try { this.render(); } catch (e) { console.warn('Wayfinder: render failed after modifiers delete', e); }
            setTimeout(() => {
              try {
                const tabBtn = this.element?.querySelector('.sheet-tabs .item[data-tab="effects"]');
                if (tabBtn) tabBtn.click();
              } catch (err) {}
            }, 40);
          }
          return;
        }

        const editBtn = ev.target.closest('.edit-modifier');
        if (editBtn) {
          ev.preventDefault();
          console.log('Wayfinder: edit-modifier clicked on', this.document.id, 'idx=', editBtn.dataset.idx);
          const idx = Number(editBtn.dataset.idx);
          const current = Array.isArray(this.document.system?.modifiers) ? [...this.document.system.modifiers] : [];
          if (Number.isNaN(idx) || idx < 0 || idx >= current.length) return;
          const existing = current[idx] || { name: '', description: '', value: 0, targetPath: '' };

          // Build candidate paths by walking actor.system recursively when available
          const buildCandidatePaths = () => {
            const paths = new Set();
            const actor = this.document.actor;

            const add = (p) => { if (p && typeof p === 'string') paths.add(p); };

            const walk = (obj, prefix) => {
              if (obj == null) return;
              if (typeof obj !== 'object') { add(prefix); return; }
              if (Array.isArray(obj)) {
                // For arrays, add the array path itself and attempt a sample element
                add(prefix);
                if (obj.length > 0 && typeof obj[0] === 'object') walk(obj[0], `${prefix}.[0]`);
                return;
              }
              for (const [k, v] of Object.entries(obj)) {
                const childPath = prefix ? `${prefix}.${k}` : k;
                if (v == null) { add(childPath); }
                else if (typeof v === 'object') walk(v, childPath);
                else add(childPath);
              }
            };

            if (actor?.system) {
              // Ensure actor has strike/spell default structures so suggestions
              // and modifiers can target them persistently. We add the paths
              // to the suggestions immediately and queue an async actor.update
              // to persist defaults if needed.
              try {
                const needUpdate = {};
                const strike = actor.system.strike || null;
                const spell = actor.system.spell || null;
                const makeStack = () => ({ item: 0, circun: 0, status: 0, bonus: 0 });
                const makeDamage = () => ({ item: 0, circun: 0, status: 0, bonus: 0 });
                if (!strike) {
                  needUpdate['system.strike'] = Object.assign(makeStack(), { damage: makeDamage() });
                } else if (!strike.damage) {
                  needUpdate['system.strike'] = Object.assign({}, strike, { damage: makeDamage() });
                }
                if (!spell) {
                  needUpdate['system.spell'] = Object.assign(makeStack(), { damage: makeDamage() });
                } else if (!spell.damage) {
                  needUpdate['system.spell'] = Object.assign({}, spell, { damage: makeDamage() });
                }
                // Add the structures to suggestions right away
                add('system.strike.item'); add('system.strike.circun'); add('system.strike.status'); add('system.strike.bonus');
                add('system.strike.damage.item'); add('system.strike.damage.circun'); add('system.strike.damage.status'); add('system.strike.damage.bonus');
                add('system.spell.item'); add('system.spell.circun'); add('system.spell.status'); add('system.spell.bonus');
                add('system.spell.damage.item'); add('system.spell.damage.circun'); add('system.spell.damage.status'); add('system.spell.damage.bonus');
                // Fire-and-forget update to persist defaults (don't await to keep UI snappy)
                if (Object.keys(needUpdate).length) {
                  try { actor.update(needUpdate).catch?.(e => console.warn('Wayfinder: could not persist strike/spell defaults', e)); } catch(e) { console.warn('Wayfinder: actor.update failed', e); }
                }
              } catch (e) { console.warn('Wayfinder: error ensuring actor strike/spell defaults', e); }
              // Walk actor.system to collect other paths
              walk(actor.system, 'system');
            } else {
              // Fallback: common actor fields
              const defaults = ['system.attributes.strength.value','system.attributes.strength.item','system.attributes.strength.status','system.attributes.strength.circun','system.classDC','system.level','system.speed'];
              for (const d of defaults) add(d);
            }

            // Ensure common stacking suffixes for attributes/skills are suggested
            try {
              const attrKeys = actor?.system?.attributes ? Object.keys(actor.system.attributes) : ['strength','dexterity','intelligence','wisdom','presence'];
              for (const a of attrKeys) {
                add(`system.attributes.${a}.value`);
                add(`system.attributes.${a}.item`);
                add(`system.attributes.${a}.status`);
                add(`system.attributes.${a}.circun`);
              }
              const skillKeys = actor?.system?.skills ? Object.keys(actor.system.skills) : ['arcana','acrobatics','athletics','crafting','deception','diplomacy','intimidation','medicine','nature','occultism','performance','religion','society','stealth','survival'];
              for (const s of skillKeys) {
                add(`system.skills.${s}.item`);
                add(`system.skills.${s}.status`);
                add(`system.skills.${s}.circun`);
              }
            } catch (e) { /* ignore */ }

            return Array.from(paths).sort();
          };

          const candidatePaths = buildCandidatePaths();
          // Promote common strike/spell paths so they appear first in the suggestions
          const preferred = [
            'system.strike.item','system.strike.circun','system.strike.status','system.strike.bonus',
            'system.strike.damage.item','system.strike.damage.circun','system.strike.damage.status','system.strike.damage.bonus',
            'system.spell.item','system.spell.circun','system.spell.status','system.spell.bonus',
            'system.spell.damage.item','system.spell.damage.circun','system.spell.damage.status','system.spell.damage.bonus'
          ];
          // Always show preferred paths first so users see strike/spell hints even
          // when the effect isn't attached to an actor or actor.system lacks them.
          const merged = [];
          for (const p of preferred) if (!merged.includes(p)) merged.push(p);
          for (const p of candidatePaths) if (!merged.includes(p)) merged.push(p);
          const datalistOptions = merged.map(p => `<option value="${p}"></option>`).join('');

          const html = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/modifier-edit-form.hbs', {
            name: (existing.name||'').replace(/"/g,'&quot;'),
            targetPath: (existing.targetPath||'').replace(/"/g,'&quot;'),
            datalistOptions,
            value: Number(existing.value||0)
          });

          const handleSave = async (htmlDlg) => {
            let formEl = null;
            try {
              if (!htmlDlg) formEl = null;
              else if (htmlDlg instanceof HTMLElement) formEl = htmlDlg.querySelector('form');
              else if (htmlDlg.jquery && htmlDlg.length) formEl = htmlDlg[0].querySelector('form');
              else if (htmlDlg[0] && htmlDlg[0] instanceof HTMLElement) formEl = htmlDlg[0].querySelector('form');
              else if (typeof htmlDlg.find === 'function') {
                const found = htmlDlg.find('form');
                formEl = (found && found.length) ? found[0] : null;
              }
            } catch (err) {
              console.warn('Wayfinder | could not normalize dialog html', err, htmlDlg);
            }
            if (!formEl) {
              console.error('Wayfinder | edit-modifier dialog form not found', htmlDlg);
              ui.notifications?.error?.('Erro interno: formulário não encontrado.');
              return;
            }
            const fd = new FormData(formEl);
            const values = {};
            try { for (const [k, v] of fd.entries()) values[k] = v; } catch (e) {}
            const targetPath = values.targetPath ? String(values.targetPath).trim() : null;
            const name = values.name ?? existing.name;
            const value = Number(values.value) || 0;
            const description = values.description ?? existing.description ?? '';
            current[idx] = { name, description, value, targetPath };
            try {
              this._saveScrollPosition();
              this._saveFocusedElement();
              await this.document.update({ 'system.modifiers': current });
              console.log('Wayfinder: modifiers updated (edit) ->', Array.isArray(this.document.system?.modifiers) ? this.document.system.modifiers.length : 0);
              this.render(true);
            } catch (err) {
              console.error('Error saving modifier', err);
              ui.notifications?.error?.('Não foi possível salvar o modificador.');
            }
          };

          // Render dialog with icon partial like ItemSheet does
          Promise.all([
            foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-check' })
          ]).then(([saveIcon]) => {
            const dlg = new Dialog({
              title: `Editar Modifier: ${existing.name}`,
              content: html,
              buttons: {
                save: { icon: saveIcon, label: 'Salvar', callback: handleSave },
                cancel: { label: 'Cancelar' }
              },
              default: 'save'
            });
            dlg.render(true);
            setTimeout(() => { try { this._attachPathDropdown(dlg, merged); } catch (e) {} }, 120);
          }).catch((ie) => {
            console.warn('Wayfinder | failed to render icon partial for modifier dialog', ie);
            let fallbackIcon = 'fas fa-check';
            if (typeof fallbackIcon === 'string' && !fallbackIcon.includes('<')) fallbackIcon = `<i class="${fallbackIcon}"></i>`;
            const dlg = new Dialog({
              title: `Editar Modifier: ${existing.name}`,
              content: html,
              buttons: {
                save: { icon: fallbackIcon, label: 'Salvar', callback: handleSave },
                cancel: { label: 'Cancelar' }
              },
              default: 'save'
            });
            dlg.render(true);
            setTimeout(() => { try { this._attachPathDropdown(dlg, merged); } catch (e) {} }, 120);
          });
          setTimeout(() => {
            try {
              const tabBtn = this.element?.querySelector('.sheet-tabs .item[data-tab="effects"]');
              if (tabBtn) tabBtn.click();
            } catch (err) {}
          }, 40);
          return;
        }
      });
    }
  }

  /**
   * Setup magic section event listeners
   */
  _setupMagicSection(html) {
    const magicToggle = html.querySelector('.magic-toggle');
    if (!magicToggle) return;
    // Prevent binding duplicate listeners on re-render
    if (!magicToggle.dataset.wayfinderBound) {
      magicToggle.dataset.wayfinderBound = '1';
      // Handle magic toggle: update the single field, stop propagation so the generic
      // form 'change' listener doesn't submit prematurely, then re-render.
      magicToggle.addEventListener('change', async (ev) => {
        ev.stopPropagation();
        const checked = ev.target.checked;
        console.log('Wayfinder: magic-toggle changed ->', !!checked);
        this._saveScrollPosition();
        this._saveFocusedElement();
        await this.document.update({ 'system.isMagic': !!checked });
        this.render();
      });
    }

    // Single delegated click handler for add/remove heightened rows
    if (!html.dataset.wayfinderHeightenedBound) {
      html.dataset.wayfinderHeightenedBound = '1';
      html.addEventListener('click', async (ev) => {
        const addBtn = ev.target.closest('.add-heightened-btn');
        if (addBtn) {
          ev.preventDefault();
            const current = Array.isArray(this.document.system?.heightened) ? [...this.document.system.heightened] : [];
            const newIdx = current.length;
            current.push({ level: '', effects: '' });
            console.log('Wayfinder: add-heightened clicked -> updating document', { newIdx, willLength: current.length });
            // Persist the new row to the document and allow Foundry to re-render the sheet
            this._saveScrollPosition();
            this._saveFocusedElement();
            const updated = await this.document.update({ 'system.heightened': current });
            console.log('Wayfinder: document.update resolved, heightened length now', Array.isArray(updated.system?.heightened) ? updated.system.heightened.length : 0);
            return;
        }

        const removeBtn = ev.target.closest('.remove-heightened-btn');
        if (removeBtn) {
          ev.preventDefault();
          // Determine index from the row's position in the tbody to avoid stale data-idx values
          const row = removeBtn.closest('tr.heightened-row');
          const tbody = row?.parentElement;
          if (!row || !tbody) return;
          const rows = Array.from(tbody.querySelectorAll('tr.heightened-row'));
          const idx = rows.indexOf(row);
          const current = Array.isArray(this.document.system?.heightened) ? [...this.document.system.heightened] : [];
          console.log('Wayfinder: remove-heightened clicked', { idx, rowsLength: rows.length, currentLength: current.length });
          if (idx !== -1 && idx >= 0 && idx < current.length) {
            current.splice(idx, 1);
            this._saveScrollPosition();
            this._saveFocusedElement();
            await this.document.update({ 'system.heightened': current });
            console.log('Wayfinder: removed heightened, new current length', current.length);
          }
          return;
        }
      });
    }

    // Setup heightened effects editors (contenteditable with HTML support)
    const effectsEditors = html.querySelectorAll('.heightened-effects-editor');
    effectsEditors.forEach(editor => {
      const fieldName = editor.dataset.field;
      const hiddenTextarea = editor.parentElement.querySelector('.heightened-effects-hidden');

      // Avoid double-binding handlers after re-render
      if (editor.dataset.wayfinderEditorBound) return;
      editor.dataset.wayfinderEditorBound = '1';

      // Sync contenteditable to hidden textarea on input
      editor.addEventListener('input', (ev) => {
        hiddenTextarea.value = editor.innerHTML;
      });

      // Also sync on blur to ensure form submission catches it
        editor.addEventListener('blur', (ev) => {
          hiddenTextarea.value = editor.innerHTML;
          try { this._saveFocusedElement(editor); } catch (err) {}
          this._submitForm(ev);
      });

      // Allow paste with formatting
      editor.addEventListener('paste', (ev) => {
        ev.preventDefault();
        const text = (ev.clipboardData || window.clipboardData).getData('text/html') ||
                     (ev.clipboardData || window.clipboardData).getData('text/plain');

        if (text) {
          // Try to insert as HTML, fallback to text
          try {
            document.execCommand('insertHTML', false, text);
          } catch (e) {
            // Fallback: insert as plain text
            document.execCommand('insertText', false, text);
          }
        }

        setTimeout(() => {
          hiddenTextarea.value = editor.innerHTML;
        }, 10);
      });
    });
  }

  /**
   * Inline rich-text editor wiring (same behavior as trait sheet)
   */
  _setupInlineEditor(html) {
    const groups = html.querySelectorAll('.trait-description-group');
    if (!groups.length) return;

    groups.forEach((group) => {
      const toggleBtn = group.querySelector('.trait-editor-toggle-btn');
      const toolbar = group.querySelector('.trait-editor-toolbar');
      const content = group.querySelector('.trait-editor-content');
      const preview = group.querySelector('.trait-editor-preview');
      const closeBtn = group.querySelector('.editor-close-btn');
      const textarea = group.querySelector('textarea');
      const previewToggle = group.querySelector('.editor-preview-toggle');
      const undoStack = [];
      const redoStack = [];

      if (!toggleBtn || !toolbar || !content || !closeBtn || !textarea) return;

      const saveHistoryStep = () => {
        undoStack.push(content.innerHTML);
        redoStack.length = 0;
      };

      const undoBtn = group.querySelector('[data-format="undo"]');
      const redoBtn = group.querySelector('[data-format="redo"]');

      if (undoBtn) {
        undoBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (undoStack.length > 0) {
            redoStack.push(content.innerHTML);
            content.innerHTML = undoStack.pop();
            textarea.value = content.innerHTML;
          }
        });
      }

      if (redoBtn) {
        redoBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (redoStack.length > 0) {
            undoStack.push(content.innerHTML);
            content.innerHTML = redoStack.pop();
            textarea.value = content.innerHTML;
          }
        });
      }

      const updateStats = () => {
        const text = content.innerText || '';
        const words = text.trim().split(/\s+/).filter((w) => w).length;
        const chars = text.length;
        const wordCount = group.querySelector('.editor-word-count');
        const charCount = group.querySelector('.editor-char-count');
        if (wordCount) wordCount.textContent = `Palavras: ${words}`;
        if (charCount) charCount.textContent = `Caracteres: ${chars}`;
      };

      if (previewToggle) {
        previewToggle.addEventListener('click', (ev) => {
          ev.preventDefault();
          const isPreviewMode = preview.style.display !== 'none';
          if (isPreviewMode) {
            content.style.display = 'block';
            preview.style.display = 'none';
            previewToggle.classList.remove('active');
          } else {
            content.style.display = 'none';
            preview.style.display = 'block';
            preview.innerHTML = content.innerHTML;
            previewToggle.classList.add('active');
          }
        });
      }

      toggleBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const isEditing = content.getAttribute('data-text-editable') === 'true';

        if (!isEditing) {
          saveHistoryStep();
          content.setAttribute('contenteditable', 'true');
          content.setAttribute('data-text-editable', 'true');
          content.focus();
          toolbar.style.display = 'flex';
          toggleBtn.style.display = 'none';
        }
      });

      closeBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const newContent = content.innerHTML;
        textarea.value = newContent;
        content.setAttribute('contenteditable', 'false');
        content.setAttribute('data-text-editable', 'false');
        toolbar.style.display = 'none';
        toggleBtn.style.display = 'block';
        preview.style.display = 'none';
        content.style.display = 'block';
        this._submitForm(ev);
      });

      group.querySelectorAll('.editor-fmt-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const format = btn.dataset.format;
          const value = btn.dataset.value || undefined;

          content.focus();

          if (format === 'createLink') {
            const url = prompt('Digite a URL:');
            if (url) {
              document.execCommand(format, false, url);
            }
          } else if (format === 'insertImage') {
            const url = prompt('Digite a URL da imagem:');
            if (url) {
              document.execCommand('insertImage', false, url);
            }
          } else if (format === 'insertTable') {
            const rows = prompt('Número de linhas:', '3');
            const cols = prompt('Número de colunas:', '3');
            if (rows && cols) {
              let table = '<table border="1" style="width:100%"><tbody>';
              for (let i = 0; i < parseInt(rows); i++) {
                table += '<tr>';
                for (let j = 0; j < parseInt(cols); j++) {
                  table += '<td>&nbsp;</td>';
                }
                table += '</tr>';
              }
              table += '</tbody></table>';
              document.execCommand('insertHTML', false, table);
            }
          } else {
            try {
              document.execCommand(format, false, value);
            } catch (e) {
              console.warn('Format command failed:', format, e);
            }
          }

          textarea.value = content.innerHTML;
          saveHistoryStep();
          updateStats();
        });
      });

      // Font size control for effect editor (use helper)
      const fontInput = group.querySelector('.editor-font-size-input');
      const applyFontBtn = group.querySelector('.editor-apply-font-btn');
      let savedRangeForFont = null;
      if (applyFontBtn) {
        applyFontBtn.addEventListener('mousedown', () => { savedRangeForFont = saveSelection(); });
        applyFontBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const size = fontInput?.value || null;
          if (!size) return;
          if (savedRangeForFont) restoreSelection(savedRangeForFont);
          applyFontSizeToSelection(size);
          textarea.value = content.innerHTML;
          saveHistoryStep();
          updateStats();
          savedRangeForFont = null;
        });
      }

      const textColorBtn = group.querySelector('.editor-text-color-btn');
      const bgColorBtn = group.querySelector('.editor-bg-color-btn');

      if (textColorBtn) {
        textColorBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const saved = saveSelection();
          createColorPicker((color) => {
            if (saved) restoreSelection(saved);
            applyForeColor(color);
            textarea.value = content.innerHTML;
            saveHistoryStep();
            updateStats();
          });
        });
      }

      if (bgColorBtn) {
        bgColorBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const saved = saveSelection();
          createColorPicker((color) => {
            if (saved) restoreSelection(saved);
            applyBackgroundColor(color);
            textarea.value = content.innerHTML;
            saveHistoryStep();
            updateStats();
          });
        });
      }

      content.addEventListener('input', () => {
        textarea.value = content.innerHTML;
        updateStats();
      });

      // Paste: strip styles and insert plain text
      content.addEventListener('paste', (ev) => pastePlain(ev));

      content.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          closeBtn.click();
        }
      });

      updateStats();
    });
  }

  async _submitForm(event, { render = true } = {}) {
    if (!this.form) return;
    // Preserve scroll position across form-submitted updates
    this._saveScrollPosition();
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));
    console.log('Wayfinder: _submitForm preparing update, keys:', Object.keys(updates), 'heightenedPresent:', !!updates.system?.heightened);

    // Normalize expanded form input where array-like fields become objects with numeric keys
    try {
      if (updates.system && updates.system.heightened && !Array.isArray(updates.system.heightened) && typeof updates.system.heightened === 'object') {
        console.log('Wayfinder: _submitForm detected object-shaped heightened, converting to array', updates.system.heightened);
        const obj = updates.system.heightened;
        const numericKeys = Object.keys(obj).filter(k => String(parseInt(k)) === k).map(k => parseInt(k)).sort((a,b) => a-b);
        if (numericKeys.length > 0) {
          const arr = numericKeys.map(k => obj[String(k)]);
          updates.system.heightened = arr;
          console.log('Wayfinder: _submitForm converted heightened to array, new length', arr.length);
        }
      }
    } catch (err) {
      console.warn('Wayfinder: error normalizing heightened in _submitForm', err);
    }

    await this.document.update(updates, { render });
  }

  /**
   * Handle dropping trait items onto the effect to link them
   * Only allow 1 trait per effect
   */
  async _onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    if (data.type !== 'Item') return;

    const item = await fromUuid(data.uuid);
    if (!item || item.type !== 'trait') return;

    const current = Array.isArray(this.document.system?.traits) ? [...this.document.system.traits] : [];

    // Prevent duplicate traits (allow multiple different traits)
    if (current.includes(item.uuid)) {
      ui.notifications?.warn(`${item.name} já está vinculado a este efeito.`);
      return;
    }

    current.push(item.uuid);

    await this.document.update({ 'system.traits': current });
    ui.notifications?.info(`${item.name} adicionado ao efeito.`);
  }

  async _onRemoveEffect(event) {
    // Helper: re-render any open Wayfinder sheets or sheet apps so UI reflects persistent changes
    const rerenderOpenWayfinderSheets = () => {
      try {
        if (typeof ui === 'undefined' || !ui.windows) return;
        for (const win of Object.values(ui.windows)) {
          try {
            if (!win || typeof win.render !== 'function') continue;
            const opts = win.options || {};
            const classes = opts.classes || [];
            if (Array.isArray(classes) && classes.includes('wayfinder')) {
              try { win.render(true); } catch (e) {}
              continue;
            }
            const name = (win.constructor && win.constructor.name) ? win.constructor.name.toLowerCase() : '';
            if (name.includes('sheet')) {
              try { win.render(true); } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {
        console.debug('Wayfinder: rerenderOpenWayfinderSheets failed', e);
      }
    };

    const btn = event.target.closest('.remove-effect-btn');
    if (!btn) return;
    const uuid = btn.dataset.uuid;

    // First attempt: resolve the UUID to a document and try to delete the referenced ActiveEffect or related AE
    if (uuid && typeof fromUuid === 'function') {
      try {
        const doc = await fromUuid(uuid).catch(() => null);
        // resolved document from UUID
        if (doc) {
          // If it's an ActiveEffect document instance, delete it directly
          try {
              if (doc.documentName === 'ActiveEffect' || (doc.type && doc.type === 'activeeffect')) {
                await doc.delete();
                ui.notifications?.info('Efeito removido. (ActiveEffect document deleted)');
                try { this.render(true); } catch (e) {}
                try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                return;
              }
          } catch (e) {
            console.debug('Wayfinder | could not delete resolved ActiveEffect directly', e);
          }

          // If it's an Item embedded in an Actor/Token, try to remove ActiveEffects on that actor that reference the item
          try {
            if (doc.documentName === 'Item' || doc.type === 'item') {
              // If this Item is embedded on an Actor (Actor.<id>.Item.<id>), prefer deleting
              // the embedded Item first so that any item-delete hooks run and remove
              // related ActiveEffects. This avoids deleting only the AE while leaving
              // the Item visible in the actor's inventory.
              try {
                const parentActor = doc.parent || null;
                if (parentActor && (parentActor.documentName === 'Actor' || parentActor.type === 'actor')) {
                  if (typeof parentActor.deleteEmbeddedDocuments === 'function') {
                    await parentActor.deleteEmbeddedDocuments('Item', [doc.id]);
                  } else if (typeof doc.delete === 'function') {
                    await doc.delete();
                  }
                  ui.notifications?.info('Efeito removido. (Item embutido removido do ator)');
                  try { this.render(true); } catch (e) {}
                  try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                  return;
                }
              } catch (err) {
                console.debug('Wayfinder | early embedded Item delete failed', err);
              }

              // Continue with token/item flag removal if not an embedded actor item


            }
            if (doc.documentName === 'Item' || doc.type === 'item') {
              // If this Item is embedded on a Scene Token (uuid like Scene.<sid>.Token.<tid>.Actor.<aid>.Item.<iid>),
              // attempt to remove the embedded effect from the token's actorData flags.
              try {
                if (typeof uuid === 'string' && uuid.startsWith('Scene.')) {
                  const parts = uuid.split('.');
                  const tokenIdx = parts.indexOf('Token');
                  const sceneId = parts[1];
                  const tokenId = tokenIdx !== -1 ? parts[tokenIdx + 1] : null;
                  if (sceneId && tokenId && typeof game !== 'undefined' && game.scenes) {
                    try {
                      const scene = game.scenes.get(sceneId);
                      const tokenDoc = scene?.tokens?.get?.(tokenId) || (scene?.tokens || new Map())[tokenId];
                      if (tokenDoc) {
                        const actorFlags = tokenDoc.actorData?.flags || (tokenDoc?.actor?.flags) || {};
                        const embedded = Array.isArray(actorFlags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(actorFlags.wayfinder.embeddedEffects) : null;
                        if (Array.isArray(embedded)) {
                          const i = embedded.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid || e.itemId === doc.id || e.name === btn.closest('.effect-item')?.querySelector('.effect-collapsible-title')?.textContent?.trim()));
                          if (i !== -1) {
                            embedded.splice(i, 1);
                            // Persist via scene token update
                            try {
                              await scene.updateEmbeddedDocuments('Token', [{ _id: tokenId, actorData: { flags: { wayfinder: { embeddedEffects: embedded } } } }]);
                              // persisted token embeddedEffects
                              ui.notifications?.info('Efeito removido. (removed from token actor embeddedEffects)');
                              try { this.render(true); } catch (e) {}
                              try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                              return;
                            } catch (e) {
                              console.debug('Wayfinder | failed to persist removal on token actorData', e);
                            }
                          }
                        }
                      }
                    } catch (e) {
                      console.debug('Wayfinder | error handling Scene.Token item removal', e);
                    }
                  }
                }
                } catch (e) { console.debug('Wayfinder | scene token removal check failed', e); }
                // If the resolved Item is embedded on an Actor (Actor.<id>.Item.<id>), prefer deleting
                // the embedded Item from its parent Actor to remove it from the actor's inventory.
                try {
                  const parent = doc.parent || null;
                  if (parent && (parent.documentName === 'Actor' || parent.type === 'actor')) {
                    try {
                      if (typeof parent.deleteEmbeddedDocuments === 'function') {
                        await parent.deleteEmbeddedDocuments('Item', [doc.id]);
                      } else if (typeof doc.delete === 'function') {
                        await doc.delete();
                      }
                      ui.notifications?.info('Efeito removido. (Item embutido removido do ator)');
                      try { this.render(true); } catch (e) {}
                      try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                      return;
                    } catch (err) {
                      console.debug('Wayfinder | failed to delete embedded Item on Actor', err);
                    }
                  }
                } catch (err) {
                  console.debug('Wayfinder | parent Actor deletion check failed', err);
                }
              // If the item itself has embedded effects stored in flags, try to remove matching entry
              try {
                const embedded = Array.isArray(doc.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(doc.flags.wayfinder.embeddedEffects) : null;
                const title = btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim();
                if (embedded) {
                  // Try match by effect uuid first, then by name/title
                  let removed = false;
                  let i = embedded.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid));
                  if (i === -1 && title) i = embedded.findIndex(e => (e.name === title));
                  if (i !== -1) {
                    embedded.splice(i, 1);
                    removed = true;
                  }
                  if (removed) {
                    // Persist change on pack or document
                    try {
                      const pack = doc.pack || (doc._pack ? game.packs.get(doc._pack) : null);
                      if (pack && typeof pack.updateDocuments === 'function') {
                        await pack.updateDocuments([{ _id: doc.id, ['flags.wayfinder.embeddedEffects']: embedded }]);
                        // persisted pack update
                      } else {
                        await doc.update({ ['flags.wayfinder.embeddedEffects']: embedded });
                        // persisted doc.update for Item.flags.wayfinder.embeddedEffects
                      }
                      ui.notifications?.info('Efeito removido. (removed from Item.flags.wayfinder.embeddedEffects)');
                      try { this.render(true); } catch (e) {}
                      // Try re-render related sheets and any other open sheets
                      try { doc.sheet?.render?.(true); } catch (e) {}
                      try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                      return;
                    } catch (e) {
                      console.debug('Wayfinder | failed to persist embedded effect removal on Item', e);
                    }
                  }
                }

                // If not removed via embedded flags, try to find actor ActiveEffects referencing this Item
                let ownerActor = null;
                try { ownerActor = doc.actor || doc.parent?.actor || doc.parent || null; } catch(e) { ownerActor = null; }
                if (ownerActor && ownerActor.effects) {
                  const found = ownerActor.effects.find(e => (e?.flags?.wayfinder?.sourceItemId === doc.id) || (e?.flags?.core?.sourceId === `Item.${doc.id}`) || (e?.source === `Item.${doc.id}`));
                  if (found) {
                    await found.delete();
                    // deleted actor AE referencing Item
                    ui.notifications?.info('Efeito removido. (deleted AE referencing Item on owner actor)');
                    try { this.render(true); } catch (e) {}
                    try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                    return;
                  }
                }
              } catch (e) {
                console.debug('Wayfinder | error deleting AE or embeddedEffects on resolved Item', e);
              }
            }
          } catch (e) {
            console.debug('Wayfinder | error deleting AE referencing resolved Item', e);
          }
        }
      } catch (e) {
        console.debug('Wayfinder | fromUuid resolution failed for remove', e, uuid);
      }
    }

    // Fallback: remove from flags.wayfinder.embeddedEffects if present
    const existing = Array.isArray(this.document.flags?.wayfinder?.embeddedEffects)
      ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects)
      : [];

    let idx = -1;
    if (uuid) {
      idx = existing.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid));
    }
    if (idx === -1) {
      // Fallback: try to read index stored on the DOM element (more robust)
      const el = btn.closest('.effect-item');
      const di = el?.dataset?.effectIndex;
      if (di !== undefined && di !== null && di !== '') {
        const parsed = Number(di);
        if (!Number.isNaN(parsed)) idx = parsed;
      }
    }
    if (idx === -1) {
      // Fallback: try to match by data-item-id on the wrapper
      const el = btn.closest('.effect-item');
      const itemId = el?.dataset?.itemId;
      if (itemId) {
        idx = existing.findIndex(e => (e.uuid === itemId || e._id === itemId || e.id === itemId));
      }
    }
    if (idx === -1) {
      // Fallback: try to match by visible title text from the DOM
      const title = btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim();
      if (title) idx = existing.findIndex(e => (e.name === title));
    }

    if (idx === -1) {
      // not found in flags, attempting brute-force search

      // Quick targeted sweep: if the DOM element contains identifiers (data-item-id, data-real-id),
      // attempt to remove matching entries from any Actor's flags.wayfinder.embeddedEffects
      // before doing the heavier brute-force search across actors/scenes. This mirrors the
      // successful manual `parent.deleteEmbeddedDocuments` flow users ran in the console.
      try {
        const el = btn.closest('.effect-item');
        const itemId = el?.dataset?.itemId || null;
        const realId = el?.dataset?.realId || null;
        const matchIds = [uuid, itemId, realId].filter(Boolean);
        if (matchIds.length && typeof game !== 'undefined' && game.actors && game.actors.size) {
          for (const actor of game.actors.values()) {
            try {
              const actorEmbedded = Array.isArray(actor.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(actor.flags.wayfinder.embeddedEffects) : null;
              if (!Array.isArray(actorEmbedded)) continue;
              const i = actorEmbedded.findIndex(e => matchIds.some(mid => (e.uuid === mid || e._id === mid || e.id === mid || e.itemId === mid || e.name === mid)));
              if (i !== -1) {
                actorEmbedded.splice(i, 1);
                try { await actor.update({ ['flags.wayfinder.embeddedEffects']: actorEmbedded }); } catch (e) { console.debug('Wayfinder | actor.update embed remove failed', e); }
                ui.notifications?.info('Efeito removido. (removed from actor.flags.wayfinder.embeddedEffects)');
                try { this.render(true); } catch (e) {}
                try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                return;
              }
            } catch (e) {
              console.debug('Wayfinder | error during targeted actor flags sweep', e);
            }
          }
        }
      } catch (e) {
        console.debug('Wayfinder | targeted actor flags sweep failed', e);
      }
      // Brute-force: search actors' ActiveEffects and flags for a match
      try {
        if (typeof game !== 'undefined' && game.actors && game.actors.size) {
          for (const actor of game.actors.values()) {
            try {
              const ae = actor.effects.find(e => (e.id === uuid || e._id === uuid || e.uuid === uuid || e.origin === uuid || (e.flags && JSON.stringify(e.flags).includes(uuid))));
              if (ae) {
                  await ae.delete();
                  ui.notifications?.info('Efeito removido. (deleted AE on actor)');
                try { this.render(true); } catch (e) {}
                try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                return;
              }
              // Check actor-level embeddedEffects flag
              const actorEmbedded = Array.isArray(actor.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(actor.flags.wayfinder.embeddedEffects) : null;
              if (actorEmbedded) {
                const i = actorEmbedded.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid || (e.name && e.name === uuid)));
                if (i !== -1) {
                  actorEmbedded.splice(i, 1);
                  try { await actor.update({ ['flags.wayfinder.embeddedEffects']: actorEmbedded }); } catch (e) { console.debug('Wayfinder | actor.update embed remove failed', e); }
                  ui.notifications?.info('Efeito removido. (removed from actor.flags.wayfinder.embeddedEffects)');
                  try { this.render(true); } catch (e) {}
                  try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                  return;
                }
              }
            } catch (e) {
              console.debug('Wayfinder | error searching actor during brute-force remove', e);
            }
          }
        }
      } catch (e) {
        console.debug('Wayfinder | brute-force actor search failed', e);
      }

      // Search scenes and token actors
      try {
        if (typeof game !== 'undefined' && game.scenes && game.scenes.size) {
          for (const scene of game.scenes.values()) {
            try {
              const tokens = scene.tokens || [];
              for (const tokenDoc of tokens) {
                try {
                  // Prefer token-level persisted embeddedEffects stored on token.actorData.flags.wayfinder.embeddedEffects
                  try {
                    const tokenFlags = tokenDoc?.actorData?.flags || tokenDoc?.actor?.flags || {};
                    const tokenEmbedded = Array.isArray(tokenFlags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(tokenFlags.wayfinder.embeddedEffects) : null;
                    if (Array.isArray(tokenEmbedded)) {
                      const i = tokenEmbedded.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid || e.itemId === (btn.closest('.effect-item')?.dataset?.itemId) || e.name === btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim()));
                      if (i !== -1) {
                        tokenEmbedded.splice(i, 1);
                        try {
                          await scene.updateEmbeddedDocuments('Token', [{ _id: tokenDoc._id || tokenDoc.id, actorData: { flags: { wayfinder: { embeddedEffects: tokenEmbedded } } } }]);
                          // persisted token embeddedEffects (brute-force)
                          ui.notifications?.info('Efeito removido. (removed from token actor embeddedEffects)');
                          try { this.render(true); } catch (e) {}
                          try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                          return;
                        } catch (err) {
                          console.debug('Wayfinder | failed to persist token actorData embeddedEffects removal', err);
                        }
                      }
                    }
                  } catch (err) {
                    console.debug('Wayfinder | token embeddedEffects check failed', err);
                  }

                  // Check for raw actorData.effects on the token (unlinked token-specific effects)
                  try {
                    const tokenDataEffects = Array.isArray(tokenDoc?.actorData?.effects) ? foundry.utils.deepClone(tokenDoc.actorData.effects) : null;
                    if (Array.isArray(tokenDataEffects)) {
                      const j = tokenDataEffects.findIndex(e => (e.uuid === uuid || e._id === uuid || e.id === uuid || e.origin === uuid || e.label === btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim()));
                      if (j !== -1) {
                        tokenDataEffects.splice(j, 1);
                        try {
                          await scene.updateEmbeddedDocuments('Token', [{ _id: tokenDoc._id || tokenDoc.id, actorData: { effects: tokenDataEffects } }]);
                          // persisted token actorData.effects
                          ui.notifications?.info('Efeito removido. (removed from token actorData.effects)');
                          try { this.render(true); } catch (e) {}
                          try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                          return;
                        } catch (err) {
                          console.debug('Wayfinder | failed to persist token actorData.effects removal', err);
                        }
                      }
                    }
                  } catch (err) {
                    console.debug('Wayfinder | token actorData.effects check failed', err);
                  }

                  // Finally, check the token's linked actor's ActiveEffect documents as a last resort
                  try {
                    const tokenActor = tokenDoc.actor || null;
                    if (tokenActor && tokenActor.effects) {
                      const ae = tokenActor.effects.find(e => (e.id === uuid || e._id === uuid || e.uuid === uuid || e.origin === uuid || (e.flags && JSON.stringify(e.flags).includes(uuid))));
                      if (ae) {
                        await ae.delete();
                        ui.notifications?.info('Efeito removido. (deleted AE on token actor)');
                        try { this.render(true); } catch (e) {}
                        try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
                        return;
                      }
                    }
                  } catch (e) { /* ignore per-token errors */ }
                } catch (e) { /* ignore per-token errors */ }
              }
            } catch (e) { /* ignore per-scene errors */ }
          }
        }
      } catch (e) {
        console.debug('Wayfinder | brute-force scene/token search failed', e);
      }

      ui.notifications?.warn('Efeito não encontrado para remoção.');
      return;
    }

    existing.splice(idx, 1);

    // Try to persist: prefer pack update, then document.update
    try {
      const pack = this.document.pack || (this.document._pack ? game.packs.get(this.document._pack) : null);
      if (pack && typeof pack.updateDocuments === 'function') {
        try {
          await pack.updateDocuments([{ _id: this.document.id, ['flags.wayfinder.embeddedEffects']: existing }]);
          this.document.flags = this.document.flags || {};
          this.document.flags.wayfinder = this.document.flags.wayfinder || {};
          this.document.flags.wayfinder.embeddedEffects = existing;
          try { this.render(true); } catch (e) {}
          try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
          ui.notifications.info('Efeito removido e salvo no compêndio.');
          return;
        } catch (err) {
          console.debug('Wayfinder | pack.updateDocuments failed on remove, falling back', err);
        }
      }
    } catch (err) {
      console.debug('Wayfinder | error locating pack for removal', err);
    }

    if (typeof this.document.update === 'function') {
      try {
        await this.document.update({ ['flags.wayfinder.embeddedEffects']: existing });
          try { this.render(true); } catch (e) {}
          try { if (typeof rerenderOpenWayfinderSheets === 'function') rerenderOpenWayfinderSheets(); } catch (e) {}
          ui.notifications.info('Efeito removido.');
        return;
      } catch (err) {
        console.debug('Wayfinder | document.update failed on remove', err);
      }
    }

    ui.notifications.warn('Não foi possível remover o efeito persistentemente; verifique permissões.');
  }
}

/**
 * Passive Effect Sheet - extends from Active but with different template
 */
export class WayfinderPassiveEffectSheet extends WayfinderActiveEffectSheet {
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "item"],
    position: {
      width: 600,
      height: 700
    },
    window: {
      colorScheme: "light",
      resizable: true
    },
    actions: {
      onEditImage: WayfinderPassiveEffectSheet._onEditImage
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/wayfinder/templates/item/item-passive-effect-sheet.hbs"
    }
  };
}
