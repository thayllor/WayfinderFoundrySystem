/**
 * Item Sheet classes for Active and Passive Effects
 */
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

  get title() {
    return this.document?.name || "Effect";
  }

  async _prepareContext(options) {
    const traitUuids = Array.isArray(this.document.system?.traits) ? this.document.system.traits : [];

    const traitsResolved = [];

    for (const uuid of traitUuids) {
      try {
        const doc = await fromUuid(uuid);
        if (doc && doc.type === 'trait') {
          traitsResolved.push({
            uuid,
            id: doc.id,
            name: doc.name,
            color: doc.system?.color || '#666666'
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

      const textColorBtn = group.querySelector('.editor-text-color-btn');
      const bgColorBtn = group.querySelector('.editor-bg-color-btn');

      if (textColorBtn) {
        textColorBtn.addEventListener('click', (ev) => {
          ev.preventDefault();

          const input = document.createElement('input');
          input.type = 'color';
          input.style.position = 'absolute';
          input.style.opacity = '0';
          input.style.width = '1px';
          input.style.height = '1px';
          input.style.pointerEvents = 'none';

          input.addEventListener('input', (e) => {
            const color = e.target.value;
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
              const range = selection.getRangeAt(0);
              const span = document.createElement('span');
              span.style.color = color;
              try {
                range.surroundContents(span);
              } catch (err) {
                const fragment = range.extractContents();
                span.appendChild(fragment);
                range.insertNode(span);
              }
            }
            textarea.value = content.innerHTML;
            saveHistoryStep();
            updateStats();
          });

          input.addEventListener('blur', () => {
            setTimeout(() => input.remove(), 100);
          });

          document.body.appendChild(input);
          input.click();
        });
      }

      if (bgColorBtn) {
        bgColorBtn.addEventListener('click', (ev) => {
          ev.preventDefault();

          const input = document.createElement('input');
          input.type = 'color';
          input.style.position = 'absolute';
          input.style.opacity = '0';
          input.style.width = '1px';
          input.style.height = '1px';
          input.style.pointerEvents = 'none';

          input.addEventListener('input', (e) => {
            const color = e.target.value;
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
              const range = selection.getRangeAt(0);
              const span = document.createElement('span');
              span.style.backgroundColor = color;
              try {
                range.surroundContents(span);
              } catch (err) {
                const fragment = range.extractContents();
                span.appendChild(fragment);
                range.insertNode(span);
              }
            }
            textarea.value = content.innerHTML;
            saveHistoryStep();
            updateStats();
          });

          input.addEventListener('blur', () => {
            setTimeout(() => input.remove(), 100);
          });

          document.body.appendChild(input);
          input.click();
        });
      }

      content.addEventListener('input', () => {
        textarea.value = content.innerHTML;
        updateStats();
      });

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
