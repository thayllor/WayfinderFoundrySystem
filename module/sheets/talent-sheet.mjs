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
        console.warn('Erro ao resolver trait para talent:', uuid, err);
      }
    }

    // Resolve effect UUIDs to get effect data
    const effectUuids = Array.isArray(this.document.system?.effects) ? this.document.system.effects : [];
    const activeEffects = [];
    const passiveEffects = [];

    for (const uuid of effectUuids) {
      try {
        const doc = await fromUuid(uuid);
        if (doc && (doc.type === 'active-effect' || doc.type === 'passive-effect')) {
          const traitUuidsEffect = Array.isArray(doc.system?.traits) ? doc.system.traits : [];
          const traitsResolvedEffect = [];

          for (const tuuid of traitUuidsEffect) {
            try {
              const tdoc = await fromUuid(tuuid);
              if (tdoc && tdoc.type === 'trait') {
                traitsResolvedEffect.push({
                  uuid: tuuid,
                  id: tdoc.id,
                  name: tdoc.name,
                  color: tdoc.system?.color || '#666666'
                });
              }
            } catch (err) {
              console.warn('Erro ao resolver trait de efeito:', tuuid, err);
            }
          }

          const effectData = {
            uuid,
            id: doc.id,
            name: doc.name,
            type: doc.type,
            description: doc.system?.description || '',
            effect: doc.system?.effect || '',
            range: doc.system?.range || '',
            target: doc.system?.target || '',
            duration: doc.system?.duration || '',
            focusCost: doc.system?.focusCost || 0,
            isMagic: doc.system?.isMagic || false,
            magicCircle: doc.system?.magicCircle || '',
            isPermanent: doc.system?.isPermanent || false,
            isActive: doc.system?.isActive !== false, // default true
            traitsResolved: traitsResolvedEffect,
            heightened: Array.isArray(doc.system?.heightened)
              ? doc.system.heightened
              : (doc.system?.heightened && typeof doc.system.heightened === 'object'
                  ? Object.values(doc.system.heightened)
                  : [])
          };

          if (doc.type === 'active-effect') {
            activeEffects.push(effectData);
          } else {
            passiveEffects.push(effectData);
          }
        }
      } catch (err) {
        console.warn('Erro ao resolver efeito para talent:', uuid, err);
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

      let isPreview = false;

      // Toggle editor mode
      toggleBtn?.addEventListener('click', () => {
        const isEditing = content.getAttribute('contenteditable') === 'true';
        content.setAttribute('contenteditable', !isEditing);
        content.setAttribute('data-text-editable', !isEditing);
        toolbar.style.display = !isEditing ? 'flex' : 'none';
        toggleBtn.innerHTML = !isEditing
          ? '<i class="fas fa-times"></i> Cancelar'
          : '<i class="fas fa-edit"></i> Editar';

        if (!isEditing) {
          content.focus();
        }
      });

      // Close editor
      closeBtn?.addEventListener('click', () => {
        content.setAttribute('contenteditable', 'false');
        content.setAttribute('data-text-editable', 'false');
        toolbar.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
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
          previewBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Editar';
        } else {
          preview.style.display = 'none';
          content.style.display = 'block';
          previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
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
