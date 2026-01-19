/**
 * Extend the basic Item with some very simple modifications
 */
export class WayfinderItem extends Item {

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
    const itemData = this;
    const systemData = itemData.system;
    const flags = itemData.flags.wayfinder || {};

    // Make separate methods for each Item type (item, feature, spell) to keep things organized
    this._prepareItemData(itemData);
    this._prepareFeatureData(itemData);
    this._prepareSpellData(itemData);
    this._prepareActiveEffectData(itemData);
    this._preparePassiveEffectData(itemData);
  }

  /**
   * Prepare Item type specific data
   */
  _prepareItemData(itemData) {
    if (itemData.type !== 'item') return;

    // Make modifications to data here
    const systemData = itemData.system;
  }

  /**
   * Prepare Feature type specific data
   */
  _prepareFeatureData(itemData) {
    if (itemData.type !== 'feature') return;

    // Make modifications to data here
    const systemData = itemData.system;
  }

  /**
   * Prepare Spell type specific data
   */
  _prepareSpellData(itemData) {
    if (itemData.type !== 'spell') return;

    // Make modifications to data here
    const systemData = itemData.system;
  }

  /**
   * Prepare Active Effect type specific data
   */
  _prepareActiveEffectData(itemData) {
    if (itemData.type !== 'active-effect') return;

    const systemData = itemData.system;
    // Initialize defaults if needed
    systemData.focusCost = systemData.focusCost || 0;
    systemData.requiresRoll = systemData.requiresRoll || false;
    systemData.isActive = systemData.isActive || false;
  }

  /**
   * Prepare Passive Effect type specific data
   */
  _preparePassiveEffectData(itemData) {
    if (itemData.type !== 'passive-effect') return;

    const systemData = itemData.system;
    // Initialize defaults if needed
    systemData.isPermanent = systemData.isPermanent !== false;
    systemData.isActive = systemData.isActive !== false;
  }

  /**
   * Handle clickable rolls
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Create a basic Chat Message
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    ChatMessage.create({
      speaker: speaker,
      rollMode: rollMode,
      flavor: label,
      content: item.system.description ?? ''
    });
  }
}
