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

    // Calculate attribute modifiers
    for (let [key, attribute] of Object.entries(systemData.attributes)) {
      attribute.mod = Math.floor((attribute.value - 10) / 2);
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
