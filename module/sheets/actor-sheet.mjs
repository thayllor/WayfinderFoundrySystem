/**
 * Extend the basic ActorSheet with some very simple modifications
 * Para V2, deve estender HandlebarsApplicationMixin(DocumentSheetV2)
 */
const { ApplicationV2, HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class WayfinderActorSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {

  // ...existing code...

  /**
   * Override close to ensure form data is saved before closing the sheet
   * @override
   */
  async close(options) {
    // Clean up document listeners installed by the sheet
    try {
      if (this._boundAttributeUpdate) Hooks.off('updateActor', this._boundAttributeUpdate);
    } catch (err) {
      // ignore
    }
    return super.close(options);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["wayfinder", "sheet", "actor"],
    position: {
      width: 1151,
      height: 751
    },
    window: {
      colorScheme: "light",
      resizable: true
    },
    actions: {
      onEditImage: WayfinderActorSheet._onEditImage,
      onItemCreate: WayfinderActorSheet._onItemCreate,
      onItemEdit: WayfinderActorSheet._onItemEdit,
      onItemDelete: WayfinderActorSheet._onItemDelete,
      onEffectCreate: WayfinderActorSheet._onEffectCreate,
      onEffectEdit: WayfinderActorSheet._onEffectEdit,
      onEffectDelete: WayfinderActorSheet._onEffectDelete,
      onEffectToggle: WayfinderActorSheet._onEffectToggle
    }
  };

  static _onEditImage(event) {
    const fp = new FilePicker({
      type: "image",
      current: this.document?.img,
      callback: (path) => {
        try {
          this.document.update({ img: path });
        } catch (err) {
          console.warn('Failed to update actor image', err);
        }
      },
      top: this.position?.top + 40,
      left: this.position?.left + 10
    });
    return fp.browse();
  }

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/wayfinder/templates/actor/actor-character-sheet.hbs"
    }
  };

  /** @override */
  tabGroups = {
    primary: "skills"
  };

  // Track the active tab to preserve it across renders
  activeTab = "skills";

  /** @override */
  get title() {
    return this.document?.name || "Actor";
  }

  /** Get the form element */
  get form() { return this.element?.querySelector('form'); }

  /** @override */
  async _prepareContext(options) {
    const context = {
      actor: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      items: Array.from(this.document.items),
      rollData: this.document.getRollData(),
      effects: this._prepareEffects(),
      editable: this.isEditable
    };

    // Prepare character data and items
    this._prepareCharacterData(context);
    this._prepareItems(context);

    // Calculate midpoint for skills division
    const skillsArray = Object.keys(context.system.skills || {});
    context.skillsMidpoint = Math.ceil(skillsArray.length / 2);

    // Provide explicit left/right skill arrays for templates to avoid complex helpers
    const skillEntries = Object.entries(context.system.skills || {});
    const midpoint = context.skillsMidpoint;
    context.skillsLeft = skillEntries.slice(0, midpoint).map(([k, s]) => ({ key: k, skill: s }));
    context.skillsRight = skillEntries.slice(midpoint).map(([k, s]) => ({ key: k, skill: s }));

    // Prepare effects (active and passive)
    context.activeEffects = this.document.items
      .filter(item => item.type === 'active-effect')
      .map(item => {
        const e = {
          _id: item._id,
          uuid: item.uuid || item._id,
          name: item.name,
          type: item.type,
          // Flatten commonly used properties for the collapsibleEffect helper
          range: String(item.system.range || ''),
          target: String(item.system.target || ''),
          duration: String(item.system.duration || ''),
          focusCost: item.system.focusCost || 0,
          requiresRoll: item.system.requiresRoll || false,
          isActive: item.system.isActive || false,
          isMagic: !!item.system.isMagic,
          magicCircle: item.system.magicCircle || null,
          traitsResolved: item.system.traitsResolved || item.system.traits || [],
          description: item.system.description || '',
          effect: item.system.effect || '',
          heightened: item.system.heightened || []
        };
        return e;
      });

    context.passiveEffects = this.document.items
      .filter(item => item.type === 'passive-effect')
      .map(item => {
        const e = {
          _id: item._id,
          uuid: item.uuid || item._id,
          name: item.name,
          type: item.type,
          effect: String(item.system.effect || ''),
          isPermanent: item.system.isPermanent !== false,
          isActive: item.system.isActive !== false,
          traitsResolved: item.system.traitsResolved || item.system.traits || [],
          description: item.system.description || ''
        };
        return e;
      });

    // Also include effects that are referenced by Talent items (by UUID), so they appear
    // in the global Effects tab even when stored as referenced documents inside talents.
    try {
      const talentItems = this.document.items.filter(i => i.type === 'talent');
      console.log('Wayfinder | _prepareContext: found', context.activeEffects.length, 'direct active effects and', context.passiveEffects.length, 'direct passive effects on actor');
      const seenEffectIds = new Set();
      // Mark existing effects as seen
      for (const e of context.activeEffects) if (e._id) seenEffectIds.add(e._id);
      for (const e of context.passiveEffects) if (e._id) seenEffectIds.add(e._id);

      for (const t of talentItems) {
        const uuids = Array.isArray(t.system.effects) ? t.system.effects : [];
        if (uuids.length) console.log(`Wayfinder | Talent ${t.name} references ${uuids.length} effect UUID(s)`);
        for (const uuid of uuids) {
          try {
            const doc = fromUuidSync(uuid);
            if (!doc) {
              console.warn('Wayfinder | fromUuidSync returned null for', uuid);
              continue;
            }
            const eid = doc._id || doc.id || uuid;
            if (seenEffectIds.has(eid)) {
              console.log('Wayfinder | skipping duplicate effect', eid);
              continue;
            }
            seenEffectIds.add(eid);

            if (doc.type === 'active-effect') {
              console.log('Wayfinder | adding referenced active-effect', doc.name, eid);
              context.activeEffects.push({
                _id: doc._id,
                uuid: uuid || doc._id,
                name: doc.name,
                type: doc.type,
                range: String(doc.system.range || ''),
                target: String(doc.system.target || ''),
                duration: String(doc.system.duration || ''),
                focusCost: doc.system.focusCost || 0,
                requiresRoll: doc.system.requiresRoll || false,
                isActive: doc.system.isActive || false,
                isMagic: !!doc.system.isMagic,
                magicCircle: doc.system.magicCircle || null,
                traitsResolved: doc.system.traitsResolved || doc.system.traits || [],
                description: doc.system.description || '',
                effect: doc.system.effect || '',
                heightened: doc.system.heightened || []
              });
            } else if (doc.type === 'passive-effect') {
              console.log('Wayfinder | adding referenced passive-effect', doc.name, eid);
              context.passiveEffects.push({
                _id: doc._id,
                uuid: uuid || doc._id,
                name: doc.name,
                type: doc.type,
                effect: String(doc.system.effect || ''),
                isPermanent: doc.system.isPermanent !== false,
                isActive: doc.system.isActive !== false,
                traitsResolved: doc.system.traitsResolved || doc.system.traits || [],
                description: doc.system.description || ''
              });
            } else {
              console.log('Wayfinder | referenced doc is not an effect:', doc.type, doc.name, uuid);
            }
          } catch (err) {
            console.warn('Erro ao resolver efeito referenciado pelo talento:', uuid, err);
          }
        }
      }
      console.log('Wayfinder | after resolving talents, activeEffects:', context.activeEffects.length, 'passiveEffects:', context.passiveEffects.length);
    } catch (err) {
      console.warn('Erro ao incluir efeitos referenciados por talentos:', err);
    }

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    return context;
  }

  /**
   * Move the sheet tabs outside of the window to the left side
   * This bypasses Foundry's overflow constraints
   */
  _moveTabsOutside(html) {
    const tabs = html.querySelector('.sheet-tabs');
    if (!tabs) return;

    // Remove any existing external tabs clone first to prevent duplicates
    const existingClone = document.querySelector('.tabs-external[data-sheet-id="' + this.id + '"]');
    if (existingClone) {
      existingClone.remove();
    }

    // Clone the tabs element and append to body so it escapes overflow
    const tabsClone = tabs.cloneNode(true);

    // Hide the original tabs inside the window
    tabs.style.display = 'none';

    // Setup the cloned tabs for positioning outside
    tabsClone.classList.add('tabs-external');
    tabsClone.classList.add('wayfinder');
    tabsClone.setAttribute('data-sheet-id', this.id);
    tabsClone.style.position = 'fixed';
    tabsClone.style.zIndex = '9999';
    tabsClone.style.display = 'flex';
    tabsClone.style.flexDirection = 'column';
    tabsClone.style.gap = '10px';
    tabsClone.style.padding = '10px 0';
    tabsClone.style.pointerEvents = 'all';
    tabsClone.style.width = '70px';

    // Add to body
    document.body.appendChild(tabsClone);

    // Position relative to the Foundry app position
    const updateTabsPosition = () => {
      // Use the Foundry app's position property
      const posX = this.position.left || 0;
      const posY = this.position.top || 0;
      const width = this.position.width || 1042;
      const height = this.position.height || 751;

      tabsClone.style.left = (posX - 80) + 'px';
      tabsClone.style.top = (posY + height / 2) + 'px';
      tabsClone.style.transform = 'translateY(-50%)';
    };

    // Update position initially
    updateTabsPosition();

    // Update position continuously (every frame) while the sheet exists
    const trackingInterval = setInterval(() => {
      if (!tabsClone.parentElement) {
        clearInterval(trackingInterval);
        return;
      }
      updateTabsPosition();
    }, 16); // ~60fps

    // Setup click handlers for the external tabs
    const tabButtons = tabsClone.querySelectorAll('.item');
    const originalTabButtons = html.querySelectorAll('.sheet-tabs .item');
    const tabContents = html.querySelectorAll('.sheet-body .tab');

    tabButtons.forEach((button, index) => {
      // Add tooltip with the tab name
      button.setAttribute('title', button.textContent.trim());

      button.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = button.dataset.tab;

        // Store the active tab to preserve it
        this.activeTab = tabName;
        this.tabGroups.primary = tabName;

        // Update external tabs active state
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update original tabs for internal state management
        originalTabButtons.forEach(btn => btn.classList.remove('active'));
        if (originalTabButtons[index]) {
          originalTabButtons[index].classList.add('active');
        }

        // Update tab content visibility - use .active class only
        tabContents.forEach(tab => {
          tab.classList.remove('active');
        });

        const activeTab = html.querySelector(`.sheet-body .tab[data-tab="${tabName}"]`);
        if (activeTab) {
          activeTab.classList.add('active');
        }
      });
    });

    // Set first tab as active by default
    if (tabButtons.length > 0) {
      tabButtons[0].classList.add('active');
    }

    // Clean up when the sheet is closed
    const cleanup = () => {
      clearInterval(trackingInterval);
      tabsClone.remove();
      observer.disconnect();
    };

    // Use MutationObserver to detect when window is removed from DOM
    const observer = new MutationObserver(() => {
      if (!document.contains(html)) {
        cleanup();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also check if element is hidden or removed from viewport
    this.addEventListener('close', cleanup);
  }

  /**
   * Organize and classify Items for Character sheets
   * @param {Object} actorData The actor to prepare
   * @return {undefined}
   */
  _prepareCharacterData(context) {
    // Handle ability scores e define default 0 para todos os campos de atributo
    for (let [k, v] of Object.entries(context.system.attributes)) {
      v.label = k;
      // Só define 0 se for undefined/null, não sobrescreve valor digitado
      if (v.value === undefined || v.value === null) v.value = 0;
      if (!v.proficiency) v.proficiency = "untrained";
      if (v.status === undefined || v.status === null) v.status = 0;
      if (v.circun === undefined || v.circun === null) v.circun = 0;
      if (v.item === undefined || v.item === null) v.item = 0;
      if (v.total === undefined || v.total === null) v.total = 0;
    }

    // Ensure skills have defaults and compute a displayed total similar to attribute defenses
    const skills = context.system.skills || {};
    const profMap = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
    const rawLevel = context.system.level?.value ?? context.system.level ?? 0;
    const level = Number(rawLevel) || 0;
    for (let [k, s] of Object.entries(skills)) {
      if (!s.proficiency) s.proficiency = 'untrained';
      if (s.status === undefined || s.status === null) s.status = 0;
      if (s.circun === undefined || s.circun === null) s.circun = 0;
      if (s.item === undefined || s.item === null) s.item = 0;

      // Resolve proficiency numeric value
      const profType = (s.proficiency || 'untrained').toString().toLowerCase();
      let profValue = 0;
      if (profType === 'untrained') profValue = 0;
      else profValue = (profMap[profType] ?? 0) + level;

      // Resolve attribute value referenced by the skill
      const ATTR_MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };
      let attrValue = 0;
      try {
        const attrRef = (s.attribute || '').toString().toUpperCase();
        const attrKey = ATTR_MAP[attrRef] || attrRef.toLowerCase();
        const attrObj = context.system.attributes?.[attrKey];
        attrValue = Number(attrObj?.value) || 0;
      } catch (e) {
        attrValue = 0;
      }

      const status = Number(s.status) || 0;
      const circun = Number(s.circun) || 0;
      const itemVal = Number(s.item) || 0;
      s.total = attrValue + profValue + status + circun + itemVal;
      // Store a textual formula for display/use by the UI
      s.formula = `${attrValue} + ${profValue} + ${circun} + ${itemVal} + ${status}`;
    }
  }

  /** @override */
  activateListeners(html) {
    if (super.activateListeners) super.activateListeners(html);

    // Recalculate skill totals live when any input in the skills tables changes
    this._skillInputHandler = this._skillInputHandler || this._onSkillInputChange.bind(this);
    const tables = html.querySelectorAll('.skills-table');
    for (const t of tables) t.addEventListener('change', this._skillInputHandler);
  }

  _onSkillInputChange(event) {
    const input = event.target;
    const row = input.closest('tr');
    if (!row) return;

    // Attempt to extract the skill key from the input name (system.skills.<key>....)
    const name = input.name || '';
    const parts = name.split('.');
    const key = parts.length >= 3 ? parts[2] : null;
    if (!key) return;

    // Helpers
    const ATTR_MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };
    const profMap = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };

    // Read values from the row
    const attrSelect = row.querySelector(`[name="system.skills.${key}.attribute"]`);
    const profSelect = row.querySelector(`[name="system.skills.${key}.proficiency"]`);
    const statusInput = row.querySelector(`[name="system.skills.${key}.status"]`);
    const circunInput = row.querySelector(`[name="system.skills.${key}.circun"]`);
    const itemInput = row.querySelector(`[name="system.skills.${key}.item"]`);

    const attrAbbrev = attrSelect?.value || '';
    const profType = (profSelect?.value || 'untrained').toString().toLowerCase();
    const status = Number(statusInput?.value) || 0;
    const circun = Number(circunInput?.value) || 0;
    const itemVal = Number(itemInput?.value) || 0;

    // Resolve numbers
    const rawLevel = this.document.system.level?.value ?? this.document.system.level ?? 0;
    const level = Number(rawLevel) || 0;
    const profValue = (profType === 'untrained') ? 0 : ((profMap[profType] || 0) + level);

    const attrKey = ATTR_MAP[attrAbbrev] || attrAbbrev.toLowerCase();
    const attrValue = Number(this.document.system.attributes?.[attrKey]?.value) || 0;

    const total = attrValue + profValue + status + circun + itemVal;

    // Update DOM
    const totalDiv = this.element.querySelector(`.attribute-total[data-skill-key="${key}"]`);
    if (totalDiv) {
      totalDiv.textContent = total;
      totalDiv.dataset.formula = `${attrValue} + ${profValue} + ${circun} + ${itemVal} + ${status}`;
    }
  }

  /**
   * Organize and classify Items for Character sheets
   * @param {Object} actorData The actor to prepare
   * @return {undefined}
   */
  _prepareItems(context) {
    // Initialize containers
    const gear = [];
    const features = [];
    const spells = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: []
    };
    const talents = {
      Basic: [],
      General: [],
      Ancestry: [],
      Class: []
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to features
      else if (i.type === 'feature') {
        features.push(i);
      }
      // Append to spells
      else if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) {
          spells[i.system.spellLevel].push(i);
        }
      }
      // Append to talents
      else if (i.type === 'talent') {
        const talentType = i.system.talentType || 'General';
        if (!talents[talentType]) talents[talentType] = [];

        // Resolve effects for this talent
        const activeEffects = [];
        const passiveEffects = [];

        if (Array.isArray(i.system.effects)) {
          for (const effectUuid of i.system.effects) {
            const effect = fromUuidSync(effectUuid);
            if (effect) {
              const effectData = {
                _id: effect._id,
                name: effect.name,
                type: effect.type
              };
              if (effect.type === 'active-effect') {
                activeEffects.push(effectData);
              } else if (effect.type === 'passive-effect') {
                passiveEffects.push(effectData);
              }
            }
          }
        }

        talents[talentType].push({
          _id: i.id || i._id,
          id: i.id || i._id,
          name: i.name,
          img: i.img,
          type: i.type,
          system: i.system,
          activeEffects,
          passiveEffects
        });
      }
    }

    // Assign and return
    context.gear = gear;
    context.features = features;
    context.spells = spells;
    context.talents = talents;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    console.log('Stamina values after render:', this.document?.system?.stamina);
    const html = this.element;

    // Restore the previously active tab
    this.tabGroups.primary = this.activeTab;

    // Move tabs outside the window to the left side
    this._moveTabsOutside(html);

    // Update pentagon triangle-down displays with current totals
    this._updatePentagonTotals = () => {
      try {
        const container = this.element?.querySelector('.attributes-pentagon');
        if (!container) return;
        const attributes = this.document?.system?.attributes || {};
        container.querySelectorAll('.pentagon-attribute').forEach(el => {
          const key = el.dataset.attributeKey;
          if (!key) return;
          const attr = attributes[key] || {};
          const total = (typeof attr.total === 'number') ? attr.total : (attr.value || 0);
          const span = el.querySelector('.triangle-down .attribute-value');
          if (span) span.textContent = String(total);
        });
      } catch (err) {
        console.warn('Error updating pentagon totals', err);
      }
    };

    // Initial populate
    this._updatePentagonTotals();

    // Listen for actor document updates so the UI updates live (use global Hook)
    if (this._boundAttributeUpdate) Hooks.off('updateActor', this._boundAttributeUpdate);
    this._boundAttributeUpdate = (actor, diff) => {
      try {
        if (!actor || actor.id !== this.document?.id) return;
        if (!diff || !diff.system) return;
        // If attributes changed, refresh the pentagon display
        if (diff.system.attributes) this._updatePentagonTotals();
      } catch (err) {
        console.warn('Error in boundAttributeUpdate hook', err);
      }
    };
    Hooks.on('updateActor', this._boundAttributeUpdate);

    // Handle tab switching
    const tabButtons = html.querySelectorAll('.sheet-tabs .item');
    const tabContents = html.querySelectorAll('.sheet-body .tab');

    // Restore the active tab visually on render
    if (this.activeTab) {
      tabButtons.forEach(btn => {
        if (btn.dataset.tab === this.activeTab) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      tabContents.forEach(tab => {
        if (tab.dataset.tab === this.activeTab) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // Also update external tabs
      const externalTabButtons = document.querySelectorAll(`.tabs-external[data-sheet-id="${this.id}"] .item`);
      externalTabButtons.forEach(btn => {
        if (btn.dataset.tab === this.activeTab) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = button.dataset.tab;

        // Store the active tab
        this.activeTab = tabName;
        this.tabGroups.primary = tabName;

        // Remove active class from all buttons and tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(tab => {
          tab.classList.remove('active');
        });

        // Add active class to clicked button
        button.classList.add('active');

        // Show the selected tab - use .sheet-body specifically
        const activeTab = html.querySelector(`.sheet-body .tab[data-tab="${tabName}"]`);
        if (activeTab) {
          activeTab.classList.add('active');
        }

        // Update external tabs too
        const externalTabButtons = document.querySelectorAll(`.tabs-external[data-sheet-id="${this.id}"] .item`);
        externalTabButtons.forEach(btn => {
          if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      });
    });

    // Bind click handlers to effect collapsible headers so they toggle their content
    const bindEffectToggles = () => {
      try {
        const headers = html.querySelectorAll('.effect-collapsible-header');
        headers.forEach(header => {
          // Remove previous handler if present
          if (header._wfEffectHandler) header.removeEventListener('click', header._wfEffectHandler);
          header._wfEffectHandler = (ev) => {
            ev.preventDefault();
            const h = ev.currentTarget;
            const content = h.nextElementSibling;
            if (!content) return;
            const isOpen = content.style.display === 'block' || content.classList.contains('open');
            if (isOpen) {
              content.style.display = 'none';
              content.classList.remove('open');
              const icon = h.querySelector('.effect-collapsible-icon'); if (icon) icon.style.transform = '';
            } else {
              content.style.display = 'block';
              content.classList.add('open');
              const icon = h.querySelector('.effect-collapsible-icon'); if (icon) icon.style.transform = 'rotate(90deg)';
            }
          };
          header.addEventListener('click', header._wfEffectHandler);
        });
      } catch (err) {
        console.warn('Wayfinder | error binding effect toggles', err);
      }
    };
    // Initial binding
    bindEffectToggles();

    // Render the item sheet for viewing/editing prior to the editable check
    html.addEventListener('click', (ev) => {
      if (ev.target.closest('.item-edit')) {
        const li = ev.target.closest(".item");
        const item = this.document.items.get(li.dataset.itemId);
        item.sheet.render(true);
      }
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Auto-save on change (match other sheets) - avoids blur/keydown loops
    // Special-case resource fields (stamina, surges, focus, heroPoints, exp)
    // to perform focused, dotted-key updates. This helps avoid races where
    // a full-form patch overwrites a freshly-typed value.
    html.addEventListener('change', async (ev) => {
      const input = ev.target;
      const name = input?.name;
      if (!name) return this._submitForm(ev);

      const isResourceField = (
        name.startsWith('system.stamina.') ||
        name.startsWith('system.surges.') ||
        name.startsWith('system.focus.') ||
        name.startsWith('system.heroPoints.') ||
        name === 'system.exp' || name.startsWith('system.exp')
      );

      if (isResourceField) {
        // General per-field debounce container
        this._resourceDebounce = this._resourceDebounce || {};
        const key = name;
        if (this._resourceDebounce[key]) clearTimeout(this._resourceDebounce[key]);
        this._resourceDebounce[key] = setTimeout(async () => {
          const raw = input.value;
          const value = raw === '' ? null : (isNaN(Number(raw)) ? raw : Number(raw));
          try {
            console.log('Direct resource update:', key, value);
            await this.document.update({ [key]: value }, { render: false });
            console.log('Direct resource update complete:', key);
          } catch (err) {
            console.error('Direct resource update error for', key, err);
          }
        }, 150);
        return;
      }

      this._submitForm(ev);
    });

    // Temporary diagnostic logging for stamina inputs (does NOT save)
    html.addEventListener('input', (ev) => {
      const input = ev.target;
      const name = input?.name;
      if (name && name.startsWith('system.stamina')) {
        console.log('Diagnostic input -', name, 'value:', input.value);
      }
    });

    // Also log on blur (capture) so we see the final value before change handler runs
    html.addEventListener('blur', (ev) => {
      const input = ev.target;
      const name = input?.name;
      if (name && name.startsWith('system.stamina')) {
        console.log('Diagnostic blur -', name, 'value:', input.value);
      }
    }, true);

    // Ensure clicking the portrait opens a FilePicker to choose an image
    try {
      const portrait = html.querySelector('[data-edit="img"]');
      if (portrait) {
        portrait.style.cursor = 'pointer';
        portrait.addEventListener('click', (ev) => {
          ev.preventDefault();
          try {
            const fp = new FilePicker({
              type: 'image',
              current: this.document?.img,
              callback: (path) => {
                try { this.document.update({ img: path }); } catch (e) { console.warn('Failed to update actor image', e); }
              },
              top: this.position?.top + 40,
              left: this.position?.left + 10
            });
            fp.browse();
          } catch (err) {
            console.warn('Error opening FilePicker', err);
          }
        });
      }
    } catch (err) {
      console.warn('Error binding portrait click', err);
    }

    // Click handler for attribute roll badges -> open dialog to collect components
    try {
      // Helper to construct a Dialog using V2 API when available
      const _makeDialog = (opts) => {
        const DialogClass = (typeof ApplicationV2 !== 'undefined' && ApplicationV2?.Dialog) ? ApplicationV2.Dialog : Dialog;
        const dlg = new DialogClass(opts);
        dlg.render(true);
        return dlg;
      };

      html.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.attribute-roll-badge');
        if (!btn) return;
        ev.preventDefault();
        try {
          const pent = btn.closest('.pentagon-attribute');
          const key = pent?.dataset?.attributeKey;
          if (!key) return;
          const attributes = this.document?.system?.attributes || {};
          const attr = attributes[key] || {};
          const attrValue = Number(attr.value) || 0;
          const displayName = String(key).charAt(0).toUpperCase() + String(key).slice(1);

          // Compute a sensible default for Prof from the attribute proficiency or general dropdown
          const profType = (attr.proficiency || this.document?.system?.generalProficiency || 'untrained').toString().toLowerCase();
          const profMap = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
          let profDefault = 0;
          if (profType === 'untrained') {
            profDefault = 0;
          } else {
            const rawLevel = this.document?.system?.level?.value ?? this.document?.system?.level ?? 0;
            const level = Number(rawLevel) || 0;
            const base = profMap[profType] ?? 0;
            profDefault = base + level;
          }

          // Build dialog content: allow user to fill Prof, Status, Circun, Item (numbers)
          const content = `
            <form>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                <div style="flex:1">
                  <label style="font-weight:700">Atributo</label>
                  <div style="padding:6px 8px;background:rgba(0,0,0,0.03);border-radius:6px">${displayName} (${attrValue})</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                <div>
                  <label>Prof (num)</label>
                  <input type="number" name="prof" value="${profDefault}" style="width:100%" />
                </div>
                <div>
                  <label>Status</label>
                  <input type="number" name="status" value="0" style="width:100%" />
                </div>
                <div>
                  <label>Circun</label>
                  <input type="number" name="circun" value="0" style="width:100%" />
                </div>
                <div>
                  <label>Item</label>
                  <input type="number" name="item" value="0" style="width:100%" />
                </div>
              </div>
              <p style="margin-top:8px;font-size:12px;color:var(--wayfinder-text-muted)">Preencha os valores vindos da tabela de Defenses; deixe 0 se não tiver.</p>
            </form>
          `;

          _makeDialog({
            title: `Rolagem: ${displayName}`,
            content: content,
            buttons: {
              roll: { label: 'Rolagem', callback: async (htmlDlg) => {
                try {
                  const dom = (htmlDlg && htmlDlg[0]) ? htmlDlg[0] : htmlDlg;
                  const form = dom.querySelector('form');
                  const fd = new FormData(form);
                  const prof = Number(fd.get('prof')) || 0;
                  const status = Number(fd.get('status')) || 0;
                  const circun = Number(fd.get('circun')) || 0;
                  const itemVal = Number(fd.get('item')) || 0;

                  const total = attrValue + prof + status + circun + itemVal;
                  const formula = `2d10 + ${total}`;

                  const roll = new Roll(formula, this.document.getRollData());
                  // Evaluate the roll asynchronously so terms that require async evaluation are supported
                  await roll.evaluate();

                  // dice results
                  let diceResults = '';
                  try {
                    diceResults = (roll.dice && roll.dice[0] && Array.isArray(roll.dice[0].results)) ? roll.dice[0].results.map(r => r.result).join(', ') : '';
                  } catch (e) { diceResults = ''; }
                  const finalTotal = roll.total ?? (roll._total ?? '');

                  const flavor = `
                    <div class="wf-roll-card" style="border-radius:12px;padding:14px;background:linear-gradient(180deg,var(--wayfinder-accent-light),#fff);color:var(--wayfinder-text);font-family: 'Montserrat', 'Playfair Display', serif;max-width:560px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 10px 24px rgba(0,0,0,0.12)">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                        <div style="flex:1;min-width:0">
                          <div style="background:var(--wayfinder-primary);color:#fff;padding:12px 14px;border-radius:10px;font-weight:800;font-size:18px;letter-spacing:0.4px;text-transform:capitalize">${displayName}</div>
                          <div style="margin-top:10px;font-size:13px;display:flex;gap:12px;flex-wrap:wrap">
                            <div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">ATR</div><div style="font-weight:800;font-size:16px">${attrValue}</div></div>
                            <div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Prof</div><div style="font-weight:800;font-size:16px">${prof}</div></div>
                            <div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Status</div><div style="font-weight:800;font-size:16px">${status}</div></div>
                            <div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Circun</div><div style="font-weight:800;font-size:16px">${circun}</div></div>
                            <div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Item</div><div style="font-weight:800;font-size:16px">${itemVal}</div></div>
                          </div>
                        </div>
                        <div style="width:104px;height:104px;border-radius:50%;background:var(--wayfinder-primary-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px">${finalTotal}</div>
                      </div>
                      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06);font-size:13px;display:flex;flex-direction:column;gap:8px">
                        <div><strong>Fórmula:</strong> <code style="background:rgba(0,0,0,0.04);padding:3px 6px;border-radius:4px">${formula}</code></div>
                        <div><strong>Dados:</strong> <span style="font-weight:700">${diceResults}</span></div>
                        <div><strong>Resultado:</strong> <span style="font-weight:900">${finalTotal}</span></div>
                      </div>
                    </div>
                  `;

                  await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor: this.document }),
                    flavor: flavor,
                    rollMode: game.settings.get('core', 'rollMode')
                  });
                } catch (err) {
                  console.warn('Erro na callback de rolagem do diálogo', err);
                }
              }},
              cancel: { label: 'Cancelar' }
            },
            default: 'roll'
          });

        } catch (err) {
          console.warn('Error opening attribute roll dialog', err);
        }
      });

      // Click handler for skill name -> open same dialog and roll using skill components
      html.addEventListener('click', async (ev) => {
        const nameEl = ev.target.closest('.skill-name');
        if (!nameEl) return;
        ev.preventDefault();
        try {
          // Skill key is the text content of the element (matches entry.key)
          const skillKey = String(nameEl.textContent || '').trim();
          if (!skillKey) return;

          // Locate the row and inputs
          const row = nameEl.closest('tr');
          if (!row) return;

          const attrSelect = row.querySelector(`[name="system.skills.${skillKey}.attribute"]`);
          const profSelect = row.querySelector(`[name="system.skills.${skillKey}.proficiency"]`);
          const statusInput = row.querySelector(`[name="system.skills.${skillKey}.status"]`);
          const circunInput = row.querySelector(`[name="system.skills.${skillKey}.circun"]`);
          const itemInput = row.querySelector(`[name="system.skills.${skillKey}.item"]`);

          const ATTR_MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };

          const attrAbbrev = (attrSelect?.value || '').toString().toUpperCase();
          const attrKey = ATTR_MAP[attrAbbrev] || attrAbbrev.toLowerCase();
          const attrValue = Number(this.document.system.attributes?.[attrKey]?.value) || 0;

          const profType = (profSelect?.value || 'untrained').toString().toLowerCase();
          const profMap = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
          const rawLevel = this.document?.system?.level?.value ?? this.document?.system?.level ?? 0;
          const level = Number(rawLevel) || 0;
          const profDefault = (profType === 'untrained') ? 0 : ((profMap[profType] || 0) + level);

          const status = Number(statusInput?.value) || 0;
          const circun = Number(circunInput?.value) || 0;
          const itemVal = Number(itemInput?.value) || 0;

          const displayName = skillKey;

          const content = `
            <form>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                <div style="flex:1">
                  <label style="font-weight:700">Perícia</label>
                  <div style="padding:6px 8px;background:rgba(0,0,0,0.03);border-radius:6px">${displayName} (${attrAbbrev} ${attrValue})</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                <div>
                  <label>Prof (num)</label>
                  <input type="number" name="prof" value="${profDefault}" style="width:100%" />
                </div>
                <div>
                  <label>Status</label>
                  <input type="number" name="status" value="${status}" style="width:100%" />
                </div>
                <div>
                  <label>Circun</label>
                  <input type="number" name="circun" value="${circun}" style="width:100%" />
                </div>
                <div>
                  <label>Item</label>
                  <input type="number" name="item" value="${itemVal}" style="width:100%" />
                </div>
              </div>
            </form>
          `;

          _makeDialog({
            title: `Rolagem: ${displayName}`,
            content: content,
            buttons: {
              roll: { label: 'Rolagem', callback: async (htmlDlg) => {
                try {
                  const dom = (htmlDlg && htmlDlg[0]) ? htmlDlg[0] : htmlDlg;
                  const form = dom.querySelector('form');
                  const fd = new FormData(form);
                  const prof = Number(fd.get('prof')) || 0;
                  const statusVal = Number(fd.get('status')) || 0;
                  const circunVal = Number(fd.get('circun')) || 0;
                  const itemVal2 = Number(fd.get('item')) || 0;

                  const total = attrValue + prof + statusVal + circunVal + itemVal2;
                  const formula = `2d10 + ${total}`;

                  const roll = new Roll(formula, this.document.getRollData());
                  await roll.evaluate();

                  let diceResults = '';
                  try { diceResults = (roll.dice && roll.dice[0] && Array.isArray(roll.dice[0].results)) ? roll.dice[0].results.map(r => r.result).join(', ') : ''; } catch (e) { diceResults = ''; }
                  const finalTotal = roll.total ?? (roll._total ?? '');

                  const flavor = `<div class="wf-roll-card" style="border-radius:12px;padding:14px;background:linear-gradient(180deg,var(--wayfinder-accent-light),#fff);color:var(--wayfinder-text);max-width:560px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 10px 24px rgba(0,0,0,0.12)">` +
                    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="flex:1;min-width:0"><div style="background:var(--wayfinder-primary);color:#fff;padding:12px 14px;border-radius:10px;font-weight:800;font-size:18px;text-transform:capitalize">${displayName}</div>` +
                    `<div style="margin-top:10px;font-size:13px;display:flex;gap:12px;flex-wrap:wrap">` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">ATR</div><div style="font-weight:800;font-size:16px">${attrValue}</div></div>` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Prof</div><div style="font-weight:800;font-size:16px">${prof}</div></div>` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Status</div><div style="font-weight:800;font-size:16px">${statusVal}</div></div>` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Circun</div><div style="font-weight:800;font-size:16px">${circunVal}</div></div>` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Item</div><div style="font-weight:800;font-size:16px">${itemVal2}</div></div>` +
                    `</div></div><div style="width:104px;height:104px;border-radius:50%;background:var(--wayfinder-primary-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px">${finalTotal}</div></div>` +
                    `<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06);font-size:13px;display:flex;flex-direction:column;gap:8px"><div><strong>Fórmula:</strong> <code style="background:rgba(0,0,0,0.04);padding:3px 6px;border-radius:4px">${formula}</code></div><div><strong>Dados:</strong> <span style="font-weight:700">${diceResults}</span></div><div><strong>Resultado:</strong> <span style="font-weight:900">${finalTotal}</span></div></div></div>`;

                  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: flavor, rollMode: game.settings.get('core', 'rollMode') });
                } catch (err) {
                  console.warn('Erro na callback de rolagem da perícia', err);
                }
              }},
              cancel: { label: 'Cancelar' }
            },
            default: 'roll'
          });

        } catch (err) {
          console.warn('Error opening skill roll dialog', err);
        }
      });
    } catch (err) {
      console.warn('Error binding attribute roll handler', err);
    }

    // Add Inventory Item
    html.addEventListener('click', (ev) => {
      if (ev.target.closest('.item-create')) {
        this._onItemCreate(ev);
      }
    });

    // Delete Inventory Item
    html.addEventListener('click', (ev) => {
      if (ev.target.closest('.item-delete')) {
        const li = ev.target.closest(".item");
        const item = this.document.items.get(li.dataset.itemId);
        item.delete();
        li.slideUp(200); // Foundry auto-renders on delete
      }
    });

    // Rollable abilities
    html.addEventListener('click', (ev) => {
      if (ev.target.closest('.rollable')) {
        this._onRoll(ev);
      }
    });

    // Drag events for macros
    if (this.document.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.querySelectorAll('li.item').forEach((li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }

    // Setup collapsible talents
    this._setupTalentsCollapsible(html);

    // Effect handlers - Remove old listener if exists
    if (this._boundEffectClick) {
      html.removeEventListener('click', this._boundEffectClick);
    }

    this._boundEffectClick = (ev) => {
      // Activate active effect
      if (ev.target.closest('.effect-activate')) {
        ev.preventDefault();
        ev.stopPropagation();
        const effectId = ev.target.closest('.effect-activate').dataset.effectId;
        this._onActivateEffect(effectId);
      }
      // Toggle passive effect
      if (ev.target.closest('.effect-toggle')) {
        ev.preventDefault();
        ev.stopPropagation();
        const effectId = ev.target.closest('.effect-toggle').dataset.effectId;
        this._onTogglePassiveEffect(effectId);
      }
      // View effect details
      if (ev.target.closest('.effect-view')) {
        ev.preventDefault();
        ev.stopPropagation();
        const effectId = ev.target.closest('.effect-view').dataset.effectId;
        const item = this.document.items.get(effectId);
        if (item) item.sheet.render(true);
      }
      // Delete effect
      if (ev.target.closest('.effect-delete')) {
        ev.preventDefault();
        ev.stopPropagation();
        const effectId = ev.target.closest('.effect-delete').dataset.effectId;
        const item = this.document.items.get(effectId);
        if (item) {
          // The activeTab property will preserve the current tab during re-render
          item.delete();
        }
      }
    };

    html.addEventListener('click', this._boundEffectClick);

    // Drop handler for effects
    // Remove old listeners if they exist to prevent duplicates
    if (this._boundDragOver) {
      html.removeEventListener('dragover', this._boundDragOver);
    }
    if (this._boundDrop) {
      html.removeEventListener('drop', this._boundDrop);
    }

    // Bind new listeners
    this._boundDragOver = (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    };

    this._boundDrop = (ev) => {
      ev.preventDefault();
      this._onDrop(ev);
    };

    html.addEventListener('dragover', this._boundDragOver);
    html.addEventListener('drop', this._boundDrop);
  }

  /**
   * Setup collapsible talent categories and individual talents
   * @private
   */
  _setupTalentsCollapsible(html) {
    // Setup talent type category toggles
    const typeHeaders = html.querySelectorAll('.talent-type-header');
    typeHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        e.preventDefault();
        const content = header.nextElementSibling;
        const icon = header.querySelector('.talent-type-icon');

        if (content.style.display === 'none') {
          content.style.display = 'block';
          icon.style.transform = 'rotate(90deg)';
        } else {
          content.style.display = 'none';
          icon.style.transform = 'rotate(0deg)';
        }
      });
    });

    // Setup individual talent item toggles
    const talentHeaders = html.querySelectorAll('.talent-item-header');
    console.log('Found talent headers:', talentHeaders.length);
    talentHeaders.forEach(header => {
      header.addEventListener('click', async (e) => {
        console.log('Talent header clicked!', e.target);
        // Don't toggle if clicking on edit/delete buttons
        if (e.target.closest('.talent-edit-btn') || e.target.closest('.talent-delete-btn')) {
          console.log('Click was on button, ignoring');
          return;
        }

        e.preventDefault();
        const content = header.nextElementSibling;
        const icon = header.querySelector('.talent-item-icon');
        const itemId = header.dataset.talentId;
        console.log('Toggling talent:', itemId, 'Current display:', content.style.display);

        if (content.style.display === 'none') {
          // Expand and render content if empty
          if (!content.hasChildNodes() || content.children.length === 0) {
            console.log('Content is empty, rendering...');
            const item = this.document.items.get(itemId);
            console.log('Got item:', item);
            if (item && item.type === 'talent') {
              // Render the talent template content
              const talentHtml = await this._renderTalentContent(item);
              console.log('Rendered HTML length:', talentHtml.length);
              content.innerHTML = talentHtml;

              // Setup collapsible effect headers in the newly rendered content
              const effectHeaders = content.querySelectorAll('.effect-collapsible-header');
              console.log('Found effect headers:', effectHeaders.length);
              effectHeaders.forEach(effectHeader => {
                effectHeader.addEventListener('click', (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const effectId = effectHeader.dataset.effectId;
                  const effectContent = content.querySelector(`#${effectId}`);
                  const effectIcon = effectHeader.querySelector('.effect-collapsible-icon');

                  if (effectContent) {
                    const isOpen = effectContent.style.display !== 'none';
                    effectContent.style.display = isOpen ? 'none' : 'block';
                    if (effectIcon) {
                      effectIcon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                  }
                });
              });
            }
          }
          content.style.display = 'block';
          icon.style.transform = 'rotate(90deg)';
          console.log('Expanded talent');
        } else {
          content.style.display = 'none';
          icon.style.transform = 'rotate(0deg)';
        }
      });
    });

    // Setup edit buttons
    const editBtns = html.querySelectorAll('.talent-edit-btn');
    console.log('Found edit buttons:', editBtns.length);
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        console.log('Edit button clicked!');
        e.stopPropagation();
        e.preventDefault();
        const itemId = btn.dataset.itemId;
        console.log('Item ID:', itemId);
        const item = this.document.items.get(itemId);
        console.log('Item found:', item);
        if (item) item.sheet.render(true);
      });
    });

    // Setup delete buttons
    const deleteBtns = html.querySelectorAll('.talent-delete-btn');
    console.log('Found delete buttons:', deleteBtns.length);
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        console.log('Delete button clicked!');
        e.stopPropagation();
        e.preventDefault();
        const itemId = btn.dataset.itemId;
        const item = this.document.items.get(itemId);
        if (item) {
          const DialogClass = (typeof ApplicationV2 !== 'undefined' && ApplicationV2?.Dialog) ? ApplicationV2.Dialog : Dialog;
          DialogClass.confirm({
            title: `Remover ${item.name}`,
            content: `<p>Tem certeza que deseja remover este talento?</p>`,
            yes: () => item.delete(),
            no: () => {}
          });
        }
      });
    });
  }

  /**
   * Render talent content for display in actor sheet
   * @private
   */
  async _renderTalentContent(item) {
    // Prepare talent data similar to talent sheet
    const activeEffects = [];
    const passiveEffects = [];

    // Resolve effects
    for (const uuid of item.system.effects || []) {
      try {
        const doc = await fromUuid(uuid);
        if (doc) {
          // Resolve traits for this effect
          const traitsResolvedEffect = [];
          for (const traitUuid of doc.system?.traits || []) {
            try {
              const trait = await fromUuid(traitUuid);
              if (trait) {
                traitsResolvedEffect.push({
                  uuid: traitUuid,
                  name: trait.name,
                  color: trait.system?.color || '#666666'
                });
              }
            } catch (err) {
              console.warn('Erro ao resolver trait:', traitUuid, err);
            }
          }

          const effectData = {
            _id: doc.id,
            uuid: uuid,
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
            isActive: doc.system?.isActive !== false,
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
        console.warn('Erro ao resolver efeito:', uuid, err);
      }
    }

    // Resolve traits for talent
    const traitsResolved = [];
    for (const traitUuid of item.system?.traits || []) {
      try {
        const trait = await fromUuid(traitUuid);
        if (trait) {
          traitsResolved.push({
            uuid: traitUuid,
            name: trait.name,
            color: trait.system?.color || '#666666'
          });
        }
      } catch (err) {
        console.warn('Erro ao resolver trait:', traitUuid, err);
      }
    }

    // Build HTML for talent content (read-only version)
    let html = '';

    // Traits Section
    if (traitsResolved.length) {
      html += '<div class="trait-chip-row">';
      html += '<span class="trait-chip-label">Traits:</span>';
      for (const trait of traitsResolved) {
        html += `<div class="trait-chip" style="background-color: ${trait.color};" title="${trait.name}">`;
        html += `<span class="trait-chip-name">${trait.name}</span>`;
        html += '</div>';
      }
      html += '</div>';
    }

    // Description Section
    if (item.system.description) {
      html += '<div class="talent-description-section">';
      html += '<div class="description-card">';
      html += '<div class="description-card-header">';
      html += '<div class="description-card-title"><i class="fas fa-file-alt"></i> Descrição do Talent</div>';
      html += '</div>';
      html += `<div class="talent-description-readonly">${item.system.description}</div>`;
      html += '</div>';
      html += '</div>';
    }

    // Effects Section
    html += '<div class="talent-effects-section">';

    // Active Effects
    if (activeEffects.length) {
      html += '<div class="effects-category active-effects-category">';
      html += '<h3 class="effects-title active-title">';
      html += '<i class="fas fa-bolt"></i> Efeitos Ativos';
      html += `<span class="effect-count">${activeEffects.length}</span>`;
      html += '</h3>';
      html += '<div class="effects-list">';
      for (let i = 0; i < activeEffects.length; i++) {
        html += `<div class="effect-item active-effect-item" data-uuid="${activeEffects[i].uuid}">`;
        html += Handlebars.helpers.collapsibleEffect({ hash: { effect: activeEffects[i], idx: i } });
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    // Passive Effects
    if (passiveEffects.length) {
      html += '<div class="effects-category passive-effects-category">';
      html += '<h3 class="effects-title passive-title">';
      html += '<i class="fas fa-shield-alt"></i> Efeitos Passivos';
      html += `<span class="effect-count">${passiveEffects.length}</span>`;
      html += '</h3>';
      html += '<div class="effects-list">';
      for (let i = 0; i < passiveEffects.length; i++) {
        html += `<div class="effect-item passive-effect-item" data-uuid="${passiveEffects[i].uuid}">`;
        html += Handlebars.helpers.collapsibleEffect({ hash: { effect: passiveEffects[i], idx: i } });
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';

    return html;
  }

  // Submit functionality removed for actor sheet per user request.
  async _submitForm(event, { render = true } = {}) {
    if (!this.form) return;
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));

    const fdEntries = Array.from(formData.entries());
    const staminaEntries = fdEntries.filter(([k]) => k.startsWith('system.stamina'));
    console.log('FormData entries count:', fdEntries.length);
    console.log('Stamina entries in FormData:', staminaEntries);
    console.log('Current document stamina before update:', this.document.system?.stamina);
    try {
      console.log('Updates before sanitize:', JSON.stringify(updates, null, 2));
    } catch (e) {
      console.log('Updates before sanitize (non-serializable) - keys:', Object.keys(updates || {}));
    }

    // Sanitize updates: convert numeric strings to Number and remove empty-string leaves
    const sanitize = (obj) => {
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v === '') {
            // Remove empty strings so we don't overwrite existing values with blanks
            delete obj[k];
            continue;
          }
          if (typeof v === 'string') {
            // Normalize proficiency strings to lowercase for consistency
            if (k === 'proficiency') {
              obj[k] = v.toLowerCase();
              continue;
            }
            // If string represents a number, convert it
            const n = Number(v);
            if (!Number.isNaN(n) && v.trim() !== '') obj[k] = n;
          } else if (typeof v === 'object' && v !== null) {
            sanitize(v);
            // Remove empty objects (no keys)
            if (Object.keys(v).length === 0) delete obj[k];
          }
        }
      }
    };

    sanitize(updates);
    try {
      console.log('Sanitized updates to be applied:', JSON.stringify(updates, null, 2));
    } catch (e) {
      console.log('Sanitized updates to be applied (non-serializable) - keys:', Object.keys(updates || {}));
    }

    // Build a patch object. For stamina and other resource blocks, prefer dotted keys
    const patch = {};
    // Copy top-level keys except `system` (we'll handle system specially)
    for (const k of Object.keys(updates || {})) {
      if (k !== 'system') patch[k] = updates[k];
    }

    // Handle system updates: flatten stamina/surges/focus/heroPoints to dotted keys
    if (updates.system) {
      // Copy other system keys shallowly
      for (const sk of Object.keys(updates.system)) {
        if (!['stamina', 'surges', 'focus', 'heroPoints'].includes(sk)) {
          patch['system'] = patch['system'] || {};
          patch['system'][sk] = updates.system[sk];
        }
      }

      if (updates.system.stamina) {
        const s = updates.system.stamina;
        if (s.current !== undefined) patch['system.stamina.current'] = s.current;
        if (s.maximum !== undefined) patch['system.stamina.maximum'] = s.maximum;
        if (s.temporary !== undefined) patch['system.stamina.temporary'] = s.temporary;
      }
      if (updates.system.surges) {
        const s = updates.system.surges;
        if (s.current !== undefined) patch['system.surges.current'] = s.current;
        if (s.maximum !== undefined) patch['system.surges.maximum'] = s.maximum;
      }
      if (updates.system.focus) {
        const f = updates.system.focus;
        if (f.current !== undefined) patch['system.focus.current'] = f.current;
      }
      if (updates.system.heroPoints) {
        const h = updates.system.heroPoints;
        if (h.current !== undefined) patch['system.heroPoints.current'] = h.current;
      }
    }

    try {
      console.log('Final patch sent to document.update:', patch);
      const res = await this.document.update(patch, { render });
      console.log('document.update result:', res);
    } catch (err) {
      console.error('Erro ao atualizar actor:', err);
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget.closest('[data-type]');
    // Get the type of item to create
    const type = header.dataset.type;
    // Grab any data associated with this control
    const data = foundry.utils.deepClone(header.dataset);
    // Initialize a default name
    const name = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    // Prepare the item object
    const itemData = {
      name: name,
      type: type,
      system: data
    };
    // Remove the type from the dataset since it's in the itemData.type prop
    delete itemData.system["type"];

    // Finally, create the item!
    return await this.document.createEmbeddedDocuments('Item', [itemData]);
  }

  /**
   * Handle clickable rolls
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.document.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.document.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  /**
   * Prepare the list of active effects
   * @returns {Array} The list of prepared effects
   */
  _prepareEffects() {
    // Define effect categories
    const categories = {
      temporary: {
        type: 'temporary',
        label: 'Temporary Effects',
        effects: []
      },
      passive: {
        type: 'passive',
        label: 'Passive Effects',
        effects: []
      },
      inactive: {
        type: 'inactive',
        label: 'Inactive Effects',
        effects: []
      }
    };

    // Iterate over active effects, classifying them into categories
    for (let e of this.document.effects) {
      if (e.disabled) categories.inactive.effects.push(e);
      else if (e.isTemporary) categories.temporary.effects.push(e);
      else categories.passive.effects.push(e);
    }

    return categories;
  }

  /**
   * Handle activating an active effect
   * @param {string} effectId The ID of the effect to activate
   * @private
   */
  async _onActivateEffect(effectId) {
    const effect = this.document.items.get(effectId);
    if (!effect || effect.type !== 'active-effect') return;

    const focusCost = effect.system.focusCost || 0;
    const currentFocus = this.document.system.focus.current || 0;

    // Check if actor has enough focus
    if (focusCost > currentFocus) {
      ui.notifications.warn(`Insuficiente Foco! Necessário: ${focusCost}, Disponível: ${currentFocus}`);
      return;
    }

    // Deduct focus cost if applicable
    if (focusCost > 0) {
      await this.document.update({
        'system.focus.current': currentFocus - focusCost
      });
    }

    // Send to chat if specified
    if (effect.system.chatEffect) {
      const speaker = ChatMessage.getSpeaker({ actor: this.document });
      const chatContent = `
        <div class="effect-activation">
          <h3 style="color: #2d5016; margin: 10px 0;">${effect.name}</h3>
          <p>${effect.system.chatEffect}</p>
          ${effect.system.requiresRoll ? `<p style="font-weight: bold; color: #1e4d6b;">Roll requerido: ${effect.system.rollFormula}</p>` : ''}
        </div>
      `;

      await ChatMessage.create({
        speaker: speaker,
        content: chatContent,
        flavor: `Efeito Ativo: ${effect.name}`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      });
    }

    // Perform roll if required
    if (effect.system.requiresRoll && effect.system.rollFormula) {
      try {
        const roll = new Roll(effect.system.rollFormula, this.document.getRollData());
        await roll.evaluate();

        const speaker = ChatMessage.getSpeaker({ actor: this.document });
        await roll.toMessage({
          speaker: speaker,
          flavor: `${effect.name} - Roll`
        });
      } catch (err) {
        console.error('Erro ao fazer roll do efeito:', err);
        ui.notifications.error('Erro ao fazer roll do efeito');
      }
    }

    // Mark effect as active temporarily
    await effect.update({ 'system.isActive': true });
    // Foundry auto-renders on update
  }

  /**
   * Handle toggling a passive effect
   * @param {string} effectId The ID of the effect to toggle
   * @private
   */
  async _onTogglePassiveEffect(effectId) {
    const effect = this.document.items.get(effectId);
    if (!effect || effect.type !== 'passive-effect') return;

    const currentState = effect.system.isActive || false;

    // Toggle the effect
    await effect.update({ 'system.isActive': !currentState });

    // Send message to chat
    const speaker = ChatMessage.getSpeaker({ actor: this.document });
    const statusText = !currentState ? 'ativado' : 'desativado';

    await ChatMessage.create({
      speaker: speaker,
      content: `<div class="effect-toggle" style="color: #1e4d6b;"><strong>${effect.name}</strong> foi ${statusText}.</div>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    // Foundry auto-renders on update
  }

  /**
   * Handle dropping items onto the sheet
   * @param {DragEvent} event The drop event
   * @private
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    // Only handle Item drops
    if (data.type !== 'Item') return;

    // Get the dropped item from UUID
    const item = await fromUuid(data.uuid);
    if (!item) return;

    // Only allow active-effect, passive-effect, and talent types to be added
    if (!['active-effect', 'passive-effect', 'talent'].includes(item.type)) {
      return;
    }

    // Create a copy of the item data for embedding in this actor
    const itemData = item.toObject();

    // Remove the UUID to let Foundry generate a new one
    delete itemData._id;

    // Add to actor as embedded document
    try {
      const created = await this.document.createEmbeddedDocuments('Item', [itemData]);
      const typeName = item.type === 'talent' ? 'Talento' : 'Efeito';
      ui.notifications.info(`${item.name} adicionado como ${typeName}.`);
      // The activeTab property will preserve the current tab during auto-render
    } catch (error) {
      console.error('Erro ao adicionar item:', error);
      ui.notifications.error('Erro ao adicionar item.');
    }
  }
}
