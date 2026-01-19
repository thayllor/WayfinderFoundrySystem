/**
 * The Wayfinder game system for Foundry Virtual Tabletop
 * Author: Seu Nome
 */

// Import document classes
import { WayfinderActor } from "./documents/actor.mjs";
import { WayfinderItem } from "./documents/item.mjs";

// Import sheet classes
import { WayfinderActorSheet } from "./sheets/actor-sheet.mjs";
import { WayfinderItemSheet } from "./sheets/item-sheet.mjs";
import { WayfinderActiveEffectSheet, WayfinderPassiveEffectSheet } from "./sheets/effect-sheet.mjs";
import { WayfinderTraitSheet } from "./sheets/trait-sheet.mjs";
import { WayfinderTalentSheet } from "./sheets/talent-sheet.mjs";

// Import helper/utility classes and constants
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { WAYFINDER } from "./helpers/config.mjs";

// Expose sheet classes globally for system.json
globalThis.WayfinderActorSheet = WayfinderActorSheet;
globalThis.WayfinderItemSheet = WayfinderItemSheet;
globalThis.WayfinderActiveEffectSheet = WayfinderActiveEffectSheet;
globalThis.WayfinderPassiveEffectSheet = WayfinderPassiveEffectSheet;
globalThis.WayfinderTraitSheet = WayfinderTraitSheet;
globalThis.WayfinderTalentSheet = WayfinderTalentSheet;

console.log('Wayfinder | Classes exposed globally:', {
  WayfinderActorSheet: globalThis.WayfinderActorSheet,
  WayfinderItemSheet: globalThis.WayfinderItemSheet,
  WayfinderTalentSheet: globalThis.WayfinderTalentSheet
});

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', async function() {
  console.log('Wayfinder | Initializing Wayfinder System');

  // Add utility classes to the global game object
  game.wayfinder = {
    WayfinderActor,
    WayfinderItem,
    WayfinderActorSheet,
    WayfinderItemSheet
  };

  // Add custom constants for configuration
  CONFIG.WAYFINDER = WAYFINDER;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = WayfinderActor;
  CONFIG.Item.documentClass = WayfinderItem;

  // Register sheet application classes for V2
  // No v13, usar o namespace completo
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "wayfinder", WayfinderActorSheet, {
    types: ["character", "npc"],
    makeDefault: true,
    label: "Wayfinder Character Sheet"
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderItemSheet, {
    types: ["item", "spell"],
    makeDefault: true,
    label: "Wayfinder Item Sheet"
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderActiveEffectSheet, {
    types: ["active-effect"],
    makeDefault: true,
    label: "Wayfinder Active Effect Sheet"
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderPassiveEffectSheet, {
    types: ["passive-effect"],
    makeDefault: true,
    label: "Wayfinder Passive Effect Sheet"
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderTraitSheet, {
    types: ["trait"],
    makeDefault: true,
    label: "Wayfinder Trait Sheet"
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderTalentSheet, {
    types: ["talent"],
    makeDefault: true,
    label: "Wayfinder Talent Sheet"
  });

  console.log('Wayfinder | Sheets registered successfully');

  // Preload Handlebars templates
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function() {
  console.log('Wayfinder | System Ready');
});
/* -------------------------------------------- */
/*  Item Render Hook - Style Trait Items        */
/* -------------------------------------------- */

Hooks.on("renderActorSheet", function(app, html, data) {
  // Find all item rows in the actor sheet's items tab
  const itemRows = html.querySelectorAll('.items-list .item');

  itemRows.forEach(row => {
    const itemId = row.dataset.itemId;
    if (!itemId) return;

    const actor = app.actor || app.document;
    const item = actor.items.get(itemId);

    // Check if item is a trait
    if (item && item.type === 'trait' && item.system.color) {
      const imgElement = row.querySelector('.item-image img');

      if (imgElement) {
        // Create a colored div to replace the image
        const colorDiv = document.createElement('div');
        colorDiv.className = 'item-color-square';
        colorDiv.style.backgroundColor = item.system.color;
        colorDiv.style.width = '24px';
        colorDiv.style.height = '24px';
        colorDiv.style.borderRadius = '4px';
        colorDiv.style.border = '1px solid var(--wayfinder-border)';
        colorDiv.style.display = 'block';
        colorDiv.title = item.name;

        // Replace the img with the div
        imgElement.replaceWith(colorDiv);
      }
    }
  });
});