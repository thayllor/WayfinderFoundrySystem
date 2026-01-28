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

    // Ensure language / proficiency arrays exist to avoid template errors
    context.system.languages = Array.isArray(context.system.languages) ? context.system.languages : [];
    context.system.proficiencies = context.system.proficiencies || {};
    context.system.proficiencies.weapons = Array.isArray(context.system.proficiencies.weapons) ? context.system.proficiencies.weapons : [];
    context.system.proficiencies.armors = Array.isArray(context.system.proficiencies.armors) ? context.system.proficiencies.armors : [];

    // Provide labelled choices for weapons and armors and filter out already-selected ones
    const ALL_WEAPONS = [
      { key: 'crossbow', label: 'Besta' },
      { key: 'dart', label: 'Dardo' },
      { key: 'fetish', label: 'Fetiche' },
      { key: 'flail', label: 'Mangual' },
      { key: 'hammer', label: 'Martelo' },
      { key: 'rod', label: 'Cajado' },
      { key: 'knife', label: 'Faca' },
      { key: 'pick', label: 'Picareta' },
      { key: 'polearm', label: 'Haste' },
      { key: 'shield', label: 'Escudo' },
      { key: 'sling', label: 'Funda' },
      { key: 'spear', label: 'Lança' },
      { key: 'sword', label: 'Espada' },
      { key: 'axe', label: 'Machado' }
    ];
    const ALL_ARMORS = [
      { key: 'light', label: 'Leve' },
      { key: 'medium', label: 'Média' },
      { key: 'heavy', label: 'Pesada' }
    ];

    const selectedWeapons = Array.isArray(context.system.proficiencies.weapons) ? context.system.proficiencies.weapons : [];
    const selectedArmors = Array.isArray(context.system.proficiencies.armors) ? context.system.proficiencies.armors : [];

    context.availableWeapons = ALL_WEAPONS.filter(w => !selectedWeapons.includes(w.key));
    context.availableArmors = ALL_ARMORS.filter(a => !selectedArmors.includes(a.key));

    // Prepare character data and items
    this._prepareCharacterData(context);
    await this._prepareItems(context);

    // Calculate midpoint for skills division
    const skillsArray = Object.keys(context.system.skills || {});
    context.skillsMidpoint = Math.ceil(skillsArray.length / 2);

    // Provide explicit left/right skill arrays for templates to avoid complex helpers
    const skillEntries = Object.entries(context.system.skills || {});
    const midpoint = context.skillsMidpoint;
    context.skillsLeft = skillEntries.slice(0, midpoint).map(([k, s]) => ({ key: k, skill: s }));
    context.skillsRight = skillEntries.slice(midpoint).map(([k, s]) => ({ key: k, skill: s }));

    // Prepare basic spell / casting context
    // Ensure a system.spell object exists
    context.system.spell = context.system.spell || {};
    // Provide defaults
    const spellSys = context.system.spell;
    // Casting attribute abbreviation (STR/DEX/INT/WIS/PRE)
    const castAttr = spellSys.attribute || 'PRE';
    const ATTR_MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };
    // Resolve proficiency for spells: accept either a category string or a numeric bonus
    const PROF_MAP = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
    const profRaw = spellSys.prof ?? spellSys.profBonus;
    const levelValue = Number(context.system.level?.value ?? context.system.level ?? 0) || 0;
    let profBonus = 0;
    if (typeof profRaw === 'string') {
      const key = profRaw.toString().toLowerCase();
      const base = PROF_MAP[key] ?? 0;
      profBonus = (base > 0) ? (base + levelValue) : 0;
    } else {
      const num = Number(profRaw || 0) || 0;
      profBonus = (num > 0) ? (num + levelValue) : 0;
    }
    // Spell DC if explicitly set, otherwise attempt a simple fallback
    // Resolve attribute numeric value for spell calculations (prefer .total then .value)
    let spellAttrValue = 0;
    try {
      const attrKey = ATTR_MAP[castAttr?.toString?.().toUpperCase()] || (castAttr || '').toString().toLowerCase();
      const aobj = context.system.attributes?.[attrKey];
      spellAttrValue = Number(aobj?.value ?? 0) || 0;
    } catch (e) {
      spellAttrValue = 0;
    }
    const spellDC = spellSys.dc !== undefined ? spellSys.dc : (profBonus + spellAttrValue + 10);

    // Compute casting modifier: (circ + item + bonus + prof) + attribute value
    const circ = Number(spellSys.circ || 0) || 0;
    const itemMod = Number(spellSys.item || 0) || 0;
    const prof = profBonus;
    const attrValue = spellAttrValue;
    const status = Number(spellSys.status || 0) || 0;
    // Casting modifier should be: prof + circ + itemMod + status + attribute
    const castingModifier = prof + circ + itemMod + status + attrValue;

    context.spell = {
      castingAttribute: castAttr,
      prof: spellSys.prof || null,
      profBonus,
      spellDC,
      castingModifier
    };

    // Ensure spells container exists (from earlier _prepareItems)
    context.spells = context.spells || {0: [], 1: [], 2: []};

    // Prepare effects (active and passive) from both Item-stored effects and
    // embedded ActiveEffect documents on the Actor. This ensures ActiveEffects
    // that were created programmatically (e.g. from embedded item modifiers)
    // appear in the sheet's Effects tab.
    context.activeEffects = [];
    context.passiveEffects = [];
    // Separate collections for UI: effects coming from Talent references vs Item-stored effects
    context.itemActiveEffects = [];
    context.itemPassiveEffects = [];
    context.talentActiveEffects = [];
    context.talentPassiveEffects = [];
    // Separate collections for spell-type talents' effects
    context.talentSpellActiveEffects = [];
    context.talentSpellPassiveEffects = [];

    // First include any Item-based active/passive effect documents
    const itemActive = this.document.items
      .filter(item => item.type === 'active-effect')
      .map(item => ({
        _id: item._id,
        uuid: item.uuid || item._id,
        name: item.name,
        type: item.type,
        range: String(item.system.range || ''),
        target: String(item.system.target || ''),
        duration: String(item.system.duration || ''),
            focusCost: item.system.focusCost || 0,
            actionCost: item.system.actionCost || item.system.actions || '',
        requiresRoll: item.system.requiresRoll || false,
        isActive: item.system.isActive || false,
        isMagic: !!item.system.isMagic,
        magicCircle: item.system.magicCircle || null,
        traitsResolved: item.system.traitsResolved || item.system.traits || [],
        description: item.system.description || '',
        effect: item.system.effect || '',
        heightened: item.system.heightened || []
      }));
    const itemPassive = this.document.items
      .filter(item => item.type === 'passive-effect')
      .map(item => ({
        _id: item._id,
        uuid: item.uuid || item._id,
        name: item.name,
        type: item.type,
        effect: String(item.system.effect || ''),
        isPermanent: item.system.isPermanent !== false,
        isActive: item.system.isActive !== false,
        traitsResolved: item.system.traitsResolved || item.system.traits || [],
        description: item.system.description || ''
      }));

    // Keep item-based effects separate for the new two-part Effects tab
    context.itemActiveEffects.push(...itemActive);
    context.itemPassiveEffects.push(...itemPassive);
    // Also include them in the legacy active/passive lists so other code stays compatible
    context.activeEffects.push(...itemActive);
    context.passiveEffects.push(...itemPassive);

    // Also include any embedded effects stored on arbitrary items (e.g. weapons)
    try {
      for (const item of this.document.items) {
        const embedded = Array.isArray(item.flags?.wayfinder?.embeddedEffects) ? item.flags.wayfinder.embeddedEffects : null;
        if (!embedded) continue;
        for (const ef of embedded) {
          const systemData = ef.system || {};
          const effectObj = {
            _id: ef._id || ef.id || `${item._id}::${ef.uuid || ef.name}`,
            uuid: ef.uuid || ef._id || ef.id || null,
            name: ef.name || ef.label || `${item.name} - ${ef.name || ef.label || 'Effect'}`,
            type: ef.type || systemData.type || 'active-effect',
            range: String(ef.range ?? systemData.range ?? ''),
            target: String(ef.target ?? systemData.target ?? ''),
            duration: String(ef.duration ?? systemData.duration ?? ''),
            focusCost: ef.focusCost ?? systemData.focusCost ?? 0,
            actionCost: ef.actionCost ?? systemData.actionCost ?? systemData.actions ?? '',
            requiresRoll: ef.requiresRoll ?? systemData.requiresRoll ?? false,
            isActive: ef.isActive ?? (systemData.isActive !== false),
            isMagic: ef.isMagic ?? !!systemData.isMagic,
            magicCircle: ef.magicCircle ?? systemData.magicCircle ?? null,
            traitsResolved: ef.traitsResolved ?? systemData.traitsResolved ?? systemData.traits ?? [],
            description: ef.description ?? systemData.description ?? '',
            effect: ef.effect ?? systemData.effect ?? '',
            heightened: ef.heightened ?? systemData.heightened ?? [],
            system: systemData,
            sourceItemId: item._id,
            sourceItemName: item.name
          };

          if (effectObj.type === 'passive-effect') {
            context.itemPassiveEffects.push(effectObj);
            context.passiveEffects.push(effectObj);
          } else {
            context.itemActiveEffects.push(effectObj);
            context.activeEffects.push(effectObj);
          }
        }
      }
    } catch (err) {
      console.warn('Wayfinder | error including embedded effects from items', err);
    }

    // Then include embedded ActiveEffect documents from the Actor itself,
    // avoiding duplicates by _id.
    try {
      const existingIds = new Set(context.activeEffects.filter(e => e._id).map(e => e._id));
      // Collect any ActiveEffects that originate from Item modifiers so we can
      // represent them separately in `context.modifiers` instead of showing
      // them in the main Effects tab.
      const effectsFromItems = [];
      for (const ef of this.document.effects) {
        const eid = ef.id || ef._id;
        if (!eid) continue;
        if (existingIds.has(eid)) continue;
        existingIds.add(eid);

        const srcItemId = ef.flags?.wayfinder?.sourceItemId;
        if (srcItemId) {
          // Extract a simple modifier representation from the ActiveEffect
          const change = Array.isArray(ef.changes) && ef.changes.length ? ef.changes[0] : null;
          const value = change ? (isNaN(Number(change.value)) ? change.value : Number(change.value)) : 0;
          // Resolve originating item name for a friendly source label
          let sourceLabel = `Item (${srcItemId})`;
          try {
            const srcItem = this.document.items.get(srcItemId);
            if (srcItem) sourceLabel = `Item: ${srcItem.name}`;
          } catch (e) {
            // ignore
          }
          effectsFromItems.push({
            _id: ef.id || ef._id,
            uuid: ef.uuid || ef.id || ef._id,
            name: ef.label || ef.name || 'Modifier',
            type: 'modifier',
            pillar: ef.flags?.wayfinder?.pillar || 'item',
            value: value,
            description: ef.flags?.wayfinder?.description || ef.description || '',
            sourceItemId: srcItemId,
            sourceLabel: sourceLabel,
            targetPath: change?.key || null,
            effectId: ef.id || ef._id
          });
          continue;
        }

        // Map embedded effect to the same shape as item-based effects
        context.activeEffects.push({
          _id: eid,
          uuid: ef.uuid || eid,
          name: ef.label || ef.name || 'Effect',
          type: 'active-effect',
          range: String(ef.system?.range || ''),
          target: String(ef.system?.target || ''),
          duration: String(ef.system?.duration || ''),
              focusCost: ef.system?.focusCost || 0,
              actionCost: ef.system?.actionCost ?? ef.system?.actions ?? '',
          requiresRoll: ef.system?.requiresRoll || false,
          isActive: ef.system?.isActive !== false && !ef.disabled,
          isMagic: !!ef.system?.isMagic,
          magicCircle: ef.system?.magicCircle || null,
          traitsResolved: ef.system?.traitsResolved || ef.system?.traits || [],
          description: ef.system?.description || '',
          effect: ef.system?.effect || '',
          heightened: ef.system?.heightened || []
        });
      }

      // Expose effectsFromItems to be merged into `context.modifiers` later
      this._effectsFromItems = effectsFromItems;
    } catch (err) {
      console.warn('Wayfinder | error merging embedded ActiveEffects into context.activeEffects', err);
    }

    // Prepare modifier items (custom type 'modifier')
    context.modifiers = this.document.items
      .filter(item => item.type === 'modifier')
      .map(item => {
        return {
          _id: item._id,
          uuid: item.uuid || item._id,
          name: item.name,
          type: item.type,
          pillar: item.system?.pillar || 'status',
          value: item.system?.value ?? 0,
          description: item.system?.description || '',
          isActive: item.system?.isActive !== false,
          // Editor-friendly fields for display in the modifiers tab
          sourceType: 'local',
          sourceLabel: item.system?.originItemName || 'Manual',
          targetPath: item.system?.targetPath || item.system?.target || null
        };
      });

    // If we discovered ActiveEffects that were created from item modifiers,
    // include them in the modifiers list so they show up in the Modifiers tab
    // rather than in the Effects tab.
    if (Array.isArray(this._effectsFromItems) && this._effectsFromItems.length) {
      context.modifiers = context.modifiers.concat(this._effectsFromItems);
      // Clear the temp storage to avoid leaking between renders
      this._effectsFromItems = [];
    }

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
        const rawEffects = Array.isArray(t.system.effects) ? t.system.effects : [];
        if (rawEffects.length) console.log(`Wayfinder | Talent ${t.name} references ${rawEffects.length} effect entry(ies)`);
        for (const entry of rawEffects) {
          try {
            // If the entry is a string, treat it as a UUID reference
            if (typeof entry === 'string') {
              const doc = await fromUuid(entry);
              if (!doc) {
                console.warn('Wayfinder | fromUuidSync returned null for', entry);
                continue;
              }
              const eid = doc._id || doc.id || entry;
              if (seenEffectIds.has(eid)) {
                console.log('Wayfinder | skipping duplicate effect', eid);
                continue;
              }
              seenEffectIds.add(eid);

              if (doc.type === 'active-effect') {
                console.log('Wayfinder | adding referenced active-effect (talent)', doc.name, eid);
                const mapped = {
                  _id: doc._id,
                  uuid: entry || doc._id,
                  name: doc.name,
                  type: doc.type,
                  range: String(doc.system.range || ''),
                  target: String(doc.system.target || ''),
                  duration: String(doc.system.duration || ''),
                  focusCost: doc.system.focusCost || 0,
                  actionCost: doc.system.actionCost ?? doc.system.actions ?? '',
                  requiresRoll: doc.system.requiresRoll || false,
                  isActive: doc.system.isActive || false,
                  isMagic: !!doc.system.isMagic,
                  magicCircle: doc.system.magicCircle || null,
                  traitsResolved: doc.system.traitsResolved || doc.system.traits || [],
                  description: doc.system.description || '',
                  effect: doc.system.effect || '',
                  heightened: doc.system.heightened || []
                };
                // attach source talent metadata
                mapped.sourceTalentId = t._id;
                mapped.sourceTalentName = t.name;
                mapped.sourceTalentType = t.system?.talentType || 'General';
                context.talentActiveEffects.push(mapped);
                context.activeEffects.push(mapped);
                if ((mapped.sourceTalentType || '').toString().toLowerCase() === 'spell') context.talentSpellActiveEffects.push(mapped);
              } else if (doc.type === 'passive-effect') {
                console.log('Wayfinder | adding referenced passive-effect (talent)', doc.name, eid);
                const mapped = {
                  _id: doc._id,
                  uuid: entry || doc._id,
                  name: doc.name,
                  type: doc.type,
                  effect: String(doc.system.effect || ''),
                  isPermanent: doc.system.isPermanent !== false,
                  isActive: doc.system.isActive !== false,
                  traitsResolved: doc.system.traitsResolved || doc.system.traits || [],
                  description: doc.system.description || ''
                };
                mapped.sourceTalentId = t._id;
                mapped.sourceTalentName = t.name;
                mapped.sourceTalentType = t.system?.talentType || 'General';
                context.talentPassiveEffects.push(mapped);
                context.passiveEffects.push(mapped);
                if ((mapped.sourceTalentType || '').toString().toLowerCase() === 'spell') context.talentSpellPassiveEffects.push(mapped);
              } else {
                console.log('Wayfinder | referenced doc is not an effect:', doc.type, doc.name, entry);
              }
            } else if (entry && typeof entry === 'object') {
              // Inline effect object defined inside the talent data
              const systemData = entry.system || {};
              const type = entry.type || systemData.type || (systemData.effect ? 'active-effect' : 'passive-effect');
              const eid = entry._id || entry.id || entry.uuid || `${t._id}::inline::${entry.name || 'effect'}`;
              if (seenEffectIds.has(eid)) {
                continue;
              }
              seenEffectIds.add(eid);

              const mapped = {
                _id: entry._id || entry.id || null,
                uuid: entry.uuid || entry._id || null,
                name: entry.name || entry.label || (entry.system && entry.system.name) || `${t.name} - Effect`,
                type: type,
                range: String(entry.range ?? systemData.range ?? ''),
                target: String(entry.target ?? systemData.target ?? ''),
                duration: String(entry.duration ?? systemData.duration ?? ''),
                focusCost: entry.focusCost ?? systemData.focusCost ?? 0,
                actionCost: entry.actionCost ?? systemData.actionCost ?? systemData.actions ?? '',
                requiresRoll: entry.requiresRoll ?? systemData.requiresRoll ?? false,
                isActive: entry.isActive ?? (systemData.isActive !== false),
                isMagic: entry.isMagic ?? !!systemData.isMagic,
                magicCircle: entry.magicCircle ?? systemData.magicCircle ?? null,
                traitsResolved: entry.traitsResolved ?? systemData.traitsResolved ?? systemData.traits ?? [],
                description: entry.description ?? systemData.description ?? '',
                effect: entry.effect ?? systemData.effect ?? '',
                heightened: entry.heightened ?? systemData.heightened ?? []
              };

              // attach source talent metadata
              mapped.sourceTalentId = t._id;
              mapped.sourceTalentName = t.name;
              mapped.sourceTalentType = t.system?.talentType || 'General';

              if (mapped.type === 'passive-effect') {
                context.talentPassiveEffects.push(mapped);
                context.passiveEffects.push(mapped);
                if ((mapped.sourceTalentType || '').toString().toLowerCase() === 'spell') context.talentSpellPassiveEffects.push(mapped);
              } else {
                context.talentActiveEffects.push(mapped);
                context.activeEffects.push(mapped);
                if ((mapped.sourceTalentType || '').toString().toLowerCase() === 'spell') context.talentSpellActiveEffects.push(mapped);
              }
            }
          } catch (err) {
            console.warn('Erro ao resolver efeito referenciado pelo talento:', entry, err);
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
    // Lower z-index so the external tabs appear behind app windows
    tabsClone.style.zIndex = '0';
    tabsClone.style.display = 'flex';
    tabsClone.style.flexDirection = 'column';
    tabsClone.style.gap = '2px';
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

      tabsClone.style.left = (posX - 50) + 'px';
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
      // Ensure a default defenseDC exists (fallback to 10)
      if (v.defenseDC === undefined || v.defenseDC === null) v.defenseDC = 10;
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
  async _prepareItems(context) {
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
      Class: [],
      Spell: []
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
        // Normalize talent type: prefer explicit setting, but treat any talent
        // that defines a spell level as a Spell talent even if the field
        // is missing or set to 'General'. Normalize casing to match keys.
        let rawType = (i.system.talentType ?? '').toString();
        if (!rawType) {
          rawType = (i.system?.spellLevel !== undefined || i.system?.spell?.level !== undefined) ? 'Spell' : 'General';
        }
        const talentType = String(rawType).charAt(0).toUpperCase() + String(rawType).slice(1);
        if (!talents[talentType]) talents[talentType] = [];

        // Resolve effects for this talent
        const activeEffects = [];
        const passiveEffects = [];

          if (Array.isArray(i.system.effects)) {
          for (const effectUuid of i.system.effects) {
            const effect = await fromUuid(effectUuid);
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
        // If this talent is a Spell, also expose it in the spells container
        try {
          if (talentType === 'Spell') {
            const lvl = Number(i.system?.spellLevel ?? i.system?.spell?.level ?? 0) || 0;
            if (!spells[lvl]) spells[lvl] = [];
            spells[lvl].push(i);
          }
        } catch (err) {
          console.warn('Wayfinder | error adding talent-as-spell to spells list', i, err);
        }
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
        const container = ev.target.closest('[data-item-id]');
        const itemId = container?.dataset?.itemId;
        if (!itemId) return;
        const item = this.document.items.get(itemId);
        if (item) item.sheet.render(true);
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

    // Skills tab: languages / proficiencies interactive handlers
    try {
      const skillsTab = html.querySelector('.tab[data-tab="skills"]');
      if (skillsTab) {
        const showLangAdd = (show) => {
          const row = skillsTab.querySelector('.languages-add-row');
          if (!row) return;
          row.style.display = show ? 'flex' : 'none';
        };

        const langToggle = skillsTab.querySelector('.languages-toggle-add');
        const langAddBtn = skillsTab.querySelector('.languages-add-btn');
        const langInput = skillsTab.querySelector('.languages-input');
        const langCancel = skillsTab.querySelector('.languages-cancel');
        if (langToggle) langToggle.addEventListener('click', (ev) => { ev.preventDefault(); showLangAdd(true); langInput?.focus(); });
        if (langCancel) langCancel.addEventListener('click', (ev) => { ev.preventDefault(); showLangAdd(false); });
        if (langAddBtn) langAddBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const val = (langInput?.value || '').trim();
          if (!val) return ui.notifications?.warn?.('Digite o nome da língua');
          const existing = Array.isArray(this.document.system.languages) ? Array.from(this.document.system.languages) : [];
          if (!existing.includes(val)) existing.push(val);
          try { await this.document.update({ 'system.languages': existing }); this.render(true); } catch (err) { console.error('Failed to add language', err); }
        });

        // Delegate remove/add for weapons and armors
        skillsTab.addEventListener('click', async (ev) => {
          const removeLang = ev.target.closest('.language-remove');
          if (removeLang) {
            ev.preventDefault();
            const chip = ev.target.closest('.language-chip');
            if (!chip) return;
            const idx = Number(chip.dataset.langIndex);
            const arr = Array.isArray(this.document.system.languages) ? Array.from(this.document.system.languages) : [];
            if (!Number.isNaN(idx) && idx >= 0 && idx < arr.length) arr.splice(idx, 1);
            try { await this.document.update({ 'system.languages': arr }); this.render(true); } catch (err) { console.error('Failed to remove language', err); }
            return;
          }

          const removeWeapon = ev.target.closest('.weapon-remove');
          if (removeWeapon) {
            ev.preventDefault();
            const chip = ev.target.closest('.weapon-chip');
            const idx = Number(chip?.dataset.weaponIndex);
            const arr = Array.isArray(this.document.system.proficiencies?.weapons) ? Array.from(this.document.system.proficiencies.weapons) : [];
            if (!Number.isNaN(idx) && idx >= 0 && idx < arr.length) arr.splice(idx, 1);
            try { await this.document.update({ 'system.proficiencies.weapons': arr }); this.render(true); } catch (err) { console.error('Failed to remove weapon prof', err); }
            return;
          }

          const removeArmor = ev.target.closest('.armor-remove');
          if (removeArmor) {
            ev.preventDefault();
            const chip = ev.target.closest('.armor-chip');
            const idx = Number(chip?.dataset.armorIndex);
            const arr = Array.isArray(this.document.system.proficiencies?.armors) ? Array.from(this.document.system.proficiencies.armors) : [];
            if (!Number.isNaN(idx) && idx >= 0 && idx < arr.length) arr.splice(idx, 1);
            try { await this.document.update({ 'system.proficiencies.armors': arr }); this.render(true); } catch (err) { console.error('Failed to remove armor prof', err); }
            return;
          }
        });

        // Weapons add
        const weaponsAddBtn = skillsTab.querySelector('.weapons-add-btn');
        const weaponsSelect = skillsTab.querySelector('.weapons-select');
        if (weaponsAddBtn) weaponsAddBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const val = weaponsSelect?.value || '';
          if (!val) return ui.notifications?.warn?.('Escolha uma arma para adicionar');
          const existing = Array.isArray(this.document.system.proficiencies?.weapons) ? Array.from(this.document.system.proficiencies.weapons) : [];
          if (!existing.includes(val)) existing.push(val);
          try { await this.document.update({ 'system.proficiencies.weapons': existing }); this.render(true); } catch (err) { console.error('Failed to add weapon prof', err); }
        });

        // Armors add
        const armorsAddBtn = skillsTab.querySelector('.armors-add-btn');
        const armorsSelect = skillsTab.querySelector('.armors-select');
        if (armorsAddBtn) armorsAddBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const val = armorsSelect?.value || '';
          if (!val) return ui.notifications?.warn?.('Escolha uma armadura para adicionar');
          const existing = Array.isArray(this.document.system.proficiencies?.armors) ? Array.from(this.document.system.proficiencies.armors) : [];
          if (!existing.includes(val)) existing.push(val);
          try { await this.document.update({ 'system.proficiencies.armors': existing }); this.render(true); } catch (err) { console.error('Failed to add armor prof', err); }
        });
      }
    } catch (err) {
      console.warn('Wayfinder | error binding skills card handlers', err);
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
            </form>`;
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
    html.addEventListener('click', async (ev) => {
      if (ev.target.closest('.item-delete')) {
        ev.preventDefault();
        ev.stopPropagation();
        // Find the nearest element that carries the item id
        const container = ev.target.closest('[data-item-id]');
        const itemId = container?.dataset?.itemId;
        if (!itemId) return;
        try {
          await this.document.deleteEmbeddedDocuments('Item', [itemId]);
          // Remove the DOM row for immediate feedback
          try { if (typeof container.slideUp === 'function') container.slideUp(200); else container.remove(); } catch (e) { container.remove(); }
        } catch (err) {
          console.error('Wayfinder | Error deleting inventory item', err);
        }
      }
    });

    // Inventory controls (hand select / tuned checkbox) - update the embedded Item when changed
    html.addEventListener('change', async (ev) => {
      const sel = ev.target.closest('.inventory-item-hand-select');
      if (sel) {
        const itemId = sel.dataset.itemId;
        if (!itemId) return;
        const value = sel.value;
        try {
          await this.document.updateEmbeddedDocuments('Item', [{ _id: itemId, 'system.inventory.hand': value }]);
        } catch (err) {
          console.error('Wayfinder | Error updating inventory hand for item', itemId, err);
        }
        return;
      }

      const cb = ev.target.closest('.inventory-item-tuned-checkbox');
      if (cb) {
        const itemId = cb.dataset.itemId;
        if (!itemId) return;
        const checked = !!cb.checked;
        try {
          await this.document.updateEmbeddedDocuments('Item', [{ _id: itemId, 'system.inventory.tuned': checked }]);
        } catch (err) {
          console.error('Wayfinder | Error updating inventory tuned for item', itemId, err);
        }
        return;
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
    // Setup collapsible spells sections
    if (this._setupSpellsCollapsible) this._setupSpellsCollapsible(html);

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
   * Setup collapsible spell level sections similar to talents
   * @private
   */
  _setupSpellsCollapsible(html) {
    const typeHeaders = html.querySelectorAll('.spell-type-header');
    typeHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        e.preventDefault();
        const content = header.nextElementSibling;
        const icon = header.querySelector('.spell-type-icon');

        if (content.style.display === 'none') {
          content.style.display = 'block';
          if (icon) icon.style.transform = 'rotate(90deg)';
        } else {
          content.style.display = 'none';
          if (icon) icon.style.transform = 'rotate(0deg)';
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
    // Effects may be stored as Items on the actor or as embedded ActiveEffect documents.
    // Try to resolve either an Item or an ActiveEffect by id.
    let effect = this.document.items.get(effectId);
    let ae = null;
    if (!effect) {
      ae = this.document.effects.get(effectId);
      if (!ae) return;
    } else if (effect.type !== 'active-effect') return;

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

    // Perform attack roll + damage if this effect represents an attack
    const isAttack = (effect && effect.system && effect.system.isAttack) || (ae && ae.system && ae.system.isAttack);
    const requiresRoll = (effect && effect.system && effect.system.requiresRoll) || (ae && ae.system && ae.system.requiresRoll);

    if (isAttack) {
      try {
        // Compute modifier components (same as before)
        let prof = 0;
        try { prof = Number((effect && effect.system && effect.system.prof) ?? (ae && ae.system && ae.system.prof) ?? this.document.system?.proficiencyBonus ?? 0) || 0; } catch(e){ prof = 0; }

        let attrKey = (effect && effect.system && effect.system.attribute) || (ae && ae.system && ae.system.attribute) || null;
        try {
          const origin = (effect && effect.flags?.wayfinder?.sourceItemId) || (effect && effect.origin) || (ae && ae.origin) || null;
          if (origin && String(origin).startsWith('Item.')) {
            const parts = String(origin).split('.');
            const itemId = parts[1] || null;
            if (itemId) {
              const srcItem = this.document.items.get(itemId);
              if (srcItem && srcItem.system && srcItem.system.attribute) attrKey = attrKey || srcItem.system.attribute;
            }
          }
        } catch (e) {}

        let attrValue = 0;
        if (attrKey) {
          try { const aobj = this.document.system?.attributes?.[attrKey]; if (aobj) attrValue = Number(aobj.total ?? aobj.value ?? 0) || 0; } catch (e) { attrValue = 0; }
        }

        const strike = (effect && effect.system && effect.system.strike) || (ae && ae.system && ae.system.strike) || {};
        const circun = Number(strike.circun ?? (effect && effect.system && effect.system.circun) ?? 0) || 0;
        const itemMod = Number(strike.item ?? (effect && effect.system && effect.system.item) ?? 0) || 0;
        const status = Number(strike.status ?? (effect && effect.system && effect.system.status) ?? 0) || 0;

        const modsTotal = prof + attrValue + circun + itemMod + status;
        const attackFormula = `2d10 + ${modsTotal}`;

        // Prepare damage formula and type. Effects can specify a damageSource: 'weapon' to use the originating weapon's die, or 'custom'.
        let damageFormula = '1d6';
        let damageType = (effect && effect.system && effect.system.damageType) || (ae && ae.system && ae.system.damageType) || strike.damage?.type || null;
        const damageSource = (effect && effect.system && effect.system.damageSource) || (ae && ae.system && ae.system.damageSource) || null;

        // If using the weapon's die, attempt to resolve the item that hosts the effect
        if (damageSource === 'weapon') {
          try {
            let sourceItemId = null;
            if (effect && effect.flags?.wayfinder?.sourceItemId) sourceItemId = effect.flags.wayfinder.sourceItemId;
            else if (ae && ae.flags?.wayfinder?.sourceItemId) sourceItemId = ae.flags.wayfinder.sourceItemId;
            else if (effect && effect.origin && String(effect.origin).startsWith('Item.')) sourceItemId = String(effect.origin).split('.')[1];
            else if (ae && ae.origin && String(ae.origin).startsWith('Item.')) sourceItemId = String(ae.origin).split('.')[1];
            else if (effect && effect.system && effect.system.sourceItemId) sourceItemId = effect.system.sourceItemId;

            if (sourceItemId) {
              const srcItem = this.document.items.get(sourceItemId);
              if (srcItem) {
                damageFormula = srcItem.system?.damageDie || srcItem.system?.damageFormula || damageFormula;
                damageType = srcItem.system?.damageType || damageType;
              }
            }
          } catch (e) {
            console.warn('Wayfinder | could not resolve weapon source for effect damage', e);
          }
        } else if (damageSource === 'custom') {
          const dd = (effect && effect.system && effect.system.damageDie) || (ae && ae.system && ae.system.damageDie) || strike.damage?.die || null;
          if (dd) damageFormula = dd;
        } else {
          // Fallback: prefer any explicit damageFormula on effect/A.E., then strike damage
          if ((effect && effect.system && effect.system.damageFormula) || (ae && ae.system && ae.system.damageFormula)) {
            damageFormula = (effect && effect.system && effect.system.damageFormula) || (ae && ae.system && ae.system.damageFormula);
          } else if (strike.damage?.formula) {
            damageFormula = strike.damage.formula;
          } else if (effect && effect.system && effect.system.damageDie) {
            damageFormula = effect.system.damageDie;
          } else if (effect && effect.system && effect.system.damage) {
            damageFormula = effect.system.damage;
          }
        }

        const dmgMods = (circun + itemMod + status) || 0;
        if (dmgMods) damageFormula = `${damageFormula} + ${dmgMods}`;

        const attackPreview = `Formula de Ataque: <code>${attackFormula}</code>`;
        const damagePreview = `Formula de Dano: <code>${damageFormula}</code>${damageType ? ` <strong>(${damageType})</strong>` : ''}`;

        // Show a dialog to the user to choose rolling behavior
        const dialogContent = `<div style="padding:8px">${attackPreview}<div style="margin-top:6px">${damagePreview}</div></div>`;
        const dlg = new Dialog({
          title: `Rolagem de Ataque: ${(effect && effect.name) || (ae && ae.label) || 'Ataque'}`,
          content: dialogContent,
          buttons: {
            attack: {
              icon: '<i class="fas fa-bullseye"></i>',
              label: 'Roll Attack',
              callback: async () => {
                try {
                  const attackRoll = new Roll(attackFormula, this.document.getRollData());
                  await attackRoll.evaluate({ async: true });
                  const flavor = `<div class="wf-roll-card" style="border-radius:12px;padding:14px;background:linear-gradient(180deg,var(--wayfinder-accent-light),#fff);color:var(--wayfinder-text);max-width:560px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 10px 24px rgba(0,0,0,0.12)">` +
                    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="flex:1;min-width:0"><div style="background:var(--wayfinder-primary);color:#fff;padding:12px 14px;border-radius:10px;font-weight:800;font-size:18px;text-transform:capitalize">${(effect && effect.name) || (ae && ae.label) || 'Ataque'}</div>` +
                    `<div style="margin-top:10px;font-size:13px;display:flex;gap:12px;flex-wrap:wrap"><div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Ataque</div><div style="font-weight:800;font-size:16px">${attackRoll.total}</div></div>` +
                    `</div></div></div></div>`;
                  await attackRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: flavor });
                } catch (err) {
                  console.error('Erro ao rolar ataque:', err);
                  ui.notifications.error('Erro ao rolar ataque');
                }
              }
            },
            both: {
              icon: '<i class="fas fa-bolt"></i>',
              label: 'Roll Attack + Damage',
              callback: async () => {
                try {
                  const attackRoll = new Roll(attackFormula, this.document.getRollData());
                  await attackRoll.evaluate({ async: true });
                  const damageRoll = new Roll(damageFormula, this.document.getRollData());
                  await damageRoll.evaluate({ async: true });
                  const flavor = `<div class="wf-roll-card" style="border-radius:12px;padding:14px;background:linear-gradient(180deg,var(--wayfinder-accent-light),#fff);color:var(--wayfinder-text);max-width:560px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 10px 24px rgba(0,0,0,0.12)">` +
                    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="flex:1;min-width:0"><div style="background:var(--wayfinder-primary);color:#fff;padding:12px 14px;border-radius:10px;font-weight:800;font-size:18px;text-transform:capitalize">${(effect && effect.name) || (ae && ae.label) || 'Ataque'}</div>` +
                    `<div style="margin-top:10px;font-size:13px;display:flex;gap:12px;flex-wrap:wrap">` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Ataque</div><div style="font-weight:800;font-size:16px">${attackRoll.total}</div></div>` +
                    `<div style="background:rgba(0,0,0,0.04);padding:8px 10px;border-radius:8px"><div style="font-size:11px;color:rgba(0,0,0,0.6)">Dano${damageType ? ' · ' + damageType : ''}</div><div style="font-weight:800;font-size:16px">${damageRoll.total}</div></div>` +
                    `</div></div></div></div>`;
                  // Post combined result as a single chat message
                  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.document }), content: flavor, type: CONST.CHAT_MESSAGE_TYPES.ROLL });
                } catch (err) {
                  console.error('Erro ao rolar ataque+dano:', err);
                  ui.notifications.error('Erro ao rolar ataque+dano');
                }
              }
            },
            cancel: { label: 'Cancelar' }
          },
          default: 'attack'
        });
        dlg.render(true);
      } catch (err) {
        console.error('Erro ao executar ataque do efeito:', err);
        ui.notifications.error('Erro ao executar ataque do efeito');
      }
    } else if (requiresRoll && ((effect && effect.system && effect.system.rollFormula) || (ae && ae.system && ae.system.rollFormula))) {
      // Fallback: generic roll formula on the effect
      try {
        const formula = (effect && effect.system && effect.system.rollFormula) || (ae && ae.system && ae.system.rollFormula);
        const roll = new Roll(formula, this.document.getRollData());
        // Show dialog for generic roll as well
        const dialogContent = `Formula: <code>${formula}</code>`;
        const dlg = new Dialog({
          title: `${(effect && effect.name) || (ae && ae.label) || 'Roll'}`,
          content: `<div style="padding:8px">${dialogContent}</div>`,
          buttons: {
            roll: { label: 'Roll', callback: async () => { try { await roll.evaluate({ async: true }); await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: '' }); } catch (e) { console.error('Roll error', e); ui.notifications.error('Erro na rolagem'); } } },
            cancel: { label: 'Cancelar' }
          },
          default: 'roll'
        });
        dlg.render(true);
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

    // Allow active-effect, passive-effect, talent and regular items (weapons/armors/other)
    if (!['active-effect', 'passive-effect', 'talent', 'item', 'trait'].includes(item.type)) {
      return;
    }

    // Create a copy of the item data for embedding in this actor
    const itemData = item.toObject();

    // Remove the UUID to let Foundry generate a new one
    delete itemData._id;

    // Add to actor as embedded document
    try {
      const created = await this.document.createEmbeddedDocuments('Item', [itemData]);
      // Notify depending on type
      let typeName = 'Item';
      if (item.type === 'talent') typeName = 'Talento';
      else if (item.type === 'active-effect' || item.type === 'passive-effect') typeName = 'Efeito';
      else if (item.type === 'trait') typeName = 'Trait';
      ui.notifications.info(`${item.name} adicionado ao inventário como ${typeName}.`);
      // The activeTab property will preserve the current tab during auto-render
    } catch (error) {
      console.error('Erro ao adicionar item:', error);
      ui.notifications.error('Erro ao adicionar item.');
    }
  }
}
