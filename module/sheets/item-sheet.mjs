/**
 * Extend the basic ItemSheet with some very simple modifications
 * Para V2, deve estender HandlebarsApplicationMixin(DocumentSheetV2)
 */
const { ApplicationV2, HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class WayfinderItemSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "item"],
    position: {
      width: 520,
      height: 480
    },
    window: {
      colorScheme: "light",
      resizable: true
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/wayfinder/templates/item/item-item-sheet.hbs"
    }
  };

  /** @override */
  get title() {
    const typeName = game.i18n.localize(`TYPES.Item.${this.document.type}`) || this.document.type;
    return `${typeName}: ${this.document.name}`;
  }

  /**
   * Get the form element from the sheet
   */
  get form() {
    return this.element?.querySelector('form');
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.document.actor;
    const attributesList = [];
    if (actor && actor.system && actor.system.attributes) {
      for (const [key, val] of Object.entries(actor.system.attributes)) {
        const label = val?.label || (key.charAt(0).toUpperCase() + key.slice(1));
        attributesList.push({ key, label });
      }
    }

    // If there is no actor (item opened standalone) or attributes list is empty,
    // provide a sensible default set based on the system's abilities.
    if (!attributesList.length) {
      const defaults = [
        { key: 'strength', loc: 'WAYFINDER.Ability.Str.long' },
        { key: 'dexterity', loc: 'WAYFINDER.Ability.Dex.long' },
        { key: 'intelligence', loc: 'WAYFINDER.Ability.Int.long' },
        { key: 'wisdom', loc: 'WAYFINDER.Ability.Wis.long' },
        { key: 'presence', loc: 'WAYFINDER.Ability.Pre.long' }
      ];
      for (const d of defaults) {
        const label = game?.i18n?.localize(d.loc) || (d.key.charAt(0).toUpperCase() + d.key.slice(1));
        attributesList.push({ key: d.key, label });
      }
    }

    // Build defenses list for the template: one entry per attribute with stored armor value
    const defensesList = [];
    for (const a of attributesList) {
      const val = this.document?.system?.defenses?.armor?.[a.key];
      const value = (typeof val === 'number') ? val : (val?.item ?? 0);
      defensesList.push({ key: a.key, label: a.label, value });
    }

    // Build active/passive effects lists for the item sheet from flags or system references
    const activeEffects = [];
    const passiveEffects = [];
    try {
      const embedded = Array.isArray(this.document.flags?.wayfinder?.embeddedEffects)
        ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects)
        : [];
      // Ensure each embedded entry has a stable uuid for matching/removal
      try {
        let changed = false;
        for (let i = 0; i < embedded.length; i++) {
          const e = embedded[i];
          if (!e || (!e.uuid && !e._id && !e.id)) {
            embedded[i] = embedded[i] || {};
            embedded[i].uuid = embedded[i].uuid || foundry.utils.randomID(16);
            changed = true;
          }
        }
        if (changed) {
          // Update in-memory flags and attempt to persist to the document if possible
          try {
            this.document.flags = this.document.flags || {};
            this.document.flags.wayfinder = this.document.flags.wayfinder || {};
            this.document.flags.wayfinder.embeddedEffects = embedded;
            if (typeof this.document.update === 'function') {
              await this.document.update({ ['flags.wayfinder.embeddedEffects']: embedded });
            }
          } catch (err) {
            console.debug('Wayfinder | could not persist generated uuids for embedded effects', err);
          }
        }
      } catch (err) {
        console.debug('Wayfinder | error normalizing embedded effects', err);
      }
      // Helper to normalize color values for trait chips
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

      for (const e of embedded) {
        // Resolve trait UUIDs to objects with name and color so the partial can render correctly
        const traitsResolved = [];
        try {
          const traitUuids = Array.isArray(e?.system?.traits) ? e.system.traits : [];
          for (const tuuid of traitUuids) {
            try {
              const tdoc = await fromUuid(tuuid);
              if (tdoc && tdoc.type === 'trait') {
                traitsResolved.push({ uuid: tuuid, id: tdoc.id, name: tdoc.name, color: normalizeColor(tdoc.system?.color) });
              } else {
                traitsResolved.push({ uuid: tuuid, name: String(tuuid), color: normalizeColor(null) });
              }
            } catch (err) {
              traitsResolved.push({ uuid: tuuid, name: String(tuuid), color: normalizeColor(null) });
            }
          }
        } catch (err) {
          console.debug('Wayfinder | error resolving embedded effect traits', err);
        }
          const effectData = {
          uuid: e.uuid || e._id || null,
          id: e.id || e._id || null,
          name: e.name || (e.system && e.system.name) || 'Effect',
          type: e.type || 'active-effect',
          description: e.system?.description || e.description || '',
          effect: e.system?.effect || '',
          range: e.system?.range || '',
          target: e.system?.target || '',
          duration: e.system?.duration || '',
          focusCost: e.system?.focusCost || 0,
          actionCost: e.system?.actionCost ?? e.system?.actions ?? e.actionCost ?? '',
          isMagic: e.system?.isMagic || false,
          magicCircle: e.system?.magicCircle || '',
          isPermanent: e.system?.isPermanent || false,
          isActive: (typeof e.system?.isActive === 'boolean') ? e.system.isActive : true,
          traitsResolved,
          heightened: Array.isArray(e.system?.heightened) ? e.system.heightened : []
        };
        // Treat as active-effects by default
        activeEffects.push(effectData);
      }
    } catch (err) {
      console.debug('Wayfinder | failed to build embedded effects for item sheet', err);
    }

    return {
      item: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      rollData: this.document.getRollData(),
      editable: this.isEditable,
      attributesList,
      defensesList,
      activeEffects,
      passiveEffects
    };

  }

  /** @override */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);

    // Determine template based on item type
    const templates = {
      'trait': "systems/wayfinder/templates/item/item-trait-sheet.hbs",
      'item': "systems/wayfinder/templates/item/item-item-sheet.hbs",
      'spell': "systems/wayfinder/templates/item/item-spell-sheet.hbs"
    };

    console.log('Item type:', this.document.type, 'Template:', templates[this.document.type]);

    // Override the template for this specific render
    if (partId === 'sheet' && templates[this.document.type]) {
      context.partials = context.partials || {};
      this.constructor.PARTS.sheet.template = templates[this.document.type];
    }

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Ensure the Create Modifier button is always bound so the user can add
    // modifiers even if the sheet is rendered non-editable in some contexts.
    try {
      const headerCreateBtn = html.querySelector('.create-modifier-btn');
      // Remove previous binding if it's a different element
      if (this._createBtnElement && this._createBtnElement !== headerCreateBtn && this._onCreateModifier) {
        this._createBtnElement.removeEventListener('click', this._onCreateModifier);
        this._createBtnElement = null;
      }
      if (headerCreateBtn && (!this._createBtnElement || this._createBtnElement !== headerCreateBtn)) {
        this._onCreateModifier = async (ev) => {
          ev.preventDefault();
          console.log('Wayfinder | create-modifier clicked (sheet)', this.document.id);
          try {
            const newMod = {
              id: foundry.utils.randomID(16),
              name: 'Novo Modificador',
              isActive: true,
              pillar: '',
              value: 0,
              description: ''
            };
            const mods = foundry.utils.deepClone(this.document.system.modifiers || []);
            mods.push(newMod);
            await this.document.update({ 'system.modifiers': mods });
            this.render(true);
          } catch (err) {
            console.error('Error creating modifier on item', err);
            ui.notifications?.error?.('Não foi possível criar o modificador no item.');
          }
        };
        headerCreateBtn.addEventListener('click', this._onCreateModifier);
        this._createBtnElement = headerCreateBtn;
        console.log('Wayfinder | bound create-modifier button');
      }
    } catch (err) {
      console.warn('Wayfinder | failed to bind create-modifier button', err);
    }

    // Bind click-to-edit-image on the profile image (open Foundry FilePicker)
    try {
      const imgEl = html.querySelector('.profile-img');
      if (this._imgElement && this._imgElement !== imgEl && this._onImageClick) {
        this._imgElement.removeEventListener('click', this._onImageClick);
        this._imgElement = null;
      }
      if (imgEl && (!this._imgElement || this._imgElement !== imgEl)) {
        this._onImageClick = async (ev) => {
          ev.preventDefault();
          try {
            const fp = new FilePicker({
              type: 'image',
              current: this.document?.img,
              callback: async (path) => {
                try {
                  await this.document.update({ img: path });
                } catch (err) {
                  console.warn('Wayfinder | failed to update item image', err);
                  ui.notifications?.error?.('Não foi possível atualizar a imagem do item. Veja o console.');
                }
              },
              top: this.position?.top + 40,
              left: this.position?.left + 10
            });
            return fp.browse();
          } catch (err) {
            console.error('Wayfinder | error opening FilePicker', err);
            ui.notifications?.error?.('Erro ao abrir seletor de imagens. Veja o console.');
          }
        };
        imgEl.addEventListener('click', this._onImageClick);
        this._imgElement = imgEl;
      }
    } catch (err) {
      console.debug('Wayfinder | failed to bind image click', err);
    }

    if (!this.isEditable) return;

    // Bind form listeners to the current DOM and keep references so they can
    // be removed and reattached if the sheet re-renders (prevents stale handlers).
    const form = html.querySelector('form');
    if (!form) return;

    // If listeners were previously bound to a different DOM element, remove them
    if (this._listenersBound && this._boundElement && this._boundElement !== form) {
      try {
        this._boundElement.removeEventListener('change', this._onFormChange);
        this._boundElement.removeEventListener('input', this._onFormInput);
        const prevType = this._boundElement.querySelector('.item-type-select');
        if (prevType && this._onTypeChange) prevType.removeEventListener('change', this._onTypeChange);
        const prevCreate = this._boundElement.querySelector('.create-modifier-btn');
        if (prevCreate && this._onCreateModifier) prevCreate.removeEventListener('click', this._onCreateModifier);
      } catch (err) {
        // ignore
      }
      this._listenersBound = false;
      this._boundElement = null;
    }

    // If already bound to the current form, nothing to do
    if (this._listenersBound && this._boundElement === form) return;

    this._onFormChange = (ev) => this._submitForm(ev, { render: true });
    this._onFormInput = (ev) => {
      if (!(ev.target.closest('.editor') || ev.target.closest('[name*="system"]'))) return;
      // Debounce frequent input events to avoid re-rendering per keystroke
      try {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
          this._saveTimer = null;
          this._submitForm(ev, { render: false }).catch(err => console.error('Wayfinder | debounced save failed', err));
        }, 600);
      } catch (err) {
        console.debug('Wayfinder | error scheduling debounced save', err);
      }
    };

    // Use a live reference to `this.element` inside the handler so re-renders
    // don't leave the handler querying a stale DOM reference.
    this._onTypeChange = (ev) => {
      const value = ev.target?.value;
      const root = this.element;
      if (!root) return;
      const forms = root.querySelectorAll('.item-type-form');
      forms.forEach((f) => {
        if (f.dataset.type === value) f.removeAttribute('hidden'); else f.setAttribute('hidden', '');
      });
    };

    form.addEventListener('change', this._onFormChange);
    form.addEventListener('input', this._onFormInput);
    const typeSelect = form.querySelector('.item-type-select');
    if (typeSelect) {
      typeSelect.addEventListener('change', this._onTypeChange);
      // ensure initial visibility
      this._onTypeChange({ target: typeSelect });
    }

    // Create Modifier button - create the modifier as nested data on the item itself
    const createBtn = form.querySelector('.create-modifier-btn');
    this._onCreateModifier = async (ev) => {
      ev.preventDefault();
      try {
        console.debug('Wayfinder | create-modifier clicked for item', this.document?.id);
        const newMod = {
          id: foundry.utils.randomID(16),
          name: 'Novo Modificador',
          isActive: true,
          value: 0,
          description: ''
        };
        const mods = foundry.utils.deepClone(this.document.system.modifiers || []);
        mods.push(newMod);
        console.debug('Wayfinder | create-modifier payload', mods);
        await this.document.update({ 'system.modifiers': mods });
        console.debug('Wayfinder | modifier created');
        // Re-render to show the new modifier in any UI
        this.render(true);
      } catch (err) {
        console.error('Error creating modifier on item', err);
        ui.notifications?.error?.('Não foi possível criar o modificador no item.');
      }
    };
    if (createBtn) createBtn.addEventListener('click', this._onCreateModifier);

    // Import-from-compendium button
    const importBtn = form.querySelector('.add-effect-from-compendium-btn');
    if (importBtn) {
      this._onImportFromCompendium = async (ev) => {
        ev.preventDefault();
        // Build list of packs and include World Items as an option
        const packs = Array.from(game.packs);
        const packOptions = [`<option value="WORLD">Itens do Mundo</option>`].concat(packs.map(p => `<option value="${p.collection}">${p.metadata.label || p.collection}</option>`)).join('');
        const content = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/select-form.hbs', { label: 'Escolha a origem', name: 'pack', options: packOptions });
        new Dialog({
          title: 'Importar efeito do compêndio',
          content,
          buttons: {
            ok: { label: 'Abrir', callback: async (htmlDlg) => {
              let root = htmlDlg;
              if (htmlDlg.jquery && htmlDlg.length) root = htmlDlg[0];
              const sel = root.querySelector('select[name="pack"]');
              const packCollection = sel?.value;
              if (!packCollection) return;
              let docs = [];
              try {
                if (packCollection === 'WORLD') {
                  docs = Array.from(game.items.contents || []);
                } else {
                  const pack = game.packs.get(packCollection);
                  if (!pack) return ui.notifications.error('Compêndio não encontrado');
                  docs = await pack.getDocuments();
                }
                // Filter for active-effect items
                const effects = docs.filter(d => (d.type === 'active-effect' || d.system?.itemType === 'active-effect' || d.system?.itemType === 'effect'));
                if (!effects.length) return ui.notifications.warn('Nenhum efeito ativo encontrado no compêndio.');
                const opts = effects.map(e => `<option value="${e.uuid}">${e.name}</option>`).join('');
                const content2 = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/select-form.hbs', { label: 'Escolha o Efeito', name: 'effect', options: opts });
                new Dialog({
                  title: 'Escolha o efeito',
                  content: content2,
                  buttons: {
                    import: { label: 'Importar', callback: async (html2) => {
                      let root2 = html2;
                      if (html2.jquery && html2.length) root2 = html2[0];
                      const sel2 = root2.querySelector('select[name="effect"]');
                      const uuid = sel2?.value;
                      if (!uuid) return;
                      try {
                        const dropped = await fromUuid(uuid);
                        if (!dropped) return ui.notifications.error('Efeito não encontrado.');
                        // Reuse existing attach logic: attempt pack update or actor embed
                        const sourceItemId = this.document.id || this.document._id;
                        const copyData = duplicate(dropped.toObject());
                        delete copyData._id;
                        copyData.flags = copyData.flags || {};
                        copyData.flags.wayfinder = copyData.flags.wayfinder || {};
                        copyData.flags.wayfinder.sourceItemId = sourceItemId;

                        const existing = (this.document.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects) : [];
                        existing.push(copyData);

                        const packTarget = this.document.pack || (this.document._pack ? game.packs.get(this.document._pack) : null);
                        if (packTarget && typeof packTarget.updateDocuments === 'function') {
                          await packTarget.updateDocuments([{ _id: this.document.id, ['flags.wayfinder.embeddedEffects']: existing }]);
                          // Also update the in-memory document flags so the open sheet reflects changes
                          try {
                            this.document.flags = this.document.flags || {};
                            this.document.flags.wayfinder = this.document.flags.wayfinder || {};
                            this.document.flags.wayfinder.embeddedEffects = existing;
                          } catch (e) {
                            console.debug('Wayfinder | could not update in-memory document flags after pack update', e);
                          }
                          // Attempt to re-fetch the updated document from the pack and replace this.document
                          try {
                            const docs = await pack.getDocuments();
                            const updated = docs.find(d => (d.id === this.document.id || d._id === this.document.id || d._id === this.document._id));
                            if (updated) {
                              this.document = updated;
                            }
                          } catch (e) {
                            console.debug('Wayfinder | could not re-fetch updated pack document', e);
                          }
                          try { this.render(true); } catch (e) { /* ignore render failures */ }
                          ui.notifications.info('Efeito importado e salvo no item do compêndio.');
                          return;
                        }
                        if (typeof this.document.update === 'function') {
                          try {
                            await this.document.update({ ['flags.wayfinder.embeddedEffects']: existing });
                            ui.notifications.info('Efeito importado e salvo no item.');
                            return;
                          } catch (err) {
                            // fallback
                          }
                        }
                        const actor = this.document.actor;
                        if (actor) {
                          const created = await actor.createEmbeddedDocuments('Item', [copyData]);
                          ui.notifications.info('Efeito importado e criado no ator como cópia.');
                          return;
                        }
                        // As a last resort, create a World Item copy so the effect is preserved
                        try {
                          const worldCreated = await Item.create(copyData);
                          ui.notifications.info(`Efeito importado e criado como Item do Mundo: ${worldCreated.name}`);
                          return;
                        } catch (err) {
                          console.error('Wayfinder | failed to create world Item fallback', err);
                        }
                        ui.notifications.warn('Não foi possível salvar o efeito; verifique permissões do compêndio.');
                      } catch (err) {
                        console.error('Wayfinder | import failed', err);
                        ui.notifications.error('Falha ao importar efeito. Veja console.');
                      }
                    }},
                    cancel: { label: 'Cancelar' }
                  },
                  default: 'import'
                }).render(true);
              } catch (err) {
                console.error('Wayfinder | failed to read pack documents', err);
                ui.notifications.error('Erro ao abrir compêndio. Veja console.');
              }
            } },
            cancel: { label: 'Cancelar' }
          },
          default: 'ok'
        }).render(true);
      };
      importBtn.addEventListener('click', this._onImportFromCompendium);
    }

    // Attach-to-item button (for active-effect sheets): open weapon picker and set flags.wayfinder.sourceItemId
    const attachBtn = form.querySelector('.attach-to-item-btn');
    if (attachBtn) {
      this._onAttachToItem = async (ev) => {
        ev.preventDefault();
        const effectItem = this.document;
        const actor = effectItem.actor;
        if (!actor) {
          ui.notifications.warn('Abra o efeito a partir do ator para associar a uma arma.');
          return;
        }
        const weapons = actor.items.filter(i => i.type === 'item' && i.system?.itemType === 'weapon');
        if (!weapons.length) {
          ui.notifications.warn('Nenhuma arma encontrada neste ator.');
          return;
        }
        const options = weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        const content = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/select-form.hbs', { label: 'Escolha a arma', name: 'weaponId', options });
        new Dialog({
          title: 'Associar efeito a arma',
          content,
          buttons: {
            ok: { label: 'Associar', callback: async (htmlDlg) => {
              try {
                // Normalize to HTMLElement
                let root = htmlDlg;
                if (htmlDlg.jquery && htmlDlg.length) root = htmlDlg[0];
                const sel = root.querySelector('select[name="weaponId"]');
                const wid = sel?.value;
                if (!wid) return;
                // Update the embedded item on the actor
                await actor.updateEmbeddedDocuments('Item', [{ _id: effectItem.id, ['flags.wayfinder.sourceItemId']: wid }]);
                ui.notifications.info('Efeito associado a ' + (actor.items.get(wid)?.name || wid));
              } catch (err) {
                console.error('Wayfinder | failed to attach effect to weapon', err);
                ui.notifications.error('Falha ao associar o efeito. Veja console.');
              }
            } },
            cancel: { label: 'Cancelar' }
          },
          default: 'ok'
        }).render(true);
      };
      attachBtn.addEventListener('click', this._onAttachToItem);
    }

    // Modifier edit/remove handlers (delegated)
    this._onModifierAction = async (ev) => {
      const btn = ev.target.closest('.modifier-edit, .modifier-remove');
      if (!btn) return;
      const modId = btn.dataset.modId;
      if (!modId) return;

      const mods = foundry.utils.deepClone(this.document.system.modifiers || []);
      const idx = mods.findIndex(m => m.id === modId);
      if (idx === -1) return;

      if (btn.classList.contains('modifier-remove')) {
        // Remove modifier
        mods.splice(idx, 1);
        try {
          console.debug('Wayfinder | removing modifier', modId, mods);
          await this.document.update({ 'system.modifiers': mods });
          console.debug('Wayfinder | modifier removed');
          this.render(true);
        } catch (err) {
          console.error('Error removing modifier', err);
          ui.notifications?.error?.('Não foi possível remover o modificador.');
        }
      } else if (btn.classList.contains('modifier-edit')) {
        // Edit via Foundry Dialog
        const mod = mods[idx];

        // Helper to build attribute options
        const buildAttributeOptions = () => {
          const attributes = [];
          const actor = this.document.actor;
          if (actor && actor.system && actor.system.attributes) {
            for (const [k, v] of Object.entries(actor.system.attributes)) {
              const label = v?.label || (k.charAt(0).toUpperCase() + k.slice(1));
              attributes.push({ key: k, label });
            }
          } else {
            const defaults = ['strength','dexterity','intelligence','wisdom','presence'];
            for (const k of defaults) attributes.push({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) });
          }
          return attributes;
        };

        const attributes = buildAttributeOptions();

        // Build a list of candidate actor paths for autocomplete (attributes, skills, defenses)
        const buildCandidatePaths = () => {
          const paths = new Set();
          const actor = this.document.actor;
            // Attributes: offer only allowed suffixes. We permit .value as a special
            // exception (for reading base attribute values) and the stacking suffixes
            // `.item`, `.circun`, `.status` which are used by modifiers.
            const attrs = actor?.system?.attributes ? Object.keys(actor.system.attributes) : ['strength','dexterity','intelligence','wisdom','presence'];
            for (const a of attrs) {
              paths.add(`system.attributes.${a}.value`);
              paths.add(`system.attributes.${a}.item`);
              paths.add(`system.attributes.${a}.status`);
              paths.add(`system.attributes.${a}.circun`);
            }
          // Skills
          // Use actor skills when available; otherwise fall back to the system's
          // canonical skill keys (from template.json) so autocomplete still lists
          // skills when editing an item standalone.
          let skills = [];
          if (actor?.system?.skills) skills = Object.keys(actor.system.skills);
          else skills = [
            'arcana','acrobatics','athletics','crafting','deception','diplomacy','intimidation',
            'medicine','nature','occultism','performance','religion','society','stealth','survival'
          ];
          for (const s of skills) {
            // Only offer skill paths that end with the stacking suffixes
            paths.add(`system.skills.${s}.item`);
            paths.add(`system.skills.${s}.status`);
            paths.add(`system.skills.${s}.circun`);
          }
          // Defenses on armor (per-attribute item contribution)
          const defAttrs = actor?.system?.attributes ? Object.keys(actor.system.attributes) : [];
          for (const a of defAttrs) {
            // Armor contributions live on `system.defenses.armor.<attr>` (no suffix)
            paths.add(`system.defenses.armor.${a}`);
          }
          // Common actor fields (not used for stacking, included for convenience)
          paths.add('system.classDC');
          paths.add('system.level');
          paths.add('system.speed');

          // Filter the paths so the autocomplete only suggests targets that are meaningful
          // for modifiers: those that end in `.item`, `.circun`, or `.status`, plus
          // attribute `.value` paths and armor defense entries.
          const allowed = [];
          const entries = Array.from(paths);
          for (const p of entries) {
            if (/^system\.attributes\.[^.]+\.(item|status|circun|value)$/.test(p)) allowed.push(p);
            else if (/^system\.skills\.[^.]+\.(item|status|circun)$/.test(p)) allowed.push(p);
            else if (/^system\.defenses\.armor\.[^.]+$/.test(p)) allowed.push(p);
            // keep some top-level helpful fields
            else if (/^system\.(classDC|level|speed)$/.test(p)) allowed.push(p);
          }
          return allowed;
        };

        const candidatePaths = buildCandidatePaths();
        console.debug('Wayfinder | modifier candidatePaths:', candidatePaths);
        const datalistOptions = candidatePaths.map(p => `<option value="${p}"></option>`).join('');

        const html = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/modifier-edit-form.hbs', {
          name: (mod.name||'').replace(/"/g,'&quot;'),
          targetPath: (mod.targetPath||'').replace(/"/g,'&quot;'),
          datalistOptions,
          value: Number(mod.value||0)
        });

        // Handler to save modifier from dialog
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
          try { for (const [k, v] of fd.entries()) values[k] = v; } catch (e) { /* ignore */ }
          const targetPath = values.targetPath ? String(values.targetPath).trim() : null;
          mod.value = Number(values.value) || 0;
          mod.targetPath = targetPath || mod.targetPath;
          mods[idx] = mod;
          try {
            console.debug('Wayfinder | saving edited modifier', modId, mods[idx]);
            await this.document.update({ 'system.modifiers': mods });
            console.debug('Wayfinder | modifier saved');
            this.render(true);
          } catch (err) {
            console.error('Error saving modifier', err);
            ui.notifications?.error?.('Não foi possível salvar o modificador.');
          }
        };

        // Render icon partial then create dialog (avoid inline HTML literals)
        Promise.all([
          foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-check' })
        ]).then(([saveIcon]) => {
          new Dialog({
            title: `Edit Modifier: ${mod.name}`,
            content: html,
            buttons: {
              save: { icon: saveIcon, label: 'Save', callback: handleSave },
              cancel: { label: 'Cancel' }
            },
            default: 'save'
          }).render(true);
        }).catch((ie) => {
          console.warn('Wayfinder | failed to render icon partial for modifier dialog', ie);
          // Fallback: create dialog with generated <i> from class name
          let fallbackIcon = 'fas fa-check';
          if (typeof fallbackIcon === 'string' && !fallbackIcon.includes('<')) fallbackIcon = `<i class="${fallbackIcon}"></i>`;
          new Dialog({
            title: `Edit Modifier: ${mod.name}`,
            content: html,
            buttons: {
              save: { icon: fallbackIcon, label: 'Save', callback: handleSave },
              cancel: { label: 'Cancel' }
            },
            default: 'save'
          }).render(true);
        });
      }
    };
    form.addEventListener('click', this._onModifierAction);

    // Enable drag/drop and click handlers once per sheet instance (avoid duplicate listeners)
    if (!this._sheetListenersBound) {
      this._sheetDragover = (ev) => ev.preventDefault();
      this._sheetDrop = (ev) => this._onDrop(ev);
      this._sheetClick = (ev) => {
        const removeEffectBtn = ev.target.closest('.remove-effect-btn');
        if (removeEffectBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          return this._onRemoveEffect(ev);
        }
      };
      html.addEventListener('dragover', this._sheetDragover);
      html.addEventListener('drop', this._sheetDrop);
      html.addEventListener('click', this._sheetClick);
      this._sheetListenersBound = true;
    }

    // Setup collapsible effects (idempotent)
    this._setupCollapsibleEffects(html);

    this._listenersBound = true;
    this._boundElement = form;
  }

  _setupCollapsibleEffects(html) {
    const headers = html.querySelectorAll('.effect-collapsible-header');
    headers.forEach(header => {
      // Avoid binding the same header multiple times
      if (header.dataset?.collapsibleBound) return;
      header.dataset.collapsibleBound = '1';
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

  async _onRemoveEffect(event) {
    const btn = event.target.closest('.remove-effect-btn');
    if (!btn) return;
    const uuid = btn.dataset.uuid;

    // Load current embedded effects
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
        ui.notifications.info('Efeito removido.');
        return;
      } catch (err) {
        console.debug('Wayfinder | document.update failed on remove', err);
      }
    }

    ui.notifications.warn('Não foi possível remover o efeito persistentemente; verifique permissões.');
  }

  /** Handle drops onto an Item sheet (e.g., attach an active-effect item to this weapon) */
  async _onDrop(event) {
    // Normalize drag data
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data) return;

    // Only handle Item drops here; otherwise delegate to default behavior
    if (data.type !== 'Item') {
      try { ui.notifications.info('Wayfinder | _onDrop: tipo não é Item, delegando'); } catch (e) {}
      return super._onDrop ? super._onDrop(event) : undefined;
    }

    // Resolve the dragged item/document
    let dropped = null;
    try {
      dropped = await fromUuid(data.uuid);
    } catch (err) {
      console.warn('Wayfinder | failed to resolve dropped UUID', data.uuid, err);
    }
    if (!dropped) return;

    // Notify UI and log details for debugging
    try {
      ui.notifications.info('Wayfinder | _onDrop recebido (ver console para detalhes)');
    } catch (e) {}
    try {
      console.debug('Wayfinder | _onDrop: dropped document:', {
        uuid: data.uuid,
        id: dropped.id,
        documentName: dropped.documentName || dropped.document?.documentName,
        parent: !!dropped.parent,
        pack: dropped.pack || dropped._pack || null
      });
      console.debug('Wayfinder | _onDrop: target document info:', {
        id: this.document.id,
        _id: this.document._id,
        pack: this.document.pack || this.document._pack || null,
        flags: this.document.flags && this.document.flags.wayfinder ? this.document.flags.wayfinder : undefined
      });
    } catch (err) {
      // ignore logging errors
    }

    // If the dropped item is an active-effect item, mark it as originating from this item
    if (dropped.type === 'active-effect') {
      try { ui.notifications.info('Wayfinder | drop: active-effect detectado'); } catch (e) {}
      const sourceItemId = this.document.id || this.document._id;
      try {
        // If the dropped item is embedded in an Actor, update the embedded document via the Actor
        if (dropped.parent && dropped.parent.documentName === 'Actor') {
          const actor = dropped.parent;
          console.debug('Wayfinder | attaching embedded active-effect', dropped.id, 'to item', sourceItemId, 'on actor', actor.id);
          await actor.updateEmbeddedDocuments('Item', [{ _id: dropped.id, 'flags.wayfinder.sourceItemId': sourceItemId }]);
          ui.notifications.info(`${dropped.name} associado a ${this.document.name}.`);
          return;
        }

        // If the dropped item is a top-level Item document, create a copy and attach it
        if (dropped.documentName === 'Item' && typeof dropped.toObject === 'function') {
          console.debug('Wayfinder | creating copy of top-level Item to attach to', this.document.id);
          const copyData = duplicate(dropped.toObject());
          delete copyData._id;
          // Ensure a stable uuid exists for matching/removal
          copyData.uuid = copyData.uuid || copyData._id || copyData.id || foundry.utils.randomID(16);
          copyData.flags = copyData.flags || {};
          copyData.flags.wayfinder = copyData.flags.wayfinder || {};
          copyData.flags.wayfinder.sourceItemId = sourceItemId;

          const existing = (this.document.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects) : [];
          existing.push(copyData);

          // Try to persist into pack if this is a pack entry
          const packTarget = this.document.pack || (this.document._pack ? game.packs.get(this.document._pack) : null);
          if (packTarget && typeof packTarget.updateDocuments === 'function') {
            try {
              await packTarget.updateDocuments([{ _id: this.document.id, ['flags.wayfinder.embeddedEffects']: existing }]);
              // update in-memory and re-fetch as necessary
              try { this.document.flags = this.document.flags || {}; this.document.flags.wayfinder = this.document.flags.wayfinder || {}; this.document.flags.wayfinder.embeddedEffects = existing; } catch(e){}
              try { const docs = await packTarget.getDocuments(); const updated = docs.find(d => (d.id === this.document.id || d._id === this.document.id || d._id === this.document._id)); if (updated) this.document = updated; } catch(e){}
              try { this.render(true); } catch(e){}
              ui.notifications.info(`${dropped.name} associado a ${this.document.name} (salvo no compêndio).`);
              return;
            } catch (err) {
              console.debug('Wayfinder | pack.updateDocuments failed for top-level Item copy, falling back', err);
            }
          }

          // Try direct document update on this sheet's document
          if (typeof this.document.update === 'function') {
            try {
              await this.document.update({ ['flags.wayfinder.embeddedEffects']: existing });
              ui.notifications.info(`${dropped.name} associado a ${this.document.name}.`);
              try { this.render(true); } catch(e){}
              return;
            } catch (err) {
              console.debug('Wayfinder | document.update failed for attaching top-level Item copy', err);
            }
          }
          // Fallback: if this item is embedded in an actor, create embedded copy on actor
          const actor = this.document.actor;
          if (actor) {
            try {
              const created = await actor.createEmbeddedDocuments('Item', [copyData]);
              ui.notifications.info(`${dropped.name} copiado e associado a ${this.document.name} no ator.`);
              return;
            } catch (err) {
              console.debug('Wayfinder | failed to create embedded copy on actor fallback', err);
            }
          }
          // Last resort: create World Item so effect isn't lost
          try {
            const world = await Item.create(copyData);
            ui.notifications.info(`${dropped.name} copiado como Item do Mundo: ${world.name}`);
            return;
          } catch (err) {
            console.error('Wayfinder | failed to create world item for dropped effect', err);
          }
        }

        // Otherwise we couldn't attach it directly (e.g., compendium entry).
        // First, if this sheet represents a compendium/pack item, try to persist
        // a copy of the effect inside the target pack entry's flags so the
        // weapon in the pack carries the embedded effect permanently.
        try {
          const isPackEntry = !!this.document?.pack;
          if (isPackEntry) {
            console.debug('Wayfinder | attempting to store embedded effect into pack item', this.document.id);
            const copyData = duplicate(dropped.toObject());
            delete copyData._id;
            copyData.uuid = copyData.uuid || copyData._id || copyData.id || foundry.utils.randomID(16);
            copyData.flags = copyData.flags || {};
            copyData.flags.wayfinder = copyData.flags.wayfinder || {};
            copyData.flags.wayfinder.sourceItemId = sourceItemId;

            const existing = (this.document.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects) : [];
            existing.push(copyData);

            let pack = this.document.pack || (this.document._pack ? game.packs.get(this.document._pack) : null);
            // If pack still not found, try locate it by scanning game.packs index
            if (!pack) {
              try {
                for (const p of game.packs) {
                  try {
                    if (!p.index) await p.getIndex();
                  } catch (err) {
                    // ignore index fetch errors for packs we cannot read
                  }
                  const found = p.index?.find(e => (e._id === this.document.id || e.id === this.document.id || e._id === this.document._id));
                  if (found) { pack = p; break; }
                }
              } catch (err) {
                console.debug('Wayfinder | error scanning packs for target entry', err);
              }
            }

            if (pack && typeof pack.updateDocuments === 'function') {
              console.debug('Wayfinder | updating pack', pack.collection || pack.metadata?.package || pack.metadata?.label || pack);
              try {
                await pack.updateDocuments([{ _id: this.document.id, ['flags.wayfinder.embeddedEffects']: existing }]);
                // Update in-memory flags so the sheet shows the new embeddedEffects immediately
                try {
                  this.document.flags = this.document.flags || {};
                  this.document.flags.wayfinder = this.document.flags.wayfinder || {};
                  this.document.flags.wayfinder.embeddedEffects = existing;
                } catch (e) {
                  console.debug('Wayfinder | could not update in-memory document flags after pack update', e);
                }
                try {
                  const docs = await pack.getDocuments();
                  const updated = docs.find(d => (d.id === this.document.id || d._id === this.document.id || d._id === this.document._id));
                  if (updated) this.document = updated;
                } catch (e) {
                  console.debug('Wayfinder | could not re-fetch updated pack document', e);
                }
                try { this.render(true); } catch (e) { /* ignore */ }
                ui.notifications.info(`Efeito associado e salvo em ${this.document.name} (compêndio).`);
                return;
              } catch (err) {
                console.debug('Wayfinder | pack.updateDocuments failed, will attempt document.update fallback', err);
              }
            }
            // Try a document-level update as a last resort (may fail for read-only packs)
            if (typeof this.document.update === 'function') {
              try {
                await this.document.update({ ['flags.wayfinder.embeddedEffects']: existing });
                ui.notifications.info(`Efeito associado e salvo em ${this.document.name}.`);
                return;
              } catch (err) {
                console.debug('Wayfinder | pack document update failed, will fallback to actor copy', err);
              }
            }
          }
        } catch (err) {
          console.warn('Wayfinder | could not persist embedded effect into pack item, falling back', err);
        }

        // Attempt to create an embedded copy on the actor (if available) and attach that.
        const actor = this.document.actor;
        if (actor) {
          try {
            console.debug('Wayfinder | creating embedded copy of dropped effect on actor', actor.id);
            const copyData = duplicate(dropped.toObject());
            delete copyData._id;
            copyData.uuid = copyData.uuid || copyData._id || copyData.id || foundry.utils.randomID(16);
            copyData.flags = copyData.flags || {};
            copyData.flags.wayfinder = copyData.flags.wayfinder || {};
            copyData.flags.wayfinder.sourceItemId = sourceItemId;
            const created = await actor.createEmbeddedDocuments('Item', [copyData]);
            ui.notifications.info(`${created && created[0] ? created[0].name : 'Efeito'} copiado e associado a ${this.document.name}.`);
            return;
          } catch (err) {
            console.error('Wayfinder | failed to create embedded copy of dropped effect', err, dropped);
            ui.notifications.warn('Não foi possível copiar e associar o efeito do compêndio.');
            return;
          }
        }
        // If no actor or actor embed failed, create a World Item as fallback
        try {
          const copyData = duplicate(dropped.toObject());
          delete copyData._id;
          copyData.uuid = copyData.uuid || copyData._id || copyData.id || foundry.utils.randomID(16);
          copyData.flags = copyData.flags || {};
          copyData.flags.wayfinder = copyData.flags.wayfinder || {};
          copyData.flags.wayfinder.sourceItemId = sourceItemId;
          const worldItem = await Item.create(copyData);
          ui.notifications.info(`Efeito copiado como Item do Mundo: ${worldItem.name}`);
          return;
        } catch (err) {
          console.error('Wayfinder | failed to create world item fallback for dropped effect', err);
        }
        console.warn('Wayfinder | dropped active-effect could not be attached directly and actor not available:', dropped);
        ui.notifications.warn('Não foi possível associar o efeito: origem não suportada (compendium ou externo).');
        return;
      } catch (err) {
        console.error('Wayfinder | could not attach active-effect to item', err, dropped);
        ui.notifications.error('Não foi possível associar o efeito à arma. Veja o console para mais detalhes.');
        return;
      }
    }

    // Otherwise fallback to default handling
    return super._onDrop ? super._onDrop(event) : undefined;
  }

  /**
   * Submit form changes
   * @private
   */
  async _submitForm(event, { render = true } = {}) {
    if (!this.form) {
      console.warn('Form element not found');
      return;
    }
    // If a pending debounced save exists, clear it because we're performing an immediate save
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));
    try {
      if (render) {
        await this.document.update(updates);
      } else {
        // Avoid triggering a full re-render while typing
        await this.document.update(updates, { render: false });
      }
      console.debug('Wayfinder | _submitForm saved', { render, updates });
    } catch (err) {
      console.error('Wayfinder | _submitForm failed', err);
    }
  }
}
