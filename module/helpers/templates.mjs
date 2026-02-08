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
 * Small utility to compute readable foreground color (#000 or #fff)
 * Accepts hex, rgb(...) or hsl(...) strings. Returns '#000' or '#fff'.
 */
function getContrastColor(color) {
  if (!color || typeof color !== 'string') return '#fff';
  try {
    const parseHsl = (c) => {
      const m = c.match(/hsl\(\s*([0-9]+)\s*,?\s*([0-9]+)%?\s*,?\s*([0-9]+)%?\s*\)/i);
      if (!m) return null;
      const h = Number(m[1]) / 360;
      const s = Number(m[2]) / 100;
      const l = Number(m[3]) / 100;
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
      return [r, g, b];
    };

    const toRgb = (c) => {
      c = c.trim();
      if (c.startsWith('hsl(')) {
        return parseHsl(c);
      }
      if (c.startsWith('#')) {
        const hex = c.substring(1);
        if (hex.length === 3) {
          return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)];
        }
        if (hex.length === 6) {
          return [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
        }
      }
      const m = c.match(/rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/i);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return null;
    };

    const rgb = toRgb(color);
    if (!rgb) return '#fff';
    const [r, g, b] = rgb;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000' : '#fff';
  } catch (e) {
    return '#fff';
  }
}

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



  // The compendium trait map is built on Ready via buildCompendiumTraitMap()

  // Return the computed bonus portion of a defense (uses precomputed attr.total only)
  Handlebars.registerHelper('defenseBonus', function(attributeKey, attributes) {
    if (!attributes || !attributeKey || !attributes[attributeKey]) return '';
    const attr = attributes[attributeKey];
    // Prefer the precomputed total when available
    if (typeof attr.total === 'number') {
      return Math.round(attr.total - 10);
    }
    // Fallback: compute the total here so the UI can show values immediately
    const value = parseInt(attr.value) || 0;
    const itemSum = parseInt(attr.item) || 0;
    const status = parseInt(attr.status) || 0;
    const circun = parseInt(attr.circun) || 0;
    const prof = parseInt(attr.profValue) || parseInt(attr.prof) || 0;
    const total = value + itemSum + status + circun + prof + 10;
    return Math.round(total - 10);
  });

  // Return the computed total for an attribute, preferring precomputed `attr.total`
  Handlebars.registerHelper('defenseTotal', function(attributeKey, attributes) {
    if (!attributes || !attributeKey || !attributes[attributeKey]) return '';
    const attr = attributes[attributeKey];
    if (typeof attr.total === 'number') return Math.round(attr.total);
    const value = parseInt(attr.value) || 0;
    const itemSum = parseInt(attr.item) || 0;
    const status = parseInt(attr.status) || 0;
    const circun = parseInt(attr.circun) || 0;
    const prof = parseInt(attr.profValue) || parseInt(attr.prof) || 0;
    const total = value + itemSum + status + circun + prof + 10;
    return Math.round(total);
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

  // Convert a string to Title Case (capitalize first letter of each word)
  Handlebars.registerHelper('titleCase', function(value) {
    if (value === null || value === undefined) return '';
    const s = String(value).replace(/[_\-]+/g, ' ').trim();
    return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  });

  // Map internal weapon keys/labels to PT-BR human-friendly names
  Handlebars.registerHelper('weaponLabel', function(key) {
    if (!key) return '';
    const k = String(key).toLowerCase();
    const map = {
      crossbow: 'Besta',
      dart: 'Dardo',
      flail: 'Mangual',
      fetish: 'Fetiche',
      hammer: 'Martelo',
      rod: 'Cajado',
      knife: 'Faca',
      pick: 'Picareta',
      shield: 'Escudo',
      polearm: 'Arma de Haste',
      spear: 'Lança',
      sling: 'Funda',
      sword: 'Espada',
      axe: 'Machado'
    };
    if (map[k]) return map[k];
    // Fallback: Title case the original key
    const s = String(key).replace(/[_\-]+/g, ' ').trim();
    return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  });

  // Return an inline style string for a trait name if a matching trait item exists
  Handlebars.registerHelper('traitStyle', function(name) {
    try {
      if (!name || typeof name !== 'string') return '';
      const resolved = resolveTraitEntry(String(name));
      if (!resolved || !resolved.color) return '';
      const color = String(resolved.color).trim();
      const textColor = resolved.textColor || getContrastColor(color);
      return `background: ${color}; color: ${textColor};`;
    } catch (e) {
      return '';
    }
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
        const resolved = resolveTraitEntry(traitEntry);
        traits.push({ name: String(resolved.name), color: resolved.color, textColor: resolved.textColor });
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
    // Editable: allow editing when the effect is a standalone effect created on the actor
    // (renderSource === 'effects-tab') or when the current user is GM.
    const editable = (source === 'effects-tab') || (typeof game !== 'undefined' && game?.user?.isGM);
    const context = { effect, idx, effectId, isActive, traits, heightenedEntries, hasMetadata, renderSource: source, editable };
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
    "systems/wayfinder/templates/components/effect-source-card.hbs",
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

// Module-scope compendium map (populated on Ready)
export const compendiumTraitMap = new Map();

// Build or rebuild the compendium trait map when the game is ready
export async function buildCompendiumTraitMap() {
  try {
    compendiumTraitMap.clear();
    const traitPacks = (game && game.packs) ? game.packs.filter(p => p.documentName === 'Item') : [];
    for (const pack of traitPacks) {
      try {
        const docs = await pack.getDocuments();
        for (const d of docs) {
          try {
            if (d.type === 'trait') {
              const name = d.name;
              let color = null;
              let prop = null;
              if (d.system?.color) { color = String(d.system.color).trim(); prop = 'color'; }
              else if (d.system?.hex) { color = String(d.system.hex).trim(); prop = 'hex'; }
              else if (d.system?.hue) { color = `hsl(${d.system.hue} 40% 45%)`; prop = 'hue'; }
              if (color) {
                const entry = { color, prop, pack: pack.collection };
                compendiumTraitMap.set(name, entry);
                try { compendiumTraitMap.set(name.toLowerCase(), entry); } catch (e) { /* ignore */ }
              }
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        console.warn('Wayfinder | could not read compendium pack', pack.collection, e);
      }
    }
    // Diagnostic dump
    try {
      const entries = Array.from(compendiumTraitMap.entries()).map(([k, v]) => ({ name: k, entry: v }));
      console.log('Wayfinder | compendiumTraitMap summary', { count: entries.length, entries });
      for (const pack of traitPacks) {
        try {
          const docs = await pack.getDocuments();
          const traits = docs.filter(d => d.type === 'trait').map(d => ({ name: d.name, id: d.id || d._id, system: d.system }));
          if (traits.length) console.log('Wayfinder | compendium pack traits', { pack: pack.collection, traits });
        } catch (e) {
          console.warn('Wayfinder | could not read compendium pack for diagnostic', pack.collection, e);
        }
      }
    } catch (e) {
      console.warn('Wayfinder | failed dumping compendium trait diagnostics', e);
    }
  } catch (e) {
    console.warn('Wayfinder | failed building compendium trait map', e);
  }
}

// Utility: find a trait Item among currently-loaded world Items by name
export function findTraitItemByName(name) {
  if (!name || typeof name !== 'string' || !game?.items) return null;
  const nameStr = String(name).trim();
  const nameLower = nameStr.toLowerCase();
  let traitItem = game.items.find(i => i.type === 'trait' && i.name === nameStr);
  if (!traitItem) traitItem = game.items.find(i => i.type === 'trait' && i.name.toLowerCase() === nameLower);
  if (!traitItem) traitItem = game.items.find(i => i.type === 'trait' && i.name.toLowerCase().includes(nameLower));
  if (!traitItem) traitItem = game.items.find(i => i.type === 'trait' && nameLower.includes(i.name.toLowerCase()));
  return traitItem || null;
}

// Utility: get color and property used from a document (Item/trait)
export function getColorFromDocument(doc) {
  if (!doc || !doc.system) return { color: null, prop: null };
  if (doc.system.color) return { color: String(doc.system.color).trim(), prop: 'color' };
  if (doc.system.hex) return { color: String(doc.system.hex).trim(), prop: 'hex' };
  if (doc.system.hue !== undefined && doc.system.hue !== null) return { color: `hsl(${doc.system.hue} 40% 45%)`, prop: 'hue' };
  return { color: null, prop: null };
}

// Resolve a trait entry (string UUID/name or object) into a normalized shape
// Returns: { name, color, textColor, source: 'item'|'compendium'|'inline'|'unknown', prop }
export function resolveTraitEntry(traitEntry) {
  const result = { name: 'Trait', color: '#666666', textColor: '#fff', source: 'unknown', prop: null };
  try {
    if (typeof traitEntry === 'object' && traitEntry !== null) {
      result.name = traitEntry.name || traitEntry.label || traitEntry.id || result.name;
      const { color, prop } = getColorFromDocument(traitEntry);
      if (color) { result.color = color; result.prop = prop; result.source = 'inline'; }
      else if (traitEntry.color) { result.color = traitEntry.color; result.prop = 'color'; result.source = 'inline'; }
      // compute contrast
      result.textColor = getContrastColor(result.color);
      return result;
    }

    if (typeof traitEntry === 'string') {
      // If it's a UUID-like string, attempt to resolve
      let resolved = null;
      try {
        if (traitEntry.includes('.') || traitEntry.startsWith('Item') || traitEntry.startsWith('Compendium')) resolved = fromUuidSync(traitEntry);
      } catch (e) { resolved = null; }
      if (resolved) {
        result.name = resolved.name || String(traitEntry);
        const { color, prop } = getColorFromDocument(resolved);
        if (color) { result.color = color; result.prop = prop; result.source = 'item'; }
        else {
          // try compendium map by resolved name
          const entry = compendiumTraitMap.get(result.name);
          if (entry && entry.color) { result.color = entry.color; result.prop = entry.prop || 'compendium'; result.source = 'compendium'; }
        }
        result.textColor = getContrastColor(result.color);
        return result;
      }

      // Not a UUID or unresolved: treat as plain name and search world items + compendium
      const nameStr = traitEntry.trim();
      result.name = nameStr;
      const traitItem = findTraitItemByName(nameStr);
      if (traitItem) {
        const { color, prop } = getColorFromDocument(traitItem);
        if (color) { result.color = color; result.prop = prop; result.source = 'item'; }
      } else {
        // Try exact then lowercase quick lookup
        let entry = compendiumTraitMap.get(nameStr);
        if ((!entry || !entry.color) && typeof nameStr === 'string') entry = compendiumTraitMap.get(nameStr.toLowerCase());
        if (entry && entry.color) { result.color = entry.color; result.prop = entry.prop || 'compendium'; result.source = 'compendium'; }
        else {
          // case-insensitive search in compendium map
          const lower = nameStr.toLowerCase();
          for (const [k, v] of compendiumTraitMap.entries()) {
            if (k.toLowerCase() === lower || k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) {
              result.color = v.color; result.prop = v.prop || 'compendium'; result.source = 'compendium'; break;
            }
          }
        }
      }
      result.textColor = getContrastColor(result.color);
      return result;
    }
  } catch (e) {
    // swallow errors and return defaults
  }
  result.textColor = getContrastColor(result.color);
  return result;
}
