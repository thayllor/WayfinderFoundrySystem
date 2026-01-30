// Helper to calculate Defense DC for an attribute
Handlebars.registerHelper('calculateDefenseDC', function(attributeKey, attributes) {
  // Defensive fallback: if attributes or attributeKey is missing, return 10
  if (!attributes || !attributeKey || !attributes[attributeKey]) return 10;
  // Use the calculated total if present, else fall back to attribute.value or 0
    const attr = attributes[attributeKey];
    if (typeof attr.total === 'number') return attr.total;
    return 10;
});
// Add a 'default' helper for Handlebars
Handlebars.registerHelper('default', function(value, defaultValue) {
  if (value === null || value === undefined || value === "") return defaultValue;
  return value;
});
/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function() {
  console.log('✓ Wayfinder | Preloading templates...');

  // Register custom Handlebars helpers
  Handlebars.registerHelper('toInt', function(value) {
    if (value === null || value === undefined) return 0;
    const numValue = parseFloat(String(value).replace(',', '.'));
    return Math.round(numValue) || 0;
  });

  Handlebars.registerHelper('isObject', function(value) {
    return value !== null && value !== undefined && typeof value === 'object';
  });

  // Simple concat helper for building dynamic field names in templates
  Handlebars.registerHelper('concat', function(...args) {
    // The last arg is Handlebars options object
    args.pop();
    return args.map(a => String(a)).join('');
  });

  Handlebars.registerHelper('or', function(...args) {
    const value = args[0];
    const comparison = args[1];
    return value || comparison;
  });

  Handlebars.registerHelper('gt', function(a, b) {
    return a > b;
  });

  Handlebars.registerHelper('gte', function(a, b) {
    return a >= b;
  });

  Handlebars.registerHelper('lt', function(a, b) {
    return a < b;
  });

  Handlebars.registerHelper('lte', function(a, b) {
    return a <= b;
  });

  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });

  // Helper para texto estilizado com editor inline
  Handlebars.registerHelper('textoEstilizado', function(options) {
    const hash = options.hash || {};
    const name = hash.name || 'system.description';
    const value = hash.value || '';
    const label = hash.label || 'Descrição';
    const editable = hash.editable !== false;
    const context = { name, value, label, editable };
    const renderPartial = (path, ctx) => {
      const tpl = (Handlebars.templates && Handlebars.templates[path]) || (Handlebars.partials && Handlebars.partials[path]);
      if (!tpl) return new Handlebars.SafeString('');
      const fn = (typeof tpl === 'function') ? tpl : Handlebars.compile(tpl);
      return new Handlebars.SafeString(fn(ctx));
    };

    return renderPartial('systems/wayfinder/templates/components/trait-editor.hbs', context);
  });

  // Componente de efeito colapsável para talents
  Handlebars.registerHelper('collapsibleEffect', function(options) {
    const hash = options.hash || {};
    const effect = hash.effect || {};
    const idx = hash.idx || 0;
    const effectId = `effect-${idx}-${Math.random().toString(36).substr(2, 9)}`;
    const isActive = effect.type === 'active-effect';
    // Build context for template rendering (no HTML here)
    const _stringToHue = (str) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
      return Math.abs(h) % 360;
    };

    const traits = [];
    if (Array.isArray(effect.traitsResolved) && effect.traitsResolved.length) {
      for (const traitEntry of effect.traitsResolved) {
        let name = 'Trait';
        let color = '#666666';
        if (typeof traitEntry === 'string') {
          let resolved = null;
          try {
            if (traitEntry.includes('.') || traitEntry.startsWith('Item')) resolved = fromUuidSync(traitEntry);
          } catch (err) {
            resolved = null;
          }
          if (resolved) {
            name = resolved.name || String(traitEntry);
            color = resolved.system?.color || resolved.system?.hex || (resolved.system?.hue ? `hsl(${resolved.system.hue} 40% 45%)` : color);
          } else {
            name = traitEntry;
            const hue = _stringToHue(name);
            color = `hsl(${hue} 40% 45%)`;
          }
          // Normalize color strings: ensure hex has '#', and make HSL use commas for broader compatibility
          if (typeof color === 'string') {
            color = color.trim();
            if (/^[0-9a-fA-F]{6}$/.test(color)) color = `#${color}`;
            else if (/^[0-9a-fA-F]{3}$/.test(color)) color = `#${color}`;
            else if (/^[0-9]+$/.test(color)) color = `hsl(${Number(color)},40%,45%)`;
            // Convert space-separated HSL to comma-separated (e.g. 'hsl(120 40% 45%)' -> 'hsl(120,40%,45%)')
            color = color.replace(/^hsl\(\s*([0-9]+)\s+([0-9]+%?)\s+([0-9]+%?)\s*\)$/i, 'hsl($1,$2,$3)');
          }
        } else if (traitEntry && typeof traitEntry === 'object') {
          name = traitEntry.name || traitEntry.label || traitEntry.id || 'Trait';
          if (traitEntry.color) color = traitEntry.color;
          else if (traitEntry.hex) color = traitEntry.hex;
          else if (traitEntry.hue) color = `hsl(${traitEntry.hue} 40% 45%)`;
          // Normalize similarly
          if (typeof color === 'string') {
            color = color.trim();
            if (/^[0-9a-fA-F]{6}$/.test(color)) color = `#${color}`;
            else if (/^[0-9a-fA-F]{3}$/.test(color)) color = `#${color}`;
            else if (/^[0-9]+$/.test(color)) color = `hsl(${Number(color)},40%,45%)`;
            color = color.replace(/^hsl\(\s*([0-9]+)\s+([0-9]+%?)\s+([0-9]+%?)\s*\)$/i, 'hsl($1,$2,$3)');
          }
          else {
            const hue = _stringToHue(name);
            color = `hsl(${hue} 40% 45%)`;
          }
        }
        traits.push({ name: String(name), color });
      }
    }

    const _entriesFrom = (src) => {
      if (!src) return [];
      if (Array.isArray(src)) return src;
      if (typeof src === 'object') return Object.values(src);
      return [];
    };
    let heightenedEntries = _entriesFrom(effect.heightened);
    if (!heightenedEntries.length && effect.system) heightenedEntries = _entriesFrom(effect.system?.heightened);

    const hasMetadata = (effect.range || effect.target || effect.duration || effect.isMagic || effect.focusCost > 0 || effect.actionCost || effect.magicCircle);

    const source = hash.source || (effect && (effect.sourceTalentId || effect.sourceItemId) ? 'talent-or-item' : 'effects-tab');
    const context = { effect, idx, effectId, isActive, traits, heightenedEntries, hasMetadata, renderSource: source };
    // Debug: log effect origins when rendering to assist CSS debugging
    try { console.log('Wayfinder | collapsibleEffect render', { source, name: effect.name, uuid: effect.uuid || effect._id || null }); } catch(e) {}

    const renderPartial = (path, ctx) => {
      const tpl = (Handlebars.templates && Handlebars.templates[path]) || (Handlebars.partials && Handlebars.partials[path]);
      if (!tpl) return new Handlebars.SafeString('');
      const fn = (typeof tpl === 'function') ? tpl : Handlebars.compile(tpl);
      return new Handlebars.SafeString(fn(ctx));
    };

    return renderPartial('systems/wayfinder/templates/components/collapsible-effect.hbs', context);
  });

  // Load main sheet template
  return foundry.applications.handlebars.loadTemplates([
    "systems/wayfinder/templates/actor/actor-character-sheet.hbs",
    "systems/wayfinder/templates/actor/actor-npc-sheet.hbs",
    "systems/wayfinder/templates/actor/parts/actor-talents-tab.hbs",
    "systems/wayfinder/templates/actor/parts/actor-skills-tab.hbs",
    "systems/wayfinder/templates/actor/parts/actor-spells-tab.hbs",
    "systems/wayfinder/templates/actor/parts/actor-inventory-tab.hbs",
    "systems/wayfinder/templates/actor/parts/actor-notes-tab.hbs",
    "systems/wayfinder/templates/actor/parts/actor-effects-tab.hbs",
    "systems/wayfinder/templates/item/item-active-effect-sheet.hbs",
    "systems/wayfinder/templates/item/item-passive-effect-sheet.hbs",
    "systems/wayfinder/templates/item/item-trait-sheet.hbs",
    "systems/wayfinder/templates/item/item-talent-sheet.hbs",
    "systems/wayfinder/templates/item/item-item-sheet.hbs",
    "systems/wayfinder/templates/components/attributes-pentagon.hbs",
    "systems/wayfinder/templates/components/defenses-table.hbs",
    "systems/wayfinder/templates/components/trait-editor.hbs",
    "systems/wayfinder/templates/components/trait-chip-row.hbs",
    "systems/wayfinder/templates/components/talent-readonly.hbs",
    "systems/wayfinder/templates/components/talent-readonly-error.hbs",
    "systems/wayfinder/templates/components/select-form.hbs",
    "systems/wayfinder/templates/components/modifier-edit-form.hbs",
    "systems/wayfinder/templates/components/icon.hbs",
    "systems/wayfinder/templates/components/effect-trait-chip.hbs",
    "systems/wayfinder/templates/components/effect-item.hbs",
    "systems/wayfinder/templates/components/effect-collapsible.hbs",
    "systems/wayfinder/templates/components/effect-toggle.hbs",
    "systems/wayfinder/templates/components/effect-activation.hbs",
    "systems/wayfinder/templates/components/collapsible-effect.hbs",
    "systems/wayfinder/templates/components/roll-dialog.hbs",
    "systems/wayfinder/templates/components/attack-roll-card.hbs",
    "systems/wayfinder/templates/components/attack-roll-card-fallback.hbs",
    "systems/wayfinder/templates/components/attack-form.hbs",
    "systems/wayfinder/templates/components/attack-dialog.hbs",
    "systems/wayfinder/templates/components/color-picker-dialog.hbs",
    "systems/wayfinder/templates/actor/parts/actor-modifiers-tab.hbs",
    "systems/wayfinder/templates/components/top-resources-row.hbs",
    "systems/wayfinder/templates/components/sheet-header.hbs",
    "systems/wayfinder/templates/components/character-info.hbs",
    "systems/wayfinder/templates/components/attributes-resources-section.hbs"
  ]).then(() => {
    console.log('✓ Wayfinder | All templates loaded successfully');
  });
};
