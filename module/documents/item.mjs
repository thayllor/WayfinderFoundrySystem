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
    this._prepareModifierData(itemData);
  }

  /**
   * Prepare Item type specific data
   */
  _prepareItemData(itemData) {
    if (itemData.type !== 'item') return;

    // Make modifications to data here
    const systemData = itemData.system;
    // Ensure common fields exist
    systemData.quantity = systemData.quantity ?? 1;
    systemData.weight = systemData.weight ?? 0;
    systemData.price = systemData.price ?? 0;
    // Remove deprecated space or ensure it's optional
    systemData.space = systemData.space ?? 0;
    // Ensure modifiers array exists so the item sheet can render the list
    systemData.modifiers = systemData.modifiers || [];
    systemData.itemType = systemData.itemType || 'other'; // 'weapon'|'armor'|'other'
    // Inventory display defaults (used by actor inventory UI)
    systemData.inventory = systemData.inventory || {};
    // Default inventory.hand for all items should be 'carregando'
    systemData.inventory.hand = systemData.inventory.hand || 'carregando';
    systemData.inventory.tuned = !!systemData.inventory.tuned;
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
   * Prepare Modifier type specific data
   */
  _prepareModifierData(itemData) {
    if (itemData.type !== 'modifier') return;

    const systemData = itemData.system;
    // Basic defaults for modifier items
    systemData.isActive = systemData.isActive !== false;
    systemData.pillar = systemData.pillar || 'status'; // 'status' | 'circumstance' | 'item'
    systemData.value = systemData.value ?? 0;
    systemData.description = systemData.description || '';
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
