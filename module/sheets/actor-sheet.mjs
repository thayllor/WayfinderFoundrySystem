/**
 * Extend the basic ActorSheet with some very simple modifications
 * Para V2, deve estender HandlebarsApplicationMixin(DocumentSheetV2)
 */
const { ApplicationV2, HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;
import { saveSelection, restoreSelection, applyFontSizeToSelection, pastePlain } from '../helpers/text-editor.mjs';

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
    // NOTE: DOM-related setup is performed in _onRender; do not access `html` here.

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

    // Attribute totals are computed at document prepare stage (WayfinderActor). Do not duplicate here.

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
    // Ensure system structure exists and defaults for attributes/skills to avoid template crashes
    context.system = context.system || {};
    context.system.attributes = context.system.attributes || {};
    context.system.skills = context.system.skills || {};

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

  // Helper to read description fields which may be strings or TextEditor objects
  _readDesc(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object' && obj.value) return obj.value;
    try { return String(obj); } catch (e) { return null; }
  }

  // Collect an effect/item description from multiple possible fields
  _collectEffectDescription(effect, ae, parentItemForAe) {
    const candidates = [
      // Prefer ActiveEffect fields first
      () => ae?.system?.chatEffect,
      () => ae?.system?.description,
      () => ae?.system?.effect,
      () => ae?.description,
      () => ae?.effect,
      // Then the item/effect object fields
      () => effect?.system?.chatEffect,
      () => effect?.system?.description,
      () => effect?.system?.effect,
      () => effect?.description,
      () => effect?.effect,
      () => effect?.system?.longDescription,
      () => effect?.system?.notes,
      () => effect?.flags?.wayfinder?.description,
      () => effect?.flags?.description,
      () => effect?.flags?.notes,
      // Parent item (when ae is embedded)
      () => parentItemForAe?.system?.description,
      () => parentItemForAe?.system?.effect,
      () => parentItemForAe?.description,
      () => parentItemForAe?.flags?.wayfinder?.description,
      () => parentItemForAe?.flags?.description
    ];

    for (const get of candidates) {
      try {
        const val = get();
        const text = this._readDesc(val);
        if (text && String(text).trim().length) return text;
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  // Extract readable text from a clicked DOM element (button) as a fallback
  _extractTextFromDom(btn) {
    if (!btn) return null;
    try {
      let el = btn instanceof HTMLElement ? btn : (btn?.closest ? btn.closest('button,div,span') : null);
      for (let depth = 0; depth < 6 && el; depth++, el = el.parentElement) {
        // Use visible innerText, collapse whitespace
        const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        // Ignore purely icon-only content (no letters/numbers)
        if (!/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(txt)) continue;
        // Exclude common button labels that are not descriptive
        const lc = txt.toLowerCase();
        if (lc === 'edit' || lc === 'delete' || lc === 'roll' || lc === 'rolagem' || lc === 'cancel' || lc === 'ok') continue;
        // Return the cleaned text
        return txt;
      }
    } catch (e) {
      // ignore
    }
    return null;
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
    };

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
          const total = (typeof attr.total === 'number') ? attr.total : (parseInt(attr.value) || 0);
          const bonus = Math.round((Number(total) || 0) - 10);

          // Old structure used a .triangle-down .attribute-value span
          const triangleSpan = el.querySelector('.triangle-down .attribute-value');
          if (triangleSpan) triangleSpan.textContent = String(total);

          // Template now shows only the total; update that element
          const defenceTotalSpan = el.querySelector('.defense-total');
          if (defenceTotalSpan) defenceTotalSpan.textContent = Number.isNaN(Number(total)) ? '' : String(total);
        });
      } catch (err) {
        console.warn('Error updating pentagon totals', err);
      }
    };

    // Initial populate
    this._updatePentagonTotals();

    // (rich text setup will be attached later in this method)

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

    // Initialize rich-text editors for any existing trait-description groups
    try {
      if (typeof this._setupRichTextEditor === 'function') this._setupRichTextEditor(html);
    } catch (e) {
      console.warn('Wayfinder | failed to initialize rich text editors on render', e);
    }

    // Delegated handler for editor toggle buttons so it survives re-renders
    try {
      if (this._boundTraitToggle) html.removeEventListener('click', this._boundTraitToggle);
      this._boundTraitToggle = (ev) => {
        const btn = ev.target.closest('.trait-editor-toggle-btn');
        if (!btn) return;
        ev.preventDefault();
        const group = btn.closest('.trait-description-group');
        const content = group?.querySelector('.trait-editor-content');
        const toolbar = group?.querySelector('.trait-editor-toolbar');
        if (!content) return;
        const isEditing = content.getAttribute('contenteditable') === 'true';
        content.setAttribute('contenteditable', !isEditing);
        content.setAttribute('data-text-editable', !isEditing);
        if (toolbar) toolbar.style.display = !isEditing ? 'flex' : 'none';
        // Use simple icon fallbacks to avoid relying on per-group icon rendering
        const iconTimes = `<i class="fas fa-times"></i>`;
        const iconEdit = `<i class="fas fa-edit"></i>`;
        btn.innerHTML = !isEditing ? `${iconTimes} Cancelar` : `${iconEdit} Editar`;
        if (!isEditing) content.focus();
      };
      html.addEventListener('click', this._boundTraitToggle);
    } catch (e) {
      console.warn('Wayfinder | failed to attach delegated trait toggle handler', e);
    }

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
      }




    /**
     * Setup rich text editor groups on actor sheet (reuses trait-editor component)
     */
    this._setupRichTextEditor = (html) => {
      const groups = html.querySelectorAll('.trait-description-group');
      console.log('Wayfinder | actor _setupRichTextEditor groups found:', groups.length);
      groups.forEach(group => {
        const toggleBtn = group.querySelector('.trait-editor-toggle-btn');
        const content = group.querySelector('.trait-editor-content');
        const toolbar = group.querySelector('.trait-editor-toolbar');
        const textarea = group.querySelector('textarea[name]');
        const closeBtn = group.querySelector('.editor-close-btn');
        const preview = group.querySelector('.trait-editor-preview');
        const previewBtn = group.querySelector('.editor-preview-btn');

        if (!toggleBtn || !content || !textarea) {
          console.log('Wayfinder | editor group missing element', { toggleBtn: !!toggleBtn, content: !!content, textarea: !!textarea });
          return;
        }
        console.log('Wayfinder | editor group ready', { toggleBtn: !!toggleBtn, textareaName: textarea.name });

        // Diagnostic click log to ensure handler runs
        toggleBtn.addEventListener('click', (ev) => {
          console.log('Wayfinder | actor trait toggleBtn clicked for textarea', textarea.name);
        });

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

        if (typeof iconTimes === 'string' && !iconTimes.includes('<')) iconTimes = `<i class="${iconTimes}"></i>`;
        if (typeof iconEdit === 'string' && !iconEdit.includes('<')) iconEdit = `<i class="${iconEdit}"></i>`;
        if (typeof iconEye === 'string' && !iconEye.includes('<')) iconEye = `<i class="${iconEye}"></i>`;
        if (typeof iconEyeSlash === 'string' && !iconEyeSlash.includes('<')) iconEyeSlash = `<i class="${iconEyeSlash}"></i>`;

        let isPreview = false;

        // Toggle handler is provided via delegated listener on the sheet
        // to survive re-renders; leave only diagnostic logging here.

        closeBtn?.addEventListener('click', () => {
          content.setAttribute('contenteditable', 'false');
          content.setAttribute('data-text-editable', 'false');
          toolbar.style.display = 'none';
          toggleBtn.innerHTML = `${iconEdit} Editar`;
          textarea.value = content.innerHTML;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

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

        // Format buttons: delegate to document.execCommand for simplicity
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

          // Font size control for actor editor (use helper)
          const fontInput = toolbar?.querySelector('.editor-font-size-input');
          const applyFontBtn = toolbar?.querySelector('.editor-apply-font-btn');
          let savedRangeForFont = null;
          if (applyFontBtn) {
            applyFontBtn.addEventListener('mousedown', () => { savedRangeForFont = saveSelection(); });
            applyFontBtn.addEventListener('click', (ev) => {
              ev.preventDefault();
              const size = fontInput?.value || null;
              if (!size) return;
              if (savedRangeForFont) restoreSelection(savedRangeForFont);
              applyFontSizeToSelection(size);
              content.focus();
              textarea.value = content.innerHTML;
              savedRangeForFont = null;
            });
          }

          // Sync and preserve on paste
        content.addEventListener('input', () => { textarea.value = content.innerHTML; });
        content.addEventListener('blur', () => { textarea.value = content.innerHTML; });
        content.addEventListener('paste', (e) => pastePlain(e));
      });

        // Attach language add/remove handlers if the skills tab exists (query locally)
        try {
          const _skillsTab = html.querySelector('.tab[data-tab="skills"]');
          if (_skillsTab) {
              const _langInput = _skillsTab.querySelector('.languages-input');
              const _langCancel = _skillsTab.querySelector('.languages-cancel');
              const _langToggle = _skillsTab.querySelector('.languages-toggle-add');
              const _langAddBtn = _skillsTab.querySelector('.languages-add-btn');
              const _showLangAdd = (show) => {
                const row = _skillsTab.querySelector('.languages-add-row');
                if (!row) return;
                row.style.display = show ? 'flex' : 'none';
              };
              if (_langToggle) _langToggle.addEventListener('click', (ev) => { ev.preventDefault(); _showLangAdd(true); _langInput?.focus(); });
              if (_langCancel) _langCancel.addEventListener('click', (ev) => { ev.preventDefault(); _showLangAdd(false); });
            if (_langAddBtn) _langAddBtn.addEventListener('click', async (ev) => {
              ev.preventDefault();
              const val = (_langInput?.value || '').trim();
              if (!val) return ui.notifications?.warn?.('Digite o nome da língua');
              const existing = Array.isArray(this.document.system.languages) ? Array.from(this.document.system.languages) : [];
              if (!existing.includes(val)) existing.push(val);
              try { await this.document.update({ 'system.languages': existing }); this.render(true); } catch (err) { console.error('Failed to add language', err); }
            });
          }
        } catch (e) {
          // Non-fatal: skills tab may not exist in this render
        }

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

          // Build dialog content via Handlebars partial
          const content = await foundry.applications.handlebars.renderTemplate(
            'systems/wayfinder/templates/components/roll-dialog.hbs',
            {
              titleLabel: 'Atributo',
              attrInfo: `${displayName} (${attrValue})`,
              profDefault,
              status: 0,
              circun: 0,
              item: 0
            }
          );

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

                  // Render the attack card partial as the chat flavor
                  try {
                    const templateData = {
                      title: displayName,
                      subtitle: null,
                      attackTotal: finalTotal,
                      stats: [
                        { label: 'ATR', value: attrValue },
                        { label: 'Prof', value: prof },
                        { label: 'Status', value: status },
                        { label: 'Circun', value: circun },
                        { label: 'Item', value: itemVal }
                      ],
                      attackFormula: formula,
                      attackDice: diceResults,
                      damageFormula: null,
                      damageDice: null,
                      damageTotal: null,
                      flavor: ''
                    };
                    const flavorHtml = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', Object.assign({}, templateData, { effectDescription: null }));
                    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: flavorHtml, rollMode: game.settings.get('core', 'rollMode') });
                  } catch (e) {
                    console.warn('Wayfinder | failed to render attack partial, falling back to raw flavor', e);
                    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: '', rollMode: game.settings.get('core', 'rollMode') });
                  }
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

          // Build skill dialog content via Handlebars partial
          const content = await foundry.applications.handlebars.renderTemplate(
            'systems/wayfinder/templates/components/roll-dialog.hbs',
            {
              titleLabel: 'Perícia',
              attrInfo: `${displayName} (${attrAbbrev} ${attrValue})`,
              profDefault,
              status,
              circun,
              item: itemVal
            }
          );

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

                  // Render the attack card partial for skill roll flavor
                  try {
                    const templateData = {
                      title: displayName,
                      subtitle: null,
                      attackTotal: finalTotal,
                      stats: [
                        { label: 'ATR', value: attrValue },
                        { label: 'Prof', value: prof },
                        { label: 'Status', value: statusVal },
                        { label: 'Circun', value: circunVal },
                        { label: 'Item', value: itemVal2 }
                      ],
                      attackFormula: formula,
                      attackDice: diceResults,
                      damageFormula: null,
                      damageDice: null,
                      damageTotal: null,
                      flavor: ''
                    };
                    const flavorHtml = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', Object.assign({}, templateData, { effectDescription: null }));
                    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: flavorHtml, rollMode: game.settings.get('core', 'rollMode') });
                  } catch (e) {
                    console.warn('Wayfinder | failed to render attack partial for skill roll, falling back', e);
                    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: '', rollMode: game.settings.get('core', 'rollMode') });
                  }
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
    };

    // If the sheet is editable, initialize rich-text editors now that the
    // `_setupRichTextEditor` function is defined (ensure the DOM is passed).
    try {
      if (this.isEditable && typeof this._setupRichTextEditor === 'function') this._setupRichTextEditor(html);
    } catch (e) {
      console.warn('Wayfinder | failed to auto-init rich text editors after definition', e);
    }
    // Setup collapsible talents
    this._setupTalentsCollapsible(html);
    // Setup collapsible spells sections
    if (this._setupSpellsCollapsible) this._setupSpellsCollapsible(html);

    // Effect handlers - Remove old listener if exists
    if (this._boundEffectClick) {
      html.removeEventListener('click', this._boundEffectClick);
    }

    console.log('Wayfinder | binding effect click handler');
    this._boundEffectClick = async (ev) => {
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
      // Remove an actor effect (standalone embedded AE or stored embeddedEffects)
      if (ev.target.closest('.remove-effect-btn')) {
        ev.preventDefault();
        ev.stopPropagation();
        const btn = ev.target.closest('.remove-effect-btn');
        const wrapper = btn.closest('[data-real-id]') || btn.closest('[data-uuid]') || btn.closest('[data-effect-id]') || btn.closest('[data-source-item-id]') || btn.closest('[data-item-id]') || btn.closest('.effect-item');
        let resolved = wrapper?.dataset?.realId || wrapper?.dataset?.uuid || wrapper?.dataset?.effectId || wrapper?.dataset?.sourceItemId || wrapper?.dataset?.itemId || null;
        // Fallback: prefer the explicit uuid stored on the button itself if wrapper had no useful ids
        if (!resolved && btn && btn.dataset && btn.dataset.uuid) resolved = btn.dataset.uuid;

        // If the wrapper contains a data-item-id or data-source-item-id that refers
        // to an Item embedded on this Actor (forms like 'Actor.<aid>.Item.<iid>' or a plain id),
        // prefer deleting the embedded Item to ensure persistent removal.
        try {
          const itemIdRaw = wrapper?.dataset?.itemId || wrapper?.dataset?.sourceItemId || null;
          if (itemIdRaw) {
            const candidateId = (typeof itemIdRaw === 'string' && itemIdRaw.includes('.Item.')) ? itemIdRaw.split('.').pop() : (typeof itemIdRaw === 'string' && itemIdRaw.includes('.') ? itemIdRaw.split('.').pop() : itemIdRaw);
            if (candidateId && this.document.items.get(candidateId)) {
              try {
                if (typeof this.document.deleteEmbeddedDocuments === 'function') {
                  await this.document.deleteEmbeddedDocuments('Item', [candidateId]);
                } else {
                  const it = this.document.items.get(candidateId);
                  if (it) await it.delete();
                }
                ui.notifications?.info?.('Efeito removido. (Item embutido excluído)');
                try { this.render(true); } catch (e) {}
                return;
              } catch (err) {
                console.debug('Wayfinder | actor remove-effect: failed deleting embedded Item via data-item-id', err);
              }
            }
          }
        } catch (e) { console.debug('Wayfinder | actor remove-effect: data-item-id check failed', e); }
        // Special-case: handle Scene.Token... UUIDs (effects embedded on a placed token)
        try {
          if (resolved && String(resolved).startsWith('Scene.')) {
            try {
              const parts = String(resolved).split('.');
              const sceneId = parts[1];
              const tokenIdx = parts.indexOf('Token');
              const tokenId = tokenIdx !== -1 ? parts[tokenIdx + 1] : null;
              if (sceneId && tokenId && typeof game !== 'undefined' && game.scenes) {
                const scene = game.scenes.get(sceneId);
                if (scene) {
                  const tokenDoc = scene.tokens.get(tokenId) || (scene.tokens || new Map())[tokenId];
                  // Try to delete an ActiveEffect on the token's actor if present
                  const tokenActor = tokenDoc?.actor || null;
                  if (tokenActor && tokenActor.effects) {
                    const ae = tokenActor.effects.find(e => (e.id === resolved || e._id === resolved || e.uuid === resolved || e.origin === resolved || (e.flags && JSON.stringify(e.flags).includes(resolved))));
                    if (ae) {
                      await ae.delete();
                      ui.notifications?.info?.('Efeito removido. (token actor AE)');
                      try { this.render(true); } catch (e) {}
                      return;
                    }
                  }
                  // Try to remove from token actorData.flags.wayfinder.embeddedEffects
                  const actorDataFlags = tokenDoc?.actorData?.flags || {};
                  const embedded = Array.isArray(actorDataFlags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(actorDataFlags.wayfinder.embeddedEffects) : null;
                  if (Array.isArray(embedded)) {
                    let i = embedded.findIndex(e => (e.uuid === resolved || e._id === resolved || e.id === resolved));
                    if (i === -1) {
                      const title = btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim();
                      if (title) i = embedded.findIndex(e => (e.name === title));
                    }
                    if (i !== -1) {
                      embedded.splice(i, 1);
                      try {
                        await scene.updateEmbeddedDocuments('Token', [{ _id: tokenId, actorData: { flags: { wayfinder: { embeddedEffects: embedded } } } }]);
                        ui.notifications?.info?.('Efeito removido. (token embeddedEffects)');
                        try { this.render(true); } catch (e) {}
                        return;
                      } catch (e) {
                        console.debug('Wayfinder | failed to persist token embeddedEffects removal', e);
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.debug('Wayfinder | error handling Scene.Token removal', e);
            }
          }

          // Try to delete an actual ActiveEffect on the actor
          if (resolved) {
            const ae = this.document.effects.get(resolved) || this.document.effects.find(e => (e.id === resolved || e._id === resolved || e.uuid === resolved));
            if (ae) {
              await ae.delete();
              ui.notifications?.info?.('Efeito removido.');
              try { this.render(true); } catch (e) {}
              return;
            }
          }
            // If the resolved value is an embedded Item UUID (Actor.<aid>.Item.<iid>)
            // and the Item exists on this actor, delete the embedded Item so the
            // effect is removed persistently from the actor's inventory.
            try {
              if (resolved && typeof resolved === 'string' && resolved.startsWith('Actor.') && resolved.includes('.Item.')) {
                const parts = String(resolved).split('.');
                const actorId = parts[1];
                const itemIdx = parts.indexOf('Item');
                const itemId = itemIdx !== -1 ? parts[itemIdx + 1] : null;
                if (itemId && (actorId === this.document.id || !actorId)) {
                  try {
                    if (typeof this.document.deleteEmbeddedDocuments === 'function') {
                      await this.document.deleteEmbeddedDocuments('Item', [itemId]);
                    } else if (typeof this.document.items?.get === 'function') {
                      const it = this.document.items.get(itemId);
                      if (it) {
                        await it.delete();
                      }
                    }
                    ui.notifications?.info?.('Efeito removido. (Item embutido excluído)');
                    try { this.render(true); } catch (e) {}
                    return;
                  } catch (err) {
                    console.debug('Wayfinder | failed to delete embedded Item on actor during remove-effect', err);
                  }
                }
              }
            } catch (e) { console.debug('Wayfinder | embedded Item delete check failed', e); }
        } catch (e) {
          console.error('Wayfinder: erro ao tentar deletar ActiveEffect', e);
        }

        // Fallback: remove from flags.wayfinder.embeddedEffects if present
        const existing = Array.isArray(this.document.flags?.wayfinder?.embeddedEffects) ? foundry.utils.deepClone(this.document.flags.wayfinder.embeddedEffects) : [];
        let idx = -1;
        if (resolved) idx = existing.findIndex(e => (e.uuid === resolved || e._id === resolved || e.id === resolved));
        if (idx === -1) {
          const el = btn.closest('.effect-item');
          const di = el?.dataset?.effectIndex;
          if (di !== undefined && di !== null && di !== '') {
            const parsed = Number(di);
            if (!Number.isNaN(parsed)) idx = parsed;
          }
        }
        if (idx === -1) {
          const el = btn.closest('.effect-item');
          const itemId = el?.dataset?.itemId;
          if (itemId) idx = existing.findIndex(e => (e.uuid === itemId || e._id === itemId || e.id === itemId));
        }
        if (idx === -1) {
          const title = btn.closest('.effect-item')?.querySelector('.effect-collapsible-header .effect-collapsible-title')?.textContent?.trim();
          if (title) idx = existing.findIndex(e => (e.name === title));
        }
        if (idx === -1) {
          ui.notifications?.warn?.('Efeito não encontrado para remoção.');
          return;
        }
        existing.splice(idx, 1);
        try {
          await this.document.update({ ['flags.wayfinder.embeddedEffects']: existing });
          try { this.render(true); } catch (e) {}
          ui.notifications?.info?.('Efeito removido.');
          return;
        } catch (err) {
          console.debug('Wayfinder | document.update failed on remove (actor)', err);
        }
        ui.notifications?.warn?.('Não foi possível remover o efeito persistentemente; verifique permissões.');
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
      // Roll attack from collapsible effect button
      if (ev.target.closest('.effect-roll-btn')) {
        ev.preventDefault();
        ev.stopPropagation();
        const btn = ev.target.closest('.effect-roll-btn');
        const domEffectId = btn.dataset.effectId;
        // Prefer explicit ActiveEffect identifiers first, then UUIDs, then source/item ids
        const wrapper = btn.closest('[data-real-id]') || btn.closest('[data-uuid]') || btn.closest('[data-effect-id]') || btn.closest('[data-source-item-id]') || btn.closest('[data-item-id]') || btn.closest('.effect-item');
        const resolvedUuid = wrapper?.dataset?.realId || wrapper?.dataset?.uuid || wrapper?.dataset?.effectId || wrapper?.dataset?.sourceItemId || wrapper?.dataset?.itemId || null;
        let idToOpen = resolvedUuid || domEffectId;
        console.log('Wayfinder | effect-roll-btn clicked', { domEffectId, resolvedUuid, idToOpen });

        // Build candidate ids, prefer the right-hand side of `::` when present
        const candidates = [];
        try {
          if (typeof idToOpen === 'string') {
            if (idToOpen.includes('::')) {
              const parts = idToOpen.split('::');
              // Try the RHS first (often the embedded document id), then LHS, then full
              candidates.push(parts[1], parts[0], idToOpen);
            } else {
              candidates.push(idToOpen);
            }
          }
        } catch (err) {
          console.warn('Wayfinder | building candidate ids failed', err);
        }
        if (domEffectId) candidates.push(domEffectId);

        // Helper to normalize common prefixes like 'Item.X', 'ActiveEffect.Y' or
        // fully-qualified UUIDs such as 'Compendium.world.pack.Item.X' by returning
        // the most-significant id segment (the last token).
        const normalize = (s) => {
          if (!s || typeof s !== 'string') return s;
          let out = s;
          try {
            if (out.includes('::')) out = out.split('::').pop();
            // If the value contains dot-separated namespaces (Actor./Item./Compendium...),
            // prefer the last token which is usually the raw id we need to compare against.
            if (out.includes('.')) out = out.split('.').pop();
            // Also strip common leading prefixes like 'Item.' or 'ActiveEffect.' if still present
            if (out.startsWith('Item.') || out.startsWith('ActiveEffect.') || out.startsWith('Actor.')) {
              out = out.split('.').pop() || out;
            }
          } catch (e) {
            /* ignore */
          }
          return out;
        };

        // Try candidates until we find an ActiveEffect or a matching AE for an Item
        let ae = null;
        let resolvedCandidate = null;
        for (const c of candidates) {
          const n = normalize(c);
          if (!n) continue;
          console.log('Wayfinder | trying candidate', { raw: c, normalized: n });
          // Direct ActiveEffect match
          const maybeAe = this.document.effects.get(n);
          if (maybeAe) {
            console.log('Wayfinder | candidate resolved as actor ActiveEffect', n);
            ae = maybeAe;
            resolvedCandidate = n;
            break;
          }
          // If it's an Item id, try to find an AE that references it
          const maybeItem = this.document.items.get(n);
          if (maybeItem) {
            console.log('Wayfinder | candidate looks like Item id, searching actor effects for source refs', maybeItem.id);
            const found = this.document.effects.find(e => {
              return (e?.flags?.wayfinder?.sourceItemId === maybeItem.id) || (e?.flags?.core?.sourceId === `Item.${maybeItem.id}`) || (e?.source === `Item.${maybeItem.id}`);
            });
            if (found) {
              console.log('Wayfinder | found actor ActiveEffect referencing Item', found.id, 'for item', maybeItem.id);
              ae = found;
              resolvedCandidate = found.id;
              break;
            }
          }
        }

        // If still not found, search embedded ActiveEffects inside items (e.g., talents)
        if (!ae) {
          // Attempt to resolve candidate RHS tokens against compendium packs.
          try {
            if (typeof game !== 'undefined' && game.packs && game.packs.size) {
              // Build a list of RHS tokens to try (tokens that look like short ids)
              const rhsTokens = [];
              for (const c of candidates) {
                if (!c || typeof c !== 'string') continue;
                const token = c.includes('::') ? c.split('::').pop() : (c.includes('.') ? c.split('.').pop() : c);
                if (token) rhsTokens.push(token);
              }
              for (const token of rhsTokens) {
                try {
                  for (const pack of game.packs.values()) {
                    try {
                      // Only consider Item packs (collections like 'world.classes')
                      const meta = pack.metadata || {};
                      const docType = meta.type || meta.documentName || '';
                      if (docType && docType !== 'Item' && docType !== 'Actor' && docType !== '') continue;
                      const guess = `Compendium.${pack.collection}.Item.${token}`;
                      console.log('Wayfinder | trying compendium guess', guess);
                      const resolved = await fromUuid(guess).catch(() => null);
                      if (resolved) {
                        console.log('Wayfinder | compendium resolved', guess, resolved?.documentName || resolved?.type || resolved?.name);
                        if (resolved.documentName === 'ActiveEffect' || (resolved.constructor && resolved.constructor.name === 'ActiveEffect')) {
                            ae = resolved;
                            resolvedCandidate = resolved.id || resolved._id || token;
                            break;
                        } else if (resolved.documentName === 'Item' || resolved.type) {
                          // If it's an Item, attempt to find an embedded effect inside it matching token
                          const innerList = (resolved.effects || resolved.system?.effects || []);
                          // Add all embedded AE ids to forms so RHS AE ids are compared
                          try {
                            for (const e2 of innerList) {
                              const e2id = (e2 && (e2._id || e2.id || e2.uuid)) ? (e2._id || e2.id || e2.uuid) : (typeof e2 === 'string' ? (e2.includes('::') ? e2.split('::').pop() : e2) : null);
                              if (e2id) {
                                forms.add(e2id);
                                forms.add(normalize(e2id));
                                forms.add(`${it.id}::${e2id}`);
                                forms.add(`${resolved.id || resolved._id || token}::${e2id}`);
                              }
                            }
                          } catch (e) { /* ignore */ }
                          const inner = innerList.find(e => (e && ((e._id === token) || (e.id === token) || (e.uuid === token))) || (normalize((e && (e._id || e.id || e.uuid)) || e) === token));
                          if (inner) {
                            ae = inner;
                            resolvedCandidate = `${token}::${inner._id || inner.id || token}`;
                            break;
                          }
                        }
                      }
                    } catch (e) { /* ignore pack-level errors */ }
                    if (ae) break;
                  }
                } catch (e) { /* ignore token-level errors */ }
                if (ae) break;
              }
            }
          } catch (e) {
            /* ignore compendium lookup errors */
          }
          try {
            // Precompute normalized candidate forms for robust matching
            const candNorms = new Set();
            for (const c of candidates) {
              if (!c) continue;
              candNorms.add(c);
              try { candNorms.add(normalize(c)); } catch(e) {}
              try { if (typeof c === 'string' && c.includes('::')) candNorms.add(c.split('::').pop()); } catch(e) {}
            }
            for (const it of this.document.items) {
              try {
                // Include any embedded effects stored in flags.wayfinder.embeddedEffects
                const effects = it.effects || it.system?.effects || it.flags?.wayfinder?.embeddedEffects || [];
                for (const ef of effects) {
                  // ef may be an ActiveEffect-like object, a plain object stored in flags,
                  // or a UUID string reference
                  const efId = (ef && (ef.id || ef._id || ef.uuid)) ? (ef.id || ef._id || ef.uuid) : (typeof ef === 'string' ? (ef.includes('::') ? ef.split('::').pop() : ef) : null);
                  if (!efId) continue;
                  const norm = normalize(efId) || efId;
                  // Build comparison forms
                  const forms = new Set([efId, norm, it.id, `${it.id}::${efId}`, `${it.id}::${norm}`]);
                  // If the effect entry is a UUID string, attempt to resolve it to include
                  // the referenced document's id (e.g., ActiveEffect id) in the comparison forms.
                  try {
                    if (typeof ef === 'string' && typeof fromUuid === 'function') {
                      const looksLikeUuid = ef.includes('.') || ef.startsWith('Compendium') || ef.includes('Actor') || ef.includes('Item');
                      if (looksLikeUuid) {
                        try {
                          const resolvedEfDoc = await fromUuid(ef).catch(() => null);
                          if (resolvedEfDoc) {
                            const rid = resolvedEfDoc.id || resolvedEfDoc._id || null;
                            if (rid) {
                              forms.add(rid);
                              forms.add(normalize(rid));
                              forms.add(`${it.id}::${rid}`);
                            }
                          }
                        } catch (e) { /* ignore resolution errors */ }
                      }
                    }
                  } catch (e) { /* ignore */ }
                  // Also include possible item.uuid forms if available
                  try { if (it.uuid) forms.add(`${it.uuid}::${efId}`); } catch(e) {}
                  // Check for any overlap with candidate norms
                  let matched = false;
                  for (const f of forms) {
                    if (!f) continue;
                    if (candNorms.has(f) || candidates.includes(f)) { matched = true; break; }
                  }
                  if (matched) {
                    console.log('Wayfinder | matched embedded effect', { item: it.id, effect: efId, normalized: norm });
                    // If the embedded entry is an object (embedded ActiveEffect-like), use it directly
                    if (ef && typeof ef === 'object') {
                      ae = ef;
                      parentItemForAe = it;
                    } else if (typeof ef === 'string') {
                      // If the effect is stored as a UUID/string reference, attempt to resolve it
                      try {
                        const resolved = (typeof fromUuid === 'function') ? await fromUuid(ef).catch(() => null) : null;
                        if (resolved) {
                          // resolved may be an ActiveEffect or an Item; prefer ActiveEffect
                          if (resolved.documentName === 'ActiveEffect' || (resolved.constructor && resolved.constructor.name === 'ActiveEffect')) {
                            ae = resolved;
                            parentItemForAe = it;
                          } else if (resolved.documentName === 'Item') {
                            // If it resolves to an Item, try to find an embedded AE matching efId inside it
                            const inner = (resolved.effects || resolved.system?.effects || []).find(e2 => (e2._id === efId) || (e2.id === efId) || (e2.uuid === ef) || (normalize(e2._id || e2.id || e2) === norm));
                            if (inner) { ae = inner; parentItemForAe = resolved; }
                            else {
                              // treat the resolved Item as the effect source
                              effect = resolved;
                              parentItemForAe = it;
                            }
                          } else {
                            // Fallback: keep the string id but expose the composite identifier
                            ae = null;
                          }
                        }
                      } catch (e) {
                        /* ignore resolution errors */
                      }
                    }
                    // Use a stable idToOpen form combining item and effect so downstream resolution can locate embedded effects
                    resolvedCandidate = `${it.id}::${efId}`;
                    break;
                  }
                }
                if (ae) break;
              } catch (inner) { /* ignore per-item errors */ }
            }
          } catch (err) {
            console.warn('Wayfinder | scanning embedded item effects failed', err);
          }
        }

        if (!ae) {
          // Try resolving the original resolvedUuid (full UUID) via fromUuid, which may return
          // an embedded ActiveEffect or referenced document (e.g., from talents/compendium).
          try {
            if (resolvedUuid && typeof fromUuid === 'function') {
              const tryResolve = async (u) => {
                try {
                  console.log('Wayfinder | fromUuid trying', u);
                  const d = await fromUuid(u);
                  if (d) return d;
                } catch (e) {
                  // ignore
                }
                return null;
              };

              let resolvedDoc = null;

              // If the dataset stored a short form like "lhs::rhs" without prefixes,
              // attempt several plausible fully-qualified UUIDs used by Foundry.
              if (resolvedUuid.includes('::') && !resolvedUuid.includes('.')) {
                const [lhs, rhs] = resolvedUuid.split('::');
                const guessList = [
                  `Actor.${this.document.id}.Item.${lhs}.ActiveEffect.${rhs}`,
                  `Actor.${this.document.id}.ActiveEffect.${rhs}`,
                  `Item.${lhs}.ActiveEffect.${rhs}`,
                  `Actor.${lhs}.ActiveEffect.${rhs}`,
                  `Item.${lhs}`,
                  `Actor.${this.document.id}.Item.${lhs}`
                ];
                for (const g of guessList) {
                  resolvedDoc = await tryResolve(g);
                  if (resolvedDoc) break;
                }
              }

              // Try the raw resolvedUuid (in case it already contains prefixes)
              if (!resolvedDoc) resolvedDoc = await tryResolve(resolvedUuid);

              // As a last attempt, try assuming resolvedUuid is just the AE id
              if (!resolvedDoc) {
                const rhs = resolvedUuid.includes('::') ? resolvedUuid.split('::').pop() : resolvedUuid;
                resolvedDoc = await tryResolve(`Actor.${this.document.id}.ActiveEffect.${rhs}`);
              }

              if (resolvedDoc) {
                if (resolvedDoc?.documentName === 'ActiveEffect' || (resolvedDoc.constructor && resolvedDoc.constructor.name === 'ActiveEffect')) {
                  ae = resolvedDoc;
                  resolvedCandidate = ae.id;
                } else if (resolvedDoc?.documentName === 'Item' || resolvedDoc?.type) {
                  const fx = resolvedDoc.effects?.find?.(e => !!e) || null;
                  if (fx) {
                    ae = fx;
                    resolvedCandidate = fx.id || fx._id || null;
                  }
                }
              }
            }
          } catch (err) {
            console.warn('Wayfinder | fromUuid resolution failed', err);
          }

          if (!ae) {
            console.warn('Wayfinder | could not resolve an ActiveEffect to open attack dialog for', { domEffectId, resolvedUuid, idToOpen });
            // Fallback: attempt to open the attack dialog anyway and let
            // `_openAttackDialog` perform additional resolution (compendia, UUIDs, etc.).
            try {
              if (idToOpen && typeof this._openAttackDialog === 'function') {
                console.log('Wayfinder | falling back to _openAttackDialog with', idToOpen);
                this._openAttackDialog(idToOpen, btn);
              }
            } catch (e) {
              console.warn('Wayfinder | fallback _openAttackDialog failed', e);
            }
            return;
          }
        }

        idToOpen = resolvedCandidate || idToOpen;
        console.log('Wayfinder | resolved ActiveEffect id for attack dialog', idToOpen, 'hasOpenMethod?', !!this._openAttackDialog);
        if (idToOpen) this._openAttackDialog(idToOpen, btn);
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
              // Initialize any rich-text editor groups inside the newly injected talent content
              try {
                if (typeof this._setupRichTextEditor === 'function') this._setupRichTextEditor(content);
              } catch (ie) {
                console.warn('Wayfinder | failed to init rich text editors inside talent content', ie);
              }
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
            content: `Tem certeza que deseja remover este talento?`,
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
                const c = normalizeColor(trait.system?.color);
                traitsResolvedEffect.push({
                  uuid: traitUuid,
                  name: trait.name,
                  color: c,
                  textColor: getContrastColor(c)
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

          // Attach metadata indicating this effect originates from the parent talent
          effectData.sourceTalentId = item._id;
          effectData.sourceTalentName = item.name;
          effectData.sourceTalentType = item.system?.talentType || 'General';

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
          const c = normalizeColor(trait.system?.color);
          traitsResolved.push({
            uuid: traitUuid,
            name: trait.name,
            color: c,
            textColor: getContrastColor(c)
          });
        }
      } catch (err) {
        console.warn('Erro ao resolver trait:', traitUuid, err);
      }
    }

    // Build effects HTML via existing helper and render a Handlebars partial
    const activeEffectsHtml = await Promise.all((activeEffects || []).map(async (fx, i) => {
      try {
        const inner = Handlebars.helpers.collapsibleEffect({ hash: { effect: fx, idx: i } });
        return await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/effect-item.hbs', {
          wrapperClass: 'effect-item active-effect-item',
          uuid: fx.uuid,
          inner
        });
      } catch (e) {
        console.warn('Wayfinder | failed to render active effect item partial', e);
        return '';
      }
    })).then(arr => arr.join(''));

    const passiveEffectsHtml = await Promise.all((passiveEffects || []).map(async (fx, i) => {
      try {
        const inner = Handlebars.helpers.collapsibleEffect({ hash: { effect: fx, idx: i } });
        return await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/effect-item.hbs', {
          wrapperClass: 'effect-item passive-effect-item',
          uuid: fx.uuid,
          inner
        });
      } catch (e) {
        console.warn('Wayfinder | failed to render passive effect item partial', e);
        return '';
      }
    })).then(arr => arr.join(''));

    try {
      const rendered = await foundry.applications.handlebars.renderTemplate(
        'systems/wayfinder/templates/components/talent-readonly.hbs',
        {
          item,
          traitsResolved,
          activeEffects,
          passiveEffects,
          activeEffectsHtml,
          passiveEffectsHtml
        }
      );
      return rendered;
    } catch (err) {
      console.warn('Wayfinder | failed to render talent-readonly template', err);
      try {
        return await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/talent-readonly-error.hbs', {});
      } catch (e) {
        console.warn('Wayfinder | failed to render talent-readonly-error partial, falling back', e);
        return 'Erro ao renderizar talento';
      }
    }
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
    // Effects may be stored as Items on the actor, as embedded ActiveEffect objects
    // within an Item (e.g., talents), or as top-level ActiveEffect documents on the actor.
    // Try to resolve an Item or an ActiveEffect by id/uuid with multiple fallbacks.
    let effect = this.document.items.get(effectId) || null;
    let ae = this.document.effects.get(effectId) || null;
    // Keep a reference to a parent Item if we discover an embedded ActiveEffect inside it
    let parentItemForAe = null;

    if (!effect && !ae) {
      // 1) Try matching embedded items by common identifiers (uuid/_id/id)
      effect = this.document.items.find(i => (i.uuid === effectId) || (i._id === effectId) || (i.id === effectId)) || null;
    }

    if (!effect && !ae) {
      // 2) Scan items for an embedded ActiveEffect payload (e.g., talent.effects)
      for (const it of this.document.items) {
        try {
          const found = (it.effects || []).find(e => (e._id === effectId) || (e.id === effectId) || (e.uuid === effectId));
          if (found) {
            ae = found;
            parentItemForAe = it;
            break;
          }
        } catch (err) {
          // ignore malformed items
        }
      }
    }

    if (!effect && !ae) {
      // 3) Try resolving as a Foundry UUID (async)
      try {
        const resolved = await fromUuid(effectId).catch(() => null);
        if (resolved) {
          if (resolved.documentName === 'Item') effect = resolved;
          else if (resolved.documentName === 'ActiveEffect') ae = resolved;
        }
      } catch (err) {
        console.warn('Wayfinder | fromUuid resolution failed', err);
      }
    }

    if (!effect && !ae) {
      console.log('Wayfinder | could not resolve an Item or ActiveEffect for', effectId);
      return;
    }

    const focusCost = (effect && effect.system && effect.system.focusCost) || (ae && ae.system && ae.system.focusCost) || 0;
    const currentFocus = this.document.system?.focus?.current || 0;

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

    // Send to chat if specified (render via partial, fallback to inline HTML)
    if (effect.system.chatEffect) {
      const speaker = ChatMessage.getSpeaker({ actor: this.document });
      let chatContent = null;
      try {
        chatContent = await foundry.applications.handlebars.renderTemplate(
          'systems/wayfinder/templates/components/effect-activation.hbs',
          {
            title: effect.name,
            chatEffect: effect.system.chatEffect,
            requiresRoll: effect.system.requiresRoll,
            rollFormula: effect.system.rollFormula
          }
        );
      } catch (e) {
        console.warn('Wayfinder | failed to render effect activation partial, falling back to text', e);
        chatContent = `${effect.name}: ${effect.system.chatEffect || ''}` + (effect.system.requiresRoll ? ` (Roll requerido: ${effect.system.rollFormula})` : '');
      }

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
        // Allow actor-level stored strike/spell defaults
        const baseStrike = this.document.system?.strike || {};
        const baseSpell = this.document.system?.spell || {};

        // Attempt to resolve the source item for this effect (if any) to detect spell attacks
        let srcItem = null;
        try {
          let sourceItemId = null;
          if (effect && effect.flags?.wayfinder?.sourceItemId) sourceItemId = effect.flags.wayfinder.sourceItemId;
          else if (ae && ae.flags?.wayfinder?.sourceItemId) sourceItemId = ae.flags.wayfinder.sourceItemId;
          else if (effect && effect.origin && String(effect.origin).startsWith('Item.')) sourceItemId = String(effect.origin).split('.')[1];
          else if (ae && ae.origin && String(ae.origin).startsWith('Item.')) sourceItemId = String(ae.origin).split('.')[1];
          else if (effect && effect.system && effect.system.sourceItemId) sourceItemId = effect.system.sourceItemId;
          if (sourceItemId) srcItem = this.document.items.get(sourceItemId) || null;
        } catch (e) { srcItem = null; }

        const isSpellAttack = !!(srcItem && srcItem.type === 'spell');

        let circun = Number(strike.circun ?? (effect && effect.system && effect.system.circun) ?? 0) || 0;
        let itemMod = Number(strike.item ?? (effect && effect.system && effect.system.item) ?? 0) || 0;
        let status = Number(strike.status ?? (effect && effect.system && effect.system.status) ?? 0) || 0;

        // Merge actor-level stored strike/spell values depending on attack type
        try {
          if (isSpellAttack) {
            circun += Number(baseSpell.circun || 0) || 0;
            itemMod += Number(baseSpell.item || 0) || 0;
            status += Number(baseSpell.status || 0) || 0;
          } else {
            circun += Number(baseStrike.circun || 0) || 0;
            itemMod += Number(baseStrike.item || 0) || 0;
            status += Number(baseStrike.status || 0) || 0;
          }
        } catch (e) { /* ignore */ }

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

        const attackPreview = `Formula de Ataque: ${attackFormula}`;
        const damagePreview = `Formula de Dano: ${damageFormula}${damageType ? ` (${damageType})` : ''}`;

        // Build dialog content with editable fields via the richer attack-form partial
        let content = null;
        try {
          const initialMods = Number(prof || 0) + Number(attrValue || 0) + Number(circun || 0) + Number(itemMod || 0) + Number(status || 0);
          content = await foundry.applications.handlebars.renderTemplate(
            'systems/wayfinder/templates/components/attack-form.hbs',
            { effectName: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque', prof, attrKey, attrValue, circun, itemMod, status, initialMods, damageFormula, damageType }
          );
        } catch (e) {
          console.warn('Wayfinder | failed to render attack-form partial, falling back to simple dialog', e);
          content = `${attackPreview} | ${damagePreview}`;
        }

        // Render icon partials so JS does not contain HTML literals
        let iconBull = '';
        let iconBolt = '';
        try {
          iconBull = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-bullseye' });
          iconBolt = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-bolt' });
        } catch (ie) {
          console.warn('Wayfinder | failed to render icon partials', ie);
          iconBull = 'fas fa-bullseye';
          iconBolt = 'fas fa-bolt';
        }
        if (typeof iconBull === 'string' && !iconBull.includes('<')) iconBull = `<i class="${iconBull}"></i>`;
        if (typeof iconBolt === 'string' && !iconBolt.includes('<')) iconBolt = `<i class="${iconBolt}"></i>`;

        const dlg = new Dialog({
          title: `Rolagem de Ataque: ${(ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque'}`,
          content: content,
          render: (html) => {
            const updatePreview = () => {
              const p = Number(html.find('#wf-prof').val()) || 0;
              const a = Number(html.find('#wf-attr').val()) || 0;
              const c = Number(html.find('#wf-circun').val()) || 0;
              const it = Number(html.find('#wf-itemmod').val()) || 0;
              const st = Number(html.find('#wf-status').val()) || 0;
              const total = p + a + c + it + st;
              const rt = html.find('#wf-roll-type').val();
              const previewFormula = (rt === 'normal') ? '2d10' : (rt === 'adv' ? '3d10 keep 2 (drop lowest)' : '3d10 keep 2 (drop highest)');
              html.find('#wf-attack-preview').html(`${previewFormula} + ${total}`);
            };
            html.find('#wf-roll-type, #wf-prof, #wf-attr, #wf-circun, #wf-itemmod, #wf-status').on('change input', updatePreview);
          },
          buttons: {
            attack: {
              icon: iconBull,
              label: 'Rolar Ataque',
              callback: async (html) => {
                try {
                  const type = html.find('#wf-roll-type').val();
                  const p = Number(html.find('#wf-prof').val()) || 0;
                  const a = Number(html.find('#wf-attr').val()) || 0;
                  const c = Number(html.find('#wf-circun').val()) || 0;
                  const it = Number(html.find('#wf-itemmod').val()) || 0;
                  const st = Number(html.find('#wf-status').val()) || 0;
                  const mods = p + a + c + it + st;

                  if (type === 'normal') {
                    const r = new Roll(`2d10 + ${mods}`);
                    await r.evaluate();

                    const diceResults = (r.dice && r.dice[0] && Array.isArray(r.dice[0].results)) ? r.dice[0].results.map(d => d.result).join(', ') : '';
                    const finalTotal = r.total ?? r._total ?? '';
                    const attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                      title: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      effectName: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      itemName: srcItem?.name || null,
                      showItem: Boolean(itemNameSuffix),
                      attackTotal: finalTotal,
                      stats: [
                        { label: 'ATR', value: a },
                        { label: 'Prof', value: p },
                        { label: 'Circun', value: c },
                        { label: 'Item', value: it },
                        { label: 'Status', value: st }
                      ],
                      attackFormula: `2d10 + ${mods}`,
                      attackDice: diceResults,
                      effectDescription: effectDescription,
                      both: false
                    });

                    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
                  } else {
                    const r3 = new Roll('3d10');
                    await r3.evaluate();
                    const results = r3.dice[0].results.map(d => d.result);
                    const sorted = results.slice().sort((a, b) => a - b);
                    let kept = 0;
                    let keptDiceText = '';
                    if (type === 'adv') {
                      kept = sorted[1] + sorted[2];
                      keptDiceText = `${sorted[1]}, ${sorted[2]}`;
                    } else {
                      kept = sorted[0] + sorted[1];
                      keptDiceText = `${sorted[0]}, ${sorted[1]}`;
                    }
                    const attackTotal = kept + mods;

                    const attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                      title: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      effectName: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      itemName: srcItem?.name || null,
                      showItem: Boolean(itemNameSuffix),
                      attackTotal: attackTotal,
                      effectDescription: effectDescription,
                      stats: [
                        { label: 'Dados (3d10)', value: results.join(', '), small: true },
                        { label: 'Mantidos', value: keptDiceText },
                        { label: 'Mods', value: mods }
                      ],
                      both: false,
                      attackFormula: `${kept} + ${mods}`,
                      attackDice: results.join(', ')
                    });

                    await r3.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
                  }
                } catch (err) { console.error('Erro ao rolar ataque:', err); ui.notifications.error('Erro ao rolar ataque'); }
              }
            },
            both: {
              icon: iconBolt,
              label: 'Rolar Ataque + Dano',
              callback: async (html) => {
                try {
                  const type = html.find('#wf-roll-type').val();
                  const p = Number(html.find('#wf-prof').val()) || 0;
                  const a = Number(html.find('#wf-attr').val()) || 0;
                  const c = Number(html.find('#wf-circun').val()) || 0;
                  const it = Number(html.find('#wf-itemmod').val()) || 0;
                  const st = Number(html.find('#wf-status').val()) || 0;
                  const mods = p + a + c + it + st;

                  let attackCard = '';
                  if (type === 'normal') {
                    const r = new Roll(`2d10 + ${mods}`);
                    await r.evaluate();
                    const diceResults = (r.dice && r.dice[0] && Array.isArray(r.dice[0].results)) ? r.dice[0].results.map(d => d.result).join(', ') : '';
                    const attackTotal = r.total ?? r._total ?? '';

                    const dmgRoll = new Roll(damageFormula);
                    await dmgRoll.evaluate();
                    const dmgDice = (dmgRoll.dice && dmgRoll.dice[0] && Array.isArray(dmgRoll.dice[0].results)) ? dmgRoll.dice[0].results.map(d => d.result).join(', ') : '';
                    const dmgTotal = dmgRoll.total ?? dmgRoll._total ?? '';

                    attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                      title: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      effectName: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      itemName: srcItem?.name || null,
                      showItem: Boolean(itemNameSuffix),
                      attackTotal: attackTotal,
                      effectDescription: effectDescription,
                      stats: [
                        { label: 'ATR', value: a },
                        { label: 'Prof', value: p },
                        { label: 'Circun', value: c },
                        { label: 'Item', value: it },
                        { label: 'Status', value: st }
                      ],
                      attackFormula: `2d10 + ${mods}`,
                      attackDice: diceResults,
                      damageFormula: damageFormula,
                      damageDice: dmgDice,
                      damageTotal: dmgTotal,
                      damageType: damageType || '—',
                      both: true
                    });

                    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
                  } else {
                    const r3 = new Roll('3d10');
                    await r3.evaluate();
                    const results = r3.dice[0].results.map(d => d.result);
                    const sorted = results.slice().sort((a, b) => a - b);
                    let kept = 0;
                    let keptDiceText = '';
                    if (type === 'adv') { kept = sorted[1] + sorted[2]; keptDiceText = `${sorted[1]}, ${sorted[2]}`; }
                    else { kept = sorted[0] + sorted[1]; keptDiceText = `${sorted[0]}, ${sorted[1]}`; }
                    const attackTotal = kept + mods;

                    const dmgRoll = new Roll(damageFormula);
                    await dmgRoll.evaluate();
                    const dmgDice = (dmgRoll.dice && dmgRoll.dice[0] && Array.isArray(dmgRoll.dice[0].results)) ? dmgRoll.dice[0].results.map(d => d.result).join(', ') : '';
                    const dmgTotal = dmgRoll.total ?? dmgRoll._total ?? '';

                    attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                      title: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      effectName: (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque',
                      itemName: srcItem?.name || null,
                      showItem: Boolean(itemNameSuffix),
                      attackTotal: attackTotal,
                      effectDescription: effectDescription,
                      stats: [
                        { label: 'Dados (3d10)', value: results.join(', '), small: true },
                        { label: 'Mantidos', value: keptDiceText },
                        { label: 'Mods', value: mods }
                      ],
                      attackFormula: `${kept} + ${mods}`,
                      attackDice: results.join(', '),
                      damageFormula: damageFormula,
                      damageDice: dmgDice,
                      damageTotal: dmgTotal,
                      damageType: damageType || '—',
                      both: true
                    });

                    await r3.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
                  }
                } catch (err) { console.error('Erro ao rolar ataque+dano:', err); ui.notifications.error('Erro ao rolar ataque+dano'); }
              }
            },
            cancel: { label: 'Cancelar' }
          },
          default: 'attack'
        });
        try { dlg.render(true); } catch (err) { console.error('Wayfinder | dialog render failed', err); }
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
        let dialogContent = null;
        try {
          dialogContent = await foundry.applications.handlebars.renderTemplate(
            'systems/wayfinder/templates/components/attack-dialog.hbs',
            { attackFormula: formula, damageFormula: null, damageType: null }
          );
        } catch (e) {
          console.warn('Wayfinder | failed to render generic attack-dialog partial', e);
          dialogContent = `Formula: ${formula}`;
        }
        const dlg = new Dialog({
          title: `${(effect && effect.name) || (ae && ae.label) || 'Roll'}`,
          content: dialogContent,
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
    try {
      if (effect) {
        await effect.update({ 'system.isActive': true });
      } else if (ae && typeof ae.update === 'function') {
        await ae.update({ 'system.isActive': true });
      } else if (typeof parentItemForAe !== 'undefined' && parentItemForAe) {
        // Update an embedded ActiveEffect inside its parent Item
        try {
          await parentItemForAe.updateEmbeddedDocuments('ActiveEffect', [{ _id: (ae && (ae._id || ae.id)), 'system.isActive': true }]);
        } catch (e) {
          console.warn('Wayfinder | could not update embedded ActiveEffect state', e);
        }
      }
    } catch (e) {
      console.warn('Wayfinder | marking effect active failed', e);
    }
    // Foundry auto-renders on update
  }

  /**
   * Open a dedicated attack dialog for an effect (pre-fills values and supports adv/dis as 3d10 pick)
   * @param {string} effectId
   */
  async _openAttackDialog(effectId, btn = null) {
    console.log('Wayfinder | _openAttackDialog called with', effectId, 'btn?', !!btn);
    // Resolve either Item or ActiveEffect robustly
    // Support composite ids created earlier like `itemId::effectId`
    let effect = null;
    let ae = null;
    if (typeof effectId === 'string' && effectId.includes('::')) {
      const [itemId, effId] = effectId.split('::');
      effect = this.document.items.get(itemId) || null;
      if (effect) {
        // try find embedded AE by _id or id
        const found = (effect.effects || effect.system?.effects || []).find(e => (e._id === effId) || (e.id === effId) || (e._id === effId) || (e.id === effId));
        if (found) {
          ae = found;
        }
      }
      // if not found yet, still attempt direct lookups below
    }
    if (!effect) effect = this.document.items.get(effectId);
    if (!ae) ae = this.document.effects.get(effectId);
    // Parent item for an embedded ActiveEffect (if applicable)
    let parentItemForAe = null;

    // If neither found, try to locate by alternative keys
    if (!effect && !ae) {
      // Try matching embedded items by common identifiers
      effect = this.document.items.find(i => (i.uuid === effectId) || (i._id === effectId) || (i.id === effectId));
      if (!effect) {
        // If we have the DOM button, attempt to resolve an owning talent/item and its embedded effect
        try {
          if (btn && !effect && !ae) {
            const talentElem = btn.closest('.talent-item') || btn.closest('[data-item-id]');
            const talentId = talentElem?.dataset?.itemId || talentElem?.dataset?.id || null;
            if (talentId) {
              const talentItem = this.document.items.get(talentId);
              if (talentItem) {
                const found = talentItem.effects.find(e => (e._id === effectId) || (e.id === effectId) || (e.uuid === effectId));
                if (found) {
                  ae = found;
                  effect = null;
                  parentItemForAe = talentItem;
                }
              }
            }
          }
        } catch (err) {
          console.warn('Wayfinder | error while resolving via DOM talent element', err);
        }

        // Additionally, scan all items for an embedded ActiveEffect payload (covers talents stored differently)
        if (!effect && !ae) {
          for (const it of this.document.items) {
            try {
              const found = (it.effects || []).find(e => (e._id === effectId) || (e.id === effectId) || (e.uuid === effectId));
              if (found) {
                ae = found;
                parentItemForAe = it;
                break;
              }
            } catch (err) {
              // ignore malformed items
            }
          }
        }

        // Try resolving as a Foundry UUID (e.g., 'Item.xxx' or 'Actor.xxx.Item.xxx')
        try {
          const resolved = await fromUuid(effectId).catch(() => null);
          if (resolved) {
            if (resolved.documentName === 'Item') effect = resolved;
            else if (resolved.documentName === 'ActiveEffect') ae = resolved;
          }
        } catch (err) {
          console.warn('Wayfinder | fromUuid resolution failed', err);
        }
      }
    }

    if (!effect && !ae) {
      console.log('Wayfinder | could not resolve an Item or ActiveEffect for', effectId);
      return;
    }

    console.log('Wayfinder | after resolve', { hasEffect: !!effect, hasAe: !!ae, effectId });
    // Diagnostic: always log activation attempts early so we can see calls
    // even if focus checks or non-attack branches prevent later logs from running.
    try {
      console.log('Wayfinder | Activating effect', effectId, { effect: effect ? { id: effect.id, name: effect.name } : null, ae: ae ? { id: ae.id || ae._id, label: ae.label || ae.name } : null });
    } catch (e) { /** ignore logging errors */ }

    console.log('Wayfinder | after resolve', { hasEffect: !!effect, hasAe: !!ae, effectId });

    // Try to resolve an origin item if present
    let srcItem = null;
    try {
      const origin = (effect && effect.flags?.wayfinder?.sourceItemId) || (effect && effect.origin) || (ae && ae.origin) || null;
      let sourceItemId = null;
      if (origin && String(origin).startsWith('Item.')) sourceItemId = String(origin).split('.')[1];
      if (!sourceItemId && effect && effect.flags?.wayfinder?.sourceItemId) sourceItemId = effect.flags.wayfinder.sourceItemId;
      if (sourceItemId) srcItem = this.document.items.get(sourceItemId) || null;
      // If the resolved effect itself is an Item (e.g., a weapon), treat it as the source item
      if (!srcItem && effect && effect.type === 'item') srcItem = effect;
    } catch (e) { srcItem = null; }

    console.log('Wayfinder | resolved source item', srcItem?.id, srcItem?.name);

    // Build a display title combining effect/talent name and source item name: "Effect - Item"
    // Prefer the ActiveEffect label/name when available, otherwise fall back to Item name
    const effectName = (ae && (ae.label || ae.name)) || (effect && effect.name) || 'Ataque';
    // Only append the source item name if it's present and different from the effect name
    let itemNameSuffix = '';
    try {
      if (srcItem?.name) {
        const en = String(effectName || '').trim().toLowerCase();
        const sn = String(srcItem.name || '').trim().toLowerCase();
        if (sn && sn !== en) itemNameSuffix = ` - ${srcItem.name}`;
      }
    } catch (e) { itemNameSuffix = srcItem?.name ? ` - ${srcItem.name}` : ''; }
    const displayTitle = `${effectName}${itemNameSuffix}`;
    // Prepare a rich effect description (prefer ActiveEffect fields, then Item fields).
    // Handle Foundry editor fields which may be objects like {value: '<p>...</p>'}.
    let effectDescription = this._collectEffectDescription(effect, ae, parentItemForAe);
    if ((!effectDescription || !String(effectDescription).trim()) && typeof btn !== 'undefined' && btn) {
      const domText = this._extractTextFromDom(btn);
      if (domText) {
        effectDescription = domText;
        // If the effect name is generic, prefer the DOM text as the display name
        try {
          if (!effectName || effectName === 'Ataque' || effectName === 'Attack') {
            effectName = domText.split('\n')[0].trim();
          }
        } catch (e) { /* ignore */ }
      }
    }
    try {
      console.log('Wayfinder | effectDescription extracted', { length: effectDescription ? String(effectDescription).length : 0, snippet: effectDescription ? String(effectDescription).slice(0,200) : null });
    } catch (e) { /** ignore */ }
    // Dump full effect/item/ae objects for debugging description storage
    try {
      if (effect) {
        let dump = null;
        try { dump = (typeof effect.toObject === 'function') ? effect.toObject() : JSON.parse(JSON.stringify(effect)); } catch (e) { dump = { id: effect.id || effect._id || null, name: effect.name || null, type: effect.type || null, system: effect.system || null, flags: effect.flags || null }; }
        console.log('Wayfinder | effect dump', dump);
      }
    } catch (e) { console.warn('Wayfinder | effect dump failed', e); }
    try {
      if (ae) {
        let adump = null;
        try { adump = (typeof ae.toObject === 'function') ? ae.toObject() : JSON.parse(JSON.stringify(ae)); } catch (e) { adump = ae; }
        console.log('Wayfinder | ae dump', adump);
      }
    } catch (e) { console.warn('Wayfinder | ae dump failed', e); }
    try {
      if (parentItemForAe) {
        let pd = null;
        try { pd = (typeof parentItemForAe.toObject === 'function') ? parentItemForAe.toObject() : JSON.parse(JSON.stringify(parentItemForAe)); } catch (e) { pd = { id: parentItemForAe.id || parentItemForAe._id || null, name: parentItemForAe.name || null, system: parentItemForAe.system || null }; }
        console.log('Wayfinder | parentItemForAe dump', pd);
      }
    } catch (e) { console.warn('Wayfinder | parentItemForAe dump failed', e); }
    // Diagnostic: expose which names were chosen for display to help debug mismatches
    try {
      console.log('Wayfinder | resolved display names', {
        effectNameSource: ae ? 'ActiveEffect' : (effect ? 'Item' : null),
        aeLabel: ae?.label || null,
        effectNameRaw: effect?.name || null,
        parentItemForAe: parentItemForAe?.name || null,
        itemNameSuffix: itemNameSuffix || null,
        displayTitle: displayTitle || null
      });
    } catch (e) { /** ignore */ }
    // Log which kind of effect object we have
    if (effect) console.log('Wayfinder | effect is Item', effect.id, effect.name, effect.type);
    if (ae) console.log('Wayfinder | effect is ActiveEffect', ae.id || ae._id, ae.label || ae.name);

      // Diagnostic: expose key system fields for debugging proficiency/attribute resolution
      try {
        console.log('Wayfinder | DEBUG source item fields', {
          srcItemId: srcItem?.id || srcItem?._id || null,
          srcItemName: srcItem?.name || null,
          srcItemType: srcItem?.type || null,
          srcItemGroup: srcItem?.system?.group || srcItem?.system?.weaponGroup || null,
          srcItemTrainedFlag: srcItem?.system?.trained || srcItem?.system?.isTrained || srcItem?.system?.isProficient || null,
          srcItemProficiencyField: srcItem?.system?.proficiency || srcItem?.system?.prof || null,
          effectProfField: effect?.system?.prof || null,
          aeProfField: ae?.system?.prof || null,
          effectAttributeField: effect?.system?.attribute || ae?.system?.attribute || null
        });
      } catch (e) {
        console.warn('Wayfinder | DEBUG logging failed', e);
      }

    // Attribute key/value - normalize common abbreviations and dot-suffixed keys
    const normalizeAttrKey = (k) => {
      if (!k) return null;
      let key = String(k || '');
      if (key.includes('.')) key = key.split('.')[0];
      const MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };
      const up = key.toUpperCase();
      if (MAP[up]) return MAP[up];
      const lower = key.toLowerCase();
      // If the actor has this attribute key, prefer it
      if (this.document?.system?.attributes && Object.prototype.hasOwnProperty.call(this.document.system.attributes, lower)) return lower;
      return lower;
    };

    let attrKey = normalizeAttrKey((effect && effect.system && effect.system.attribute) || (ae && ae.system && ae.system.attribute) || null);
    if (!attrKey && srcItem && srcItem.system && srcItem.system.attribute) attrKey = normalizeAttrKey(srcItem.system.attribute);
    let attrValue = 0;
    if (attrKey) {
      try {
        const aobj = this.document.system?.attributes?.[attrKey];
        if (aobj) attrValue = Number(aobj.value ?? aobj.total ?? 0) || 0;
      } catch (e) { attrValue = 0; }
    }

    // Proficiency resolution with fallbacks per user's rules
    let prof = 0;
    // actor level used for 'trained' scaling
    const actorLevel = Number(this.document.system?.level?.value ?? this.document.system?.level ?? 0) || 0;
    const PROF_MAP = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
    const parseProfField = (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') return Number(val) || 0;
      const s = String(val).trim();
      if (/^[0-9]+$/.test(s)) return Number(s);
      const low = s.toLowerCase();
      if (PROF_MAP.hasOwnProperty(low)) return PROF_MAP[low] + actorLevel;
      return null;
    };
    try {
      // direct effect value first (allow strings like 'trained')
      const efProf = parseProfField((effect && effect.system && effect.system.prof) ?? (ae && ae.system && ae.system.prof) ?? null);
      prof = (efProf !== null) ? efProf : 0;
      if (!prof) {
        if (srcItem) {
          const itype = srcItem.type || '';
          if (itype === 'spell' || itype === 'talent' || itype === 'spellcasting') {
            prof = Number(srcItem.system?.prof ?? srcItem.system?.spellProf ?? this.document.system?.proficiencyBonus ?? 0) || 0;
          } else if (itype === 'weapon' || srcItem.system?.itemType === 'weapon' || srcItem.system?.itemType === 'axe' || srcItem.system?.itemType === 'melee') {
            const group = srcItem.system?.group || srcItem.system?.weaponGroup || srcItem.system?.itemType || srcItem.system?.groupName || null;
            let trained = false;
            if (group) {
              // Build a set of candidate identifiers from the item to match against actor proficiencies
              const candidates = [];
              try {
                const fields = [group, srcItem.system?.weaponGroup, srcItem.system?.itemType, srcItem.system?.groupName, srcItem.system?.group, srcItem.name];
                for (const f of fields) if (f) candidates.push(String(f).toLowerCase());
              } catch (e) {
                // ignore
              }

              // 1) Check talents/skills marking training for the group
              for (const cand of candidates) {
                const found = this.document.items.find(i => {
                  if (!(i.type === 'talent' || i.type === 'skill')) return false;
                  const inGroup = String(i.system?.group || i.name || '').toLowerCase();
                  if (inGroup !== cand) return false;
                  const sys = i.system || {};
                  const trainedFlags = [sys.trained, sys.isTrained, sys.isProficient, sys.proficiency, sys.proficient];
                  for (const f of trainedFlags) {
                    if (f === true) return true;
                    if (typeof f === 'string' && f.toLowerCase() === 'trained') return true;
                  }
                  return false;
                });
                if (found) { trained = true; break; }
              }

              // 2) Check actor's weapon proficiencies list with substring tolerance
              if (!trained) {
                try {
                  const aw = Array.isArray(this.document.system?.proficiencies?.weapons) ? this.document.system.proficiencies.weapons : [];
                  const lowerList = aw.map(x => String(x || '').toLowerCase());
                  for (const cand of candidates) {
                    if (lowerList.includes(cand)) { trained = true; break; }
                    // substring matches
                    if (lowerList.some(p => p.includes(cand) || cand.includes(p))) { trained = true; break; }
                  }
                  // also log for debugging
                  console.log('Wayfinder | weapon prof list', lowerList, 'candidates', candidates, 'trained?', trained);
                } catch (e) {
                  // ignore
                }
              }
            }
            // Also check if the weapon item itself carries a trained/proficiency indicator
            try {
              const selfTrained = srcItem.system?.trained || srcItem.system?.isTrained || srcItem.system?.isProficient || false;
              const selfProfField = srcItem.system?.proficiency ?? srcItem.system?.prof ?? null;
              const parsedSelfProf = parseProfField(selfProfField);
              if (parsedSelfProf !== null) {
                prof = parsedSelfProf;
              } else if (selfTrained) {
                prof = 2 + actorLevel;
              }
            } catch (err) {
              console.warn('Wayfinder | error parsing self proficiency on srcItem', err);
            }

            if (trained) {
              const level = Number(this.document.system?.level?.value ?? this.document.system?.level ?? 0) || 0;
              prof = 2 + level;
            } else {
              prof = Number(this.document.system?.proficiencyBonus ?? 0) || 0;
            }
          } else {
            prof = Number(this.document.system?.proficiencyBonus ?? 0) || 0;
          }
        } else {
          prof = Number(this.document.system?.proficiencyBonus ?? 0) || 0;
        }
      }
    } catch (e) { prof = Number(this.document.system?.proficiencyBonus ?? 0) || 0; }

    // Strike components
    const strike = (effect && effect.system && effect.system.strike) || (ae && ae.system && ae.system.strike) || {};
    const circun = Number(strike.circun ?? (effect && effect.system && effect.system.circun) ?? 0) || 0;
    const itemMod = Number(strike.item ?? (effect && effect.system && effect.system.item) ?? 0) || 0;
    const status = Number(strike.status ?? (effect && effect.system && effect.system.status) ?? 0) || 0;

    // Damage resolve (reuse prior approach)
    let damageFormula = '1d6';
    let damageType = (effect && effect.system && effect.system.damageType) || (ae && ae.system && ae.system.damageType) || strike.damage?.type || null;
    const damageSource = (effect && effect.system && effect.system.damageSource) || (ae && ae.system && ae.system.damageSource) || null;
    try {
      if (damageSource === 'weapon') {
        let sourceItemId = null;
        if (effect && effect.flags?.wayfinder?.sourceItemId) sourceItemId = effect.flags.wayfinder.sourceItemId;
        else if (ae && ae.flags?.wayfinder?.sourceItemId) sourceItemId = ae.flags.wayfinder.sourceItemId;
        else if (srcItem) sourceItemId = srcItem.id;
        if (sourceItemId) {
          const s = this.document.items.get(sourceItemId);
          if (s) {
            damageFormula = s.system?.damageDie || s.system?.damageFormula || damageFormula;
            damageType = s.system?.damageType || damageType;
          }
        }
      } else if (damageSource === 'custom') {
        const dd = (effect && effect.system && effect.system.damageDie) || (ae && ae.system && ae.system.damageDie) || strike.damage?.die || null;
        if (dd) damageFormula = dd;
      } else {
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
    } catch (e) { /* ignore */ }

    const dmgMods = (circun + itemMod + status) || 0;
    if (dmgMods) damageFormula = `${damageFormula} + ${dmgMods}`;

    // Initial computed mods total
    const initialMods = Number(prof || 0) + Number(attrValue || 0) + circun + itemMod + status;

    // Fallback: aggregate numeric changes from ActiveEffects on the actor that
    // target stacking suffixes ('.item', '.circun', '.status') in case those
    // modifiers were not applied directly to actor.system for some reason.
    try {
      let aeAdded = { circun: 0, item: 0, status: 0 };
      for (const ae of Array.from(this.document.effects || [])) {
        const changes = ae.changes || (ae.system && ae.system.changes) || [];
        for (const ch of changes) {
          try {
            const key = (ch.key || '').toString();
            const val = Number(ch.value ?? 0) || 0;
            if (!key || !val) continue;
            // If change targets an attribute/skill stacking suffix, count it
            if (attrKey && key.includes(`attributes.${attrKey}`)) {
              if (key.endsWith('.item')) { aeAdded.item += val; }
              else if (key.endsWith('.circun')) { aeAdded.circun += val; }
              else if (key.endsWith('.status')) { aeAdded.status += val; }
            }
            // Generic stacking suffixes
            if (key.endsWith('.item') && !key.includes('.attributes.')) { aeAdded.item += val; }
            if (key.endsWith('.circun') && !key.includes('.attributes.')) { aeAdded.circun += val; }
            if (key.endsWith('.status') && !key.includes('.attributes.')) { aeAdded.status += val; }
          } catch (e) {}
        }
      }
      if (aeAdded.item || aeAdded.circun || aeAdded.status) {
        console.log('Wayfinder | aggregated AE stacking modifiers', aeAdded);
        itemMod = Number(itemMod || 0) + Number(aeAdded.item || 0);
        circun = Number(circun || 0) + Number(aeAdded.circun || 0);
        status = Number(status || 0) + Number(aeAdded.status || 0);
      }
    } catch (e) { /* ignore fallback errors */ }

    console.log('Wayfinder | computed mods', { prof, attrKey, attrValue, circun, itemMod, status, initialMods });

    // Build dialog content with editable fields via partial (fallback to inline)
    let content = null;
    try {
      content = await foundry.applications.handlebars.renderTemplate(
        'systems/wayfinder/templates/components/attack-form.hbs',
        { effectName, prof, attrKey, attrValue, circun, itemMod, status, initialMods, damageFormula, damageType }
      );
    } catch (e) {
      console.warn('Wayfinder | failed to render attack-form partial, falling back to text', e);
      content = `Effect: ${effectName}\nAttack preview: 2d10 + ${initialMods}\nDamage: ${damageFormula}${damageType ? ' (' + damageType + ')' : ''}`;
    }

    console.log('Wayfinder | building dialog content');
    // Render icon partials so JS does not contain HTML literals
    let iconBull = '';
    let iconBolt = '';
    try {
      iconBull = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-bullseye' });
      iconBolt = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/icon.hbs', { className: 'fas fa-bolt' });
    } catch (ie) {
      console.warn('Wayfinder | failed to render icon partials', ie);
      iconBull = 'fas fa-bullseye';
      iconBolt = 'fas fa-bolt';
    }

    const dlg = new Dialog({
      // Dialog title should show the effect name (not the item)
      title: `Rolagem de Ataque: ${effectName}`,
      content: content,
      render: (html) => {
        const updatePreview = () => {
          const p = Number(html.find('#wf-prof').val()) || 0;
          const a = Number(html.find('#wf-attr').val()) || 0;
          const c = Number(html.find('#wf-circun').val()) || 0;
          const it = Number(html.find('#wf-itemmod').val()) || 0;
          const st = Number(html.find('#wf-status').val()) || 0;
          const total = p + a + c + it + st;
          const rt = html.find('#wf-roll-type').val();
          const previewFormula = (rt === 'normal') ? '2d10' : (rt === 'adv' ? '3d10 keep 2 (drop lowest)' : '3d10 keep 2 (drop highest)');
          html.find('#wf-attack-preview').html(`${previewFormula} + ${total}`);
        };
        html.find('#wf-roll-type, #wf-prof, #wf-attr, #wf-circun, #wf-itemmod, #wf-status').on('change input', updatePreview);
      },
      buttons: {
        attack: {
          icon: iconBull,
          label: 'Rolar Ataque',
          callback: async (html) => {
            try {
              const type = html.find('#wf-roll-type').val();
              const p = Number(html.find('#wf-prof').val()) || 0;
              const a = Number(html.find('#wf-attr').val()) || 0;
              const c = Number(html.find('#wf-circun').val()) || 0;
              const it = Number(html.find('#wf-itemmod').val()) || 0;
              const st = Number(html.find('#wf-status').val()) || 0;
              const mods = p + a + c + it + st;

              if (type === 'normal') {
                const r = new Roll(`2d10 + ${mods}`);
                await r.evaluate();

                const diceResults = (r.dice && r.dice[0] && Array.isArray(r.dice[0].results)) ? r.dice[0].results.map(d => d.result).join(', ') : '';
                const finalTotal = r.total ?? r._total ?? '';
                const attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                  title: displayTitle,
                  effectName: effectName,
                  itemName: srcItem?.name || null,
                  showItem: Boolean(itemNameSuffix),
                  attackTotal: finalTotal,
                  stats: [
                    { label: 'ATR', value: a },
                    { label: 'Prof', value: p },
                    { label: 'Circun', value: c },
                    { label: 'Item', value: it },
                    { label: 'Status', value: st }
                  ],
                  attackFormula: `2d10 + ${mods}`,
                  attackDice: diceResults,
                  effectDescription: effectDescription,
                  both: false
                });

                await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
              } else {
                // roll 3d10 and keep the best/worst two (drop lowest for adv, drop highest for dis)
                const r3 = new Roll('3d10');
                await r3.evaluate();
                const results = r3.dice[0].results.map(d => d.result);
                const sorted = results.slice().sort((a, b) => a - b);
                let kept = 0;
                let keptDiceText = '';
                if (type === 'adv') {
                  // drop lowest, keep top two
                  kept = sorted[1] + sorted[2];
                  keptDiceText = `${sorted[1]}, ${sorted[2]}`;
                } else {
                  // drop highest, keep bottom two
                  kept = sorted[0] + sorted[1];
                  keptDiceText = `${sorted[0]}, ${sorted[1]}`;
                }
                const attackTotal = kept + mods;

                const attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                  title: displayTitle,
                  effectName: effectName,
                  itemName: srcItem?.name || null,
                  showItem: Boolean(itemNameSuffix),
                  attackTotal: attackTotal,
                  effectDescription: effectDescription,
                  stats: [
                    { label: 'Dados (3d10)', value: results.join(', '), small: true },
                    { label: 'Mantidos', value: keptDiceText },
                    { label: 'Mods', value: mods }
                  ],
                  both: false
                });

                await r3.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
              }
            } catch (err) { console.error('Erro ao rolar ataque:', err); ui.notifications.error('Erro ao rolar ataque'); }
          }
        },
        both: {
          icon: iconBolt,
          label: 'Rolar Ataque + Dano',
          callback: async (html) => {
            try {
              const type = html.find('#wf-roll-type').val();
              const p = Number(html.find('#wf-prof').val()) || 0;
              const a = Number(html.find('#wf-attr').val()) || 0;
              const c = Number(html.find('#wf-circun').val()) || 0;
              const it = Number(html.find('#wf-itemmod').val()) || 0;
              const st = Number(html.find('#wf-status').val()) || 0;
              const mods = p + a + c + it + st;

              // Build attack and damage, then post a single combined card
              let attackCard = '';
              if (type === 'normal') {
                const r = new Roll(`2d10 + ${mods}`);
                await r.evaluate();
                const diceResults = (r.dice && r.dice[0] && Array.isArray(r.dice[0].results)) ? r.dice[0].results.map(d => d.result).join(', ') : '';
                const attackTotal = r.total ?? r._total ?? '';

                // Damage
                const dmgRoll = new Roll(damageFormula);
                await dmgRoll.evaluate();
                const dmgDice = (dmgRoll.dice && dmgRoll.dice[0] && Array.isArray(dmgRoll.dice[0].results)) ? dmgRoll.dice[0].results.map(d => d.result).join(', ') : '';
                const dmgTotal = dmgRoll.total ?? dmgRoll._total ?? '';

                attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                  title: displayTitle,
                  effectName: effectName,
                  itemName: srcItem?.name || null,
                  showItem: Boolean(itemNameSuffix),
                  attackTotal: attackTotal,
                  effectDescription: effectDescription,
                  stats: [
                    { label: 'ATR', value: a },
                    { label: 'Prof', value: p },
                    { label: 'Circun', value: c },
                    { label: 'Item', value: it },
                    { label: 'Status', value: st }
                  ],
                  attackFormula: `2d10 + ${mods}`,
                  attackDice: diceResults,
                  damageFormula: damageFormula,
                  damageDice: dmgDice,
                  damageTotal: dmgTotal,
                  damageType: damageType || '—',
                  both: true
                });

                await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
              } else {
                const r3 = new Roll('3d10');
                await r3.evaluate();
                const results = r3.dice[0].results.map(d => d.result);
                const sorted = results.slice().sort((a, b) => a - b);
                let kept = 0;
                let keptDiceText = '';
                if (type === 'adv') { kept = sorted[1] + sorted[2]; keptDiceText = `${sorted[1]}, ${sorted[2]}`; }
                else { kept = sorted[0] + sorted[1]; keptDiceText = `${sorted[0]}, ${sorted[1]}`; }
                const attackTotal = kept + mods;

                // Damage
                const dmgRoll = new Roll(damageFormula);
                await dmgRoll.evaluate();
                const dmgDice = (dmgRoll.dice && dmgRoll.dice[0] && Array.isArray(dmgRoll.dice[0].results)) ? dmgRoll.dice[0].results.map(d => d.result).join(', ') : '';
                const dmgTotal = dmgRoll.total ?? dmgRoll._total ?? '';

                attackCard = await foundry.applications.handlebars.renderTemplate('systems/wayfinder/templates/components/attack-roll-card.hbs', {
                  title: displayTitle,
                  effectName: effectName,
                  itemName: srcItem?.name || null,
                  showItem: Boolean(itemNameSuffix),
                  attackTotal: attackTotal,
                  effectDescription: effectDescription,
                  stats: [
                    { label: 'Dados (3d10)', value: results.join(', '), small: true },
                    { label: 'Mantidos', value: keptDiceText },
                    { label: 'Mods', value: mods }
                  ],
                  attackFormula: `${kept} + ${mods}`,
                  attackDice: results.join(', '),
                  damageFormula: damageFormula,
                  damageDice: dmgDice,
                  damageTotal: dmgTotal,
                  damageType: damageType || '—',
                  both: true
                });

                await r3.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }), flavor: attackCard, rollMode: game.settings.get('core', 'rollMode') });
              }
            } catch (err) { console.error('Erro ao rolar ataque+dano:', err); ui.notifications.error('Erro ao rolar ataque+dano'); }
          }
        },
        cancel: { label: 'Cancelar' }
      },
      default: 'attack'
    });
    try {
      console.log('Wayfinder | rendering dialog');
      dlg.render(true);
      console.log('Wayfinder | dialog rendered');
    } catch (err) {
      console.error('Wayfinder | dialog render failed', err);
    }
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

    // Render small chat content via partial with fallback
    try {
      const content = await foundry.applications.handlebars.renderTemplate(
        'systems/wayfinder/templates/components/effect-toggle.hbs',
        { name: effect.name, statusText }
      );
      await ChatMessage.create({ speaker: speaker, content: content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
    } catch (e) {
      console.warn('Wayfinder | failed to render effect-toggle partial, falling back to text', e);
      await ChatMessage.create({ speaker: speaker, content: `${effect.name} foi ${statusText}.`, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
    }
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

export {};
// End of file - Wayfinder actor sheet
