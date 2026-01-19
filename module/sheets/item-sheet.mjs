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
    return {
      item: this.document,
      source: this.document.toObject(),
      system: this.document.system,
      flags: this.document.flags,
      rollData: this.document.getRollData(),
      editable: this.isEditable
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

    if (!this.isEditable) return;

    // Auto-save the form when it changes
    html.addEventListener('change', (ev) => {
      this._submitForm(ev);
    });

    // Handle input changes for system fields and editor
    html.addEventListener('input', (ev) => {
      if (ev.target.closest('.editor') || ev.target.closest('[name*="system"]')) {
        this._submitForm(ev);
      }
    });
  }

  /**
   * Submit form changes
   * @private
   */
  async _submitForm(event) {
    if (!this.form) {
      console.warn('Form element not found');
      return;
    }
    const formData = new FormData(this.form);
    const updates = foundry.utils.expandObject(Object.fromEntries(formData));
    console.log('Updating trait:', updates);
    await this.document.update(updates);
  }
}
