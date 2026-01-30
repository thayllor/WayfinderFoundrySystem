/**
 * Talent Sheet - for displaying talents with effects and traits
 */
export class WayfinderTalentSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "item"],
    position: { width: 700, height: 800 },
    window: { colorScheme: "light", resizable: true }
  };

  static PARTS = {
    sheet: { template: "systems/wayfinder/templates/item/item-talent-sheet.hbs" }
  };

  get title() {
    return this.document?.name || "Talent";
  }

  get form() {
    return this.element?.querySelector('form');
  }

  async _prepareContext(options) {
    // Resolve trait UUIDs to get trait data
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
        // If hex without leading #, add it
        if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c}`;
        // If short hex like 'fff', expand
        if (/^[0-9A-Fa-f]{3}$/.test(c)) return `#${c}`;
        // Otherwise return as-is (lets CSS handle rgb(), named colors, etc.)
        return c || '#666666';
      } catch (e) {
        return '#666666';
      }
    };

    for (const uuid of traitUuids) {
      try {
        const doc = await fromUuid(uuid);
        if (doc && doc.type === 'trait') {
          traitsResolved.push({
            uuid,
            id: doc.id,
            name: doc.name,
            color: normalizeColor(doc.system?.color)
          });
        }
      } catch (err) {
        console.warn('Erro ao resolver trait para talent:', uuid, err);
      }
    }

    // Resolve effect UUIDs to get effect data
    const effectUuids = Array.isArray(this.document.system?.effects) ? this.document.system.effects : [];
    const activeEffects = [];
    const passiveEffects = [];

    for (const entry of effectUuids) {
      try {
        // If entry is a string, treat as UUID and resolve
        if (typeof entry === 'string') {
          const doc = await fromUuid(entry);
          if (!doc) continue;

          const traitUuidsEffect = Array.isArray(doc.system?.traits) ? doc.system.traits : [];
          const traitsResolvedEffect = [];
          for (const tuuid of traitUuidsEffect) {
            try {
              const tdoc = await fromUuid(tuuid);
                if (tdoc && tdoc.type === 'trait') {
                traitsResolvedEffect.push({ uuid: tuuid, id: tdoc.id, name: tdoc.name, color: normalizeColor(tdoc.system?.color) });
              }
            } catch (err) {
              console.warn('Erro ao resolver trait de efeito:', tuuid, err);
            }
          }

          const effectData = {
            uuid: entry,
            id: doc.id,
            name: doc.name,
            type: doc.type,
            description: doc.system?.description || '',
            effect: doc.system?.effect || '',
            range: doc.system?.range || '',
            target: doc.system?.target || '',
            duration: doc.system?.duration || '',
            focusCost: doc.system?.focusCost || 0,
            actionCost: doc.system?.actionCost ?? doc.system?.actions ?? '',
            isMagic: doc.system?.isMagic || false,
            magicCircle: doc.system?.magicCircle || '',
            isPermanent: doc.system?.isPermanent || false,
            isActive: doc.system?.isActive !== false,
            traitsResolved: traitsResolvedEffect,
            heightened: Array.isArray(doc.system?.heightened)
              ? doc.system.heightened
              : (doc.system?.heightened && typeof doc.system.heightened === 'object'
                  ? Object.values(doc.system.heightened)
                  : [])
          };

          if (doc.type === 'active-effect') activeEffects.push(effectData);
          else passiveEffects.push(effectData);

        } else if (entry && typeof entry === 'object') {
          // Inline effect object on the talent
          const systemData = entry.system || {};
          const traitUuidsEffect = Array.isArray(systemData?.traits) ? systemData.traits : [];
          const traitsResolvedEffect = [];
          for (const tuuid of traitUuidsEffect) {
            try {
              const tdoc = await fromUuid(tuuid);
                if (tdoc && tdoc.type === 'trait') {
                traitsResolvedEffect.push({ uuid: tuuid, id: tdoc.id, name: tdoc.name, color: normalizeColor(tdoc.system?.color) });
              } else {
                traitsResolvedEffect.push({ uuid: tuuid, name: String(tuuid), color: '#666666' });
              }
            } catch (err) {
              traitsResolvedEffect.push({ uuid: tuuid, name: String(tuuid), color: '#666666' });
            }
          }

          const effectData = {
            uuid: entry.uuid || entry._id || null,
            id: entry.id || entry._id || null,
            name: entry.name || entry.label || 'Effect',
            type: entry.type || systemData.type || 'active-effect',
            description: entry.description ?? systemData.description ?? '',
            effect: entry.effect ?? systemData.effect ?? '',
            range: entry.range ?? systemData.range ?? '',
            target: entry.target ?? systemData.target ?? '',
            duration: entry.duration ?? systemData.duration ?? '',
            focusCost: entry.focusCost ?? systemData.focusCost ?? 0,
            actionCost: entry.actionCost ?? systemData.actionCost ?? systemData.actions ?? '',
            isMagic: entry.isMagic ?? systemData.isMagic ?? false,
            magicCircle: entry.magicCircle ?? systemData.magicCircle ?? '',
            isPermanent: entry.isPermanent ?? systemData.isPermanent ?? false,
            isActive: entry.isActive ?? true,
            traitsResolved: traitsResolvedEffect,
            heightened: Array.isArray(systemData?.heightened) ? systemData.heightened : (systemData?.heightened && typeof systemData.heightened === 'object' ? Object.values(systemData.heightened) : [])
          };

          if (effectData.type === 'active-effect') activeEffects.push(effectData);
          else passiveEffects.push(effectData);
        }
      } catch (err) {
        console.warn('Erro ao resolver efeito para talent:', entry, err);
      }
    }

    return {
      item: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      editable: this.isEditable,
      cssClasses: this.constructor.DEFAULT_OPTIONS.classes.join(" "),
      traitsResolved,
      activeEffects,
      passiveEffects
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    if (!html) return;

    if (this.isEditable) {
      html.addEventListener('change', (ev) => {
        this._submitForm(ev);
      });

      // Event delegation for remove buttons (effects and traits)
      html.addEventListener('click', (ev) => {
        const removeEffectBtn = ev.target.closest('.remove-effect-btn');
        if (removeEffectBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          return this._onRemoveEffect(ev);
        }
        const removeTraitBtn = ev.target.closest('.trait-chip-remove');
        if (removeTraitBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          return this._onRemoveTrait(ev);
        }
      });

      // Setup rich text editor save for description
      this._setupRichTextEditor(html);
    }

    html.addEventListener('dragover', (ev) => ev.preventDefault());
    html.addEventListener('drop', (ev) => this._onDrop(ev));

    // Setup collapsible effects
    this._setupCollapsibleEffects(html);
  }

  /**
   * Setup rich text editor save behavior
   */
  _setupRichTextEditor(html) {
    // Setup editor groups (description etc)
    const groups = html.querySelectorAll('.trait-description-group');
    groups.forEach(group => {
      const toggleBtn = group.querySelector('.trait-editor-toggle-btn');
      const content = group.querySelector('.trait-editor-content');
      const toolbar = group.querySelector('.trait-editor-toolbar');
      const textarea = group.querySelector('textarea[name]');
      const closeBtn = group.querySelector('.editor-close-btn');
      const preview = group.querySelector('.trait-editor-preview');
      const previewBtn = group.querySelector('.editor-preview-btn');

      if (!toggleBtn || !content || !textarea) return;

      // Pre-render icons used by the editor controls (non-blocking)
      let iconTimes = 'fas fa-times';
      let iconEdit = 'fas fa-edit';
      let iconEye = 'fas fa-eye';
      let iconEyeSlash = 'fas fa-eye-slash';
      Promise.all([
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-times' }),
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-edit' }),
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-eye' }),
        foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-eye-slash' })
      ]).then(([t, e, eye, eyeslash]) => {
        iconTimes = t; iconEdit = e; iconEye = eye; iconEyeSlash = eyeslash;
      }).catch((ie) => {
        console.warn('Wayfinder | failed to render editor icon partials', ie);
      });

      // Wrap fallback class names into <i> tags so buttons get HTML immediately
      if (typeof iconTimes === 'string' && !iconTimes.includes('<')) iconTimes = `<i class="${iconTimes}"></i>`;
      if (typeof iconEdit === 'string' && !iconEdit.includes('<')) iconEdit = `<i class="${iconEdit}"></i>`;
      if (typeof iconEye === 'string' && !iconEye.includes('<')) iconEye = `<i class="${iconEye}"></i>`;
      if (typeof iconEyeSlash === 'string' && !iconEyeSlash.includes('<')) iconEyeSlash = `<i class="${iconEyeSlash}"></i>`;

      let isPreview = false;

      // Toggle editor mode
      toggleBtn?.addEventListener('click', () => {
        const isEditing = content.getAttribute('contenteditable') === 'true';
        content.setAttribute('contenteditable', !isEditing);
        content.setAttribute('data-text-editable', !isEditing);
        toolbar.style.display = !isEditing ? 'flex' : 'none';
        toggleBtn.innerHTML = !isEditing
          ? `${iconTimes} Cancelar`
          : `${iconEdit} Editar`;

        if (!isEditing) {
          content.focus();
        }
      });

      // Close editor
      closeBtn?.addEventListener('click', () => {
        content.setAttribute('contenteditable', 'false');
        content.setAttribute('data-text-editable', 'false');
        toolbar.style.display = 'none';
        toggleBtn.innerHTML = `${iconEdit} Editar`;
        textarea.value = content.innerHTML;
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Toggle preview
      previewBtn?.addEventListener('click', () => {
        isPreview = !isPreview;
        if (isPreview) {
          preview.innerHTML = content.innerHTML;
          preview.style.display = 'block';
          content.style.display = 'none';
          previewBtn.innerHTML = `${iconEyeSlash} Editar`;
        } else {
          preview.style.display = 'none';
          content.style.display = 'block';
          previewBtn.innerHTML = `${iconEye} Preview`;
        }
      });

      // Format buttons
      const formatBtns = toolbar?.querySelectorAll('.editor-fmt-btn') || [];
      formatBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const format = btn.dataset.format;
          const value = btn.dataset.value;

          if (format === 'createLink' || btn.classList.contains('editor-link-btn')) {
            const url = prompt('URL do link:');
            if (url) document.execCommand('createLink', false, url);
          } else if (format === 'insertImage' || btn.classList.contains('editor-image-btn')) {
            const url = prompt('URL da imagem:');
            if (url) document.execCommand('insertImage', false, url);
          } else if (btn.classList.contains('editor-text-color-btn')) {
            const color = prompt('Cor (ex: #ff0000):');
            if (color) document.execCommand('foreColor', false, color);
          } else if (btn.classList.contains('editor-bg-color-btn')) {
            const color = prompt('Cor de fundo (ex: #ffff00):');
            if (color) document.execCommand('backColor', false, color);
          } else if (btn.classList.contains('editor-table-btn')) {
            const rows = prompt('Número de linhas:', '3');
            const cols = prompt('Número de colunas:', '3');
            if (rows && cols) {
              let table = '<table border="1"><tbody>';
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
          } else if (value) {
            document.execCommand(format, false, value);
          } else {
            document.execCommand(format, false, null);
          }

          content.focus();
        });
      });

      // Sync content to textarea
      content.addEventListener('input', () => {
        textarea.value = content.innerHTML;
      });

      content.addEventListener('blur', () => {
        textarea.value = content.innerHTML;
      });

      // Preserve formatting on paste
      content.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
        document.execCommand('insertHTML', false, text);
      });
    });
  }

  /**
   * Setup collapsible effect headers
   */
  _setupCollapsibleEffects(html) {
    const headers = html.querySelectorAll('.effect-collapsible-header');
    headers.forEach(header => {
      header.addEventListener('click', (ev) => {
        ev.preventDefault();
        const effectId = header.dataset.effectId;
        const content = html.querySelector(`#${effectId}`);
        const icon = header.querySelector('.effect-collapsible-icon');

        if (content) {
          const isOpen = content.style.display !== 'none';
          content.style.display = isOpen ? 'none' : 'block';
          icon.classList.toggle('open');
        }
      });
    });
  }

  async _submitForm(event, { render = true } = {}) {
    if (!this.form) return;
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));
    await this.document.update(updates, { render });
  }

  /**
   * Handle dropping effects and traits onto the talent
   */
  async _onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    if (data.type !== 'Item') return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    // Handle traits
    if (item.type === 'trait') {
      const current = Array.isArray(this.document.system?.traits) ? [...this.document.system.traits] : [];

      if (current.includes(item.uuid)) {
        ui.notifications?.warn(`${item.name} já está vinculado a este talent.`);
        return;
      }

      current.push(item.uuid);
      await this.document.update({ 'system.traits': current });
      ui.notifications?.info(`${item.name} adicionado ao talent.`);
    }

    // Handle effects (active or passive)
    if (item.type === 'active-effect' || item.type === 'passive-effect') {
      const current = Array.isArray(this.document.system?.effects) ? [...this.document.system.effects] : [];

      if (current.includes(item.uuid)) {
        ui.notifications?.warn(`${item.name} já está vinculado a este talent.`);
        return;
      }

      current.push(item.uuid);
      await this.document.update({ 'system.effects': current });
      ui.notifications?.info(`${item.name} adicionado ao talent.`);
    }
  }

  /**
   * Handle removing traits
   */
  async _onRemoveTrait(event) {
    const btn = event.target.closest('.trait-chip-remove');
    if (!btn) return;

    const uuid = btn.dataset.uuid;
    if (!uuid) return;

    const current = Array.isArray(this.document.system?.traits) ? [...this.document.system.traits] : [];
    const idx = current.indexOf(uuid);
    if (idx >= 0) {
      current.splice(idx, 1);
      await this.document.update({ 'system.traits': current });
      ui.notifications?.info('Trait removido do talent.');
    }
  }

  /**
   * Handle removing effects
   */
  async _onRemoveEffect(event) {
    const btn = event.target.closest('.remove-effect-btn');
    if (!btn) return;

    const uuid = btn.dataset.uuid;
    if (!uuid) return;

    const current = Array.isArray(this.document.system?.effects) ? [...this.document.system.effects] : [];
    const idx = current.indexOf(uuid);
    if (idx >= 0) {
      current.splice(idx, 1);
      await this.document.update({ 'system.effects': current });
      ui.notifications?.info('Efeito removido do talent.');
    }
  }
}
