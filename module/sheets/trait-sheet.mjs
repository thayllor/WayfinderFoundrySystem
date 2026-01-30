const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class WayfinderTraitSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "item"],
    position: { width: 520, height: 480 },
    window: { colorScheme: "light", resizable: true }
  };

  static PARTS = {
    sheet: { template: "systems/wayfinder/templates/item/item-trait-sheet.hbs" }
  };

  get title() {
    const typeName = game.i18n.localize(`TYPES.Item.${this.document.type}`) || this.document.type;
    return `${typeName}: ${this.document.name}`;
  }

  get form() { return this.element?.querySelector('form'); }

  async _prepareContext(options) {
    return {
      item: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      rollData: this.document.getRollData(),
      owner: this.document.isOwner,
      editable: this.isEditable
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    if (!this.isEditable) return;

    // Auto-save on form changes
    html.addEventListener('change', (ev) => {
      this._submitForm(ev);
    });

    // Setup inline editor
    this._setupInlineEditor(html);
  }

  /**
   * Setup the inline trait description editor
   * @private
   */
  _setupInlineEditor(html) {
    const toggleBtn = html.querySelector('.trait-editor-toggle-btn');
    const toolbar = html.querySelector('.trait-editor-toolbar');
    const content = html.querySelector('.trait-editor-content');
    const preview = html.querySelector('.trait-editor-preview');
    const closeBtn = html.querySelector('.editor-close-btn');
    const textarea = html.querySelector('textarea[name="system.description"]');
    const previewToggle = html.querySelector('.editor-preview-toggle');
    const undoStack = [];
    const redoStack = [];
    let historyStep = 0;

    if (!toggleBtn || !toolbar || !content || !closeBtn || !textarea) return;

    // Save initial state
    const saveHistoryStep = () => {
      undoStack.push(content.innerHTML);
      redoStack.length = 0;
    };

    // Undo/Redo functionality
    const undoBtn = html.querySelector('[data-format="undo"]');
    const redoBtn = html.querySelector('[data-format="redo"]');

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

    // Update word and character count
    const updateStats = () => {
      const text = content.innerText || '';
      const words = text.trim().split(/\s+/).filter(w => w).length;
      const chars = text.length;
      const wordCount = html.querySelector('.editor-word-count');
      const charCount = html.querySelector('.editor-char-count');
      if (wordCount) wordCount.textContent = `Palavras: ${words}`;
      if (charCount) charCount.textContent = `Caracteres: ${chars}`;
    };

    // Toggle between edit and preview
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

    // Toggle edit mode on/off
    toggleBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const isEditing = content.getAttribute('data-text-editable') === 'true';

      if (!isEditing) {
        // Enter edit mode
        saveHistoryStep();
        content.setAttribute('contenteditable', 'true');
        content.setAttribute('data-text-editable', 'true');
        content.focus();
        toolbar.style.display = 'flex';
        toggleBtn.style.display = 'none';
      }
    });

    // Close editor
    closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      // Save and exit edit mode
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

    // Format buttons
    html.querySelectorAll('.editor-fmt-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const format = btn.dataset.format;
        const value = btn.dataset.value || undefined;

        content.focus();

        // Handle special commands
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

        // Update textarea and save history
        textarea.value = content.innerHTML;
        saveHistoryStep();
        updateStats();
      });
    });

    // Color picker buttons with inline pickers
    const textColorBtn = html.querySelector('.editor-text-color-btn');
    const bgColorBtn = html.querySelector('.editor-bg-color-btn');

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
          // Apply color to selection using span
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.color = color;
            try {
              range.surroundContents(span);
            } catch (err) {
              // If surroundContents fails, extract and wrap
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
          // Apply background color to selection using span
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.backgroundColor = color;
            try {
              range.surroundContents(span);
            } catch (err) {
              // If surroundContents fails, extract and wrap
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

    // Auto-update textarea on content change and update stats
    content.addEventListener('input', (ev) => {
      textarea.value = content.innerHTML;
      updateStats();
    });

    // Handle escape key to close editor
    content.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closeBtn.click();
      }
    });

    // Initialize stats
    updateStats();
  }

  /**
   * Submit form changes
   * @private
   */
  async _submitForm(event, { render = true } = {}) {
    if (!this.form) return;
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));
    await this.document.update(updates, { render });
  }

  /**
   * Open a color picker dialog
   * @private
   */
  async _openColorDialog(title, callback) {
    const DialogClass = (typeof ApplicationV2 !== 'undefined' && ApplicationV2?.Dialog) ? ApplicationV2.Dialog : Dialog;
    // Render icon + color-picker partials and then create dialog to avoid inline HTML in JS
    let iconCheck = 'fas fa-check';
    let iconTimes = 'fas fa-times';

    const makeDialog = (colorHtml) => {
      const dialog = new DialogClass({
        title: title,
        content: colorHtml,
        buttons: {
          apply: {
            icon: iconCheck,
            label: 'Aplicar',
            callback: (html) => {
              const dom = (html && html[0]) ? html[0] : html;
              const input = dom.querySelector('#color-input');
              if (input && callback) {
                callback(input.value);
              }
            }
          },
          cancel: {
            icon: iconTimes,
            label: 'Cancelar'
          }
        },
        default: 'apply'
      });
      dialog.render(true);
    };

    try {
      const [checkHtml, timesHtml, colorHtml] = await Promise.all([
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-check' }),
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-times' }),
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/color-picker-dialog.hbs', { value: '#000000' })
      ]);
      iconCheck = checkHtml;
      iconTimes = timesHtml;
      makeDialog(colorHtml);
    } catch (ie) {
      console.warn('Wayfinder | failed to render icon/color partials in color dialog', ie);
      // keep class fallbacks wrapped as <i>
      if (typeof iconCheck === 'string' && !iconCheck.includes('<')) iconCheck = `<i class="${iconCheck}"></i>`;
      if (typeof iconTimes === 'string' && !iconTimes.includes('<')) iconTimes = `<i class="${iconTimes}"></i>`;

      // Build fallback HTML programmatically to avoid large inline string literals
      try {
        const wrapper = document.createElement('div');
        wrapper.className = 'color-picker-dialog';
        const input = document.createElement('input');
        input.type = 'color';
        input.id = 'color-input';
        input.value = '#000000';
        input.style.width = '100%';
        input.style.height = '200px';
        input.style.cursor = 'pointer';
        wrapper.appendChild(input);
        makeDialog(wrapper.outerHTML);
      } catch (e) {
        console.warn('Wayfinder | failed to construct fallback color dialog DOM', e);
        // Fallback to empty dialog content if DOM creation is unavailable
        makeDialog('');
      }
    }
  }
}
