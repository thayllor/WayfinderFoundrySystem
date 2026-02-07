/**
 * Extend the base Actor document
 */
export class WayfinderActor extends Actor {

  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded documents or derived data
  }

  /** @override */
  prepareDerivedData() {
    const actorData = this;
    const systemData = actorData.system;
    const flags = actorData.flags.wayfinder || {};

    // Make separate methods for each Actor type (character, npc, etc.) to keep things organized
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    // Make modifications to data here
    const systemData = actorData.system;
    // Ensure attributes and skills objects exist to avoid crashing when undefined
    systemData.attributes = systemData.attributes || {};
    systemData.skills = systemData.skills || {};

    // Build a mapping of attribute contributions from ActiveEffects grouped by pillar.
    // For each attribute, we will collect all ActiveEffect changes that target
    // `system.attributes.<attr>.item` with mode ADD. Within each pillar we take
    // the highest value (bonuses from the same pillar do not stack) and then sum
    // the per-pillar maxima to produce the final `item` contribution.
    const effectContrib = {};
    try {
      for (const e of this.effects) {
        const wf = e.flags?.wayfinder || {};
        const pillar = wf.pillar || (wf.armor ? 'item' : 'item');
        if (!e.changes || !e.changes.length) continue;
        for (const ch of e.changes) {
          if (!ch || !ch.key) continue;
          // Only consider ADD-mode changes to attribute.item
          if (ch.mode !== CONST.ACTIVE_EFFECT_MODES.ADD) continue;
          const m = ch.key.match(/^system\.attributes\.([a-zA-Z0-9_]+)\.item$/);
          if (!m) continue;
          const attr = m[1];
          const val = Number(ch.value) || 0;
          effectContrib[attr] = effectContrib[attr] || {};
          // Keep the maximum value per pillar
          const prev = effectContrib[attr][pillar];
          if (prev === undefined || val > prev) effectContrib[attr][pillar] = val;
        }
      }
    } catch (err) {
      console.warn('Wayfinder | error computing effect contributions', err);
    }

    // Build a mapping of skill contributions from ActiveEffects grouped by pillar.
    // We collect changes targeting `system.skills.<skill>.(item|status|circun)`
    // and for each suffix we take the maximum per pillar then sum across pillars.
    const skillEffectContrib = {}; // { skill: { suffix: { pillar: max } } }
    try {
      for (const e of this.effects) {
        const wf = e.flags?.wayfinder || {};
        const pillar = wf.pillar || (wf.armor ? 'item' : 'item');
        if (!e.changes || !e.changes.length) continue;
        for (const ch of e.changes) {
          if (!ch || !ch.key) continue;
          if (ch.mode !== CONST.ACTIVE_EFFECT_MODES.ADD) continue;
          const m = ch.key.match(/^system\.skills\.([a-zA-Z0-9_]+)\.(item|status|circun)$/);
          if (!m) continue;
          const skill = m[1];
          const suffix = m[2];
          const val = Number(ch.value) || 0;
          skillEffectContrib[skill] = skillEffectContrib[skill] || {};
          skillEffectContrib[skill][suffix] = skillEffectContrib[skill][suffix] || {};
          const prev = skillEffectContrib[skill][suffix][pillar];
          if (prev === undefined || val > prev) skillEffectContrib[skill][suffix][pillar] = val;
        }
      }
    } catch (err) {
      console.warn('Wayfinder | error computing skill effect contributions', err);
    }

    // Calculate attribute modifiers and total defense for each attribute
    for (let [key, attribute] of Object.entries(systemData.attributes)) {
      attribute.mod = Math.floor((attribute.value - 10) / 2);

      // Calculate proficiency value
      let profValue = 0;
      const profType = (attribute.proficiency || "untrained").toString();
      const profMap = {
        "untrained": 0,
        "trained": 2,
        "expert": 4,
        "master": 6,
        "legendary": 8
      };
      if (profType === "untrained") {
        profValue = 0;
      } else {
        // If actorData.system.level exists, add it to proficiency value
        // `level` may be a number or an object { value: number }
        const rawLevel = systemData.level?.value ?? systemData.level ?? 0;
        const level = Number(rawLevel) || 0;
        const base = profMap[profType] ?? 0;
        profValue = base + level;
      }

      // Compute item contribution using effectContrib (per-pillar maxima summed)
      const perPillar = effectContrib[key] || {};
      const itemSum = Object.values(perPillar).reduce((s, v) => s + (Number(v) || 0), 0);

      // Calculate total
      attribute.total =
        (parseInt(attribute.value) || 0) +
        itemSum +
        (parseInt(attribute.status) || 0) +
        (parseInt(attribute.circun) || 0) +
        profValue +
        10;
      // Store the computed item contribution for templates/rolls to read
      attribute.item = itemSum;
    }

    // Ensure default skills exist when creating a new actor from scratch
    try {
      const skillKeys = Object.keys(systemData.skills || {});
      if (!skillKeys.length) {
        const defaultSkills = {
          arcana: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          acrobatics: { attribute: 'DEX', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          athletics: { attribute: 'STR', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          crafting: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          deception: { attribute: 'PRE', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          diplomacy: { attribute: 'PRE', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          intimidation: { attribute: 'PRE', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          medicine: { attribute: 'WIS', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          nature: { attribute: 'WIS', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          occultism: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          performance: { attribute: 'PRE', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          religion: { attribute: 'WIS', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          society: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          stealth: { attribute: 'DEX', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          survival: { attribute: 'WIS', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          tactics: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          thievery: { attribute: 'DEX', proficiency: 'untrained', item: 0, circun: 0, status: 0 },
          lore: { attribute: 'INT', proficiency: 'untrained', item: 0, circun: 0, status: 0 }
        };
        systemData.skills = defaultSkills;
      }
    } catch (e) {
      // ignore
    }

    // Apply computed skill contributions into the system.skills structure so that
    // the sheet renders them as derived (non-editable) values. For each skill,
    // sum per-pillar maxima for each suffix (item/status/circun) and write back
    // to the skill object.
    try {
      const skills = systemData.skills || {};
      for (const [skey, sk] of Object.entries(skills)) {
        const per = skillEffectContrib[skey] || {};
        const itemSum = Object.values(per.item || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        const statusSum = Object.values(per.status || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        const circunSum = Object.values(per.circun || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        // Write computed sums back to the skill data so templates read them
        sk.item = itemSum;
        sk.status = statusSum;
        sk.circun = circunSum;
        // Recompute total for convenience
        // Resolve attribute value referenced by the skill
        const ATTR_MAP = { STR: 'strength', DEX: 'dexterity', INT: 'intelligence', WIS: 'wisdom', PRE: 'presence' };
        const attrRef = (sk.attribute || '').toString().toUpperCase();
        const attrKey = ATTR_MAP[attrRef] || attrRef.toLowerCase();
        const attrValue = Number(systemData.attributes?.[attrKey]?.value) || 0;
        const profMap = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
        const profType = (sk.proficiency || 'untrained').toString().toLowerCase();
        const rawLevel = systemData.level?.value ?? systemData.level ?? 0;
        const level = Number(rawLevel) || 0;
        const profValue = (profType === 'untrained') ? 0 : ((profMap[profType] || 0) + level);
        sk.total = attrValue + profValue + statusSum + circunSum + itemSum;
        sk.formula = `${attrValue} + ${profValue} + ${circunSum} + ${itemSum} + ${statusSum}`;
      }
    } catch (err) {
      console.warn('Wayfinder | error applying skill contributions', err);
    }
  }

  /**
   * Prepare NPC type specific data
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;

    // Make modifications to data here
    const systemData = actorData.system;
  }

  /**
   * Override getRollData() that's supplied to rolls
   */
  getRollData() {
    const data = super.getRollData();

    // Prepare character roll data
    this._getCharacterRollData(data);
    this._getNpcRollData(data);

    return data;
  }

  /**
   * Prepare character roll data
   */
  _getCharacterRollData(data) {
    if (this.type !== 'character') return;

    // Add level for easier access or add shorthand aliases
    if (data.level) {
      data.lvl = data.level.value ?? 0;
    }
  }

  /**
   * Prepare NPC roll data
   */
  _getNpcRollData(data) {
    if (this.type !== 'npc') return;

    // Process additional NPC data here
  }
}
