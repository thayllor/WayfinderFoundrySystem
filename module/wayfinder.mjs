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
import { preloadHandlebarsTemplates, buildCompendiumTraitMap } from "./helpers/templates.mjs";
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

  // Register modifier item sheet to the generic item sheet
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "wayfinder", WayfinderItemSheet, {
    types: ["modifier"],
    makeDefault: true,
    label: "Wayfinder Modifier Sheet"
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
  try {
    await buildCompendiumTraitMap();
    console.log('Wayfinder | Compendium trait map built on Ready');
  } catch (e) {
    console.warn('Wayfinder | error building compendium trait map on Ready', e);
  }
});

// Render-time chat enhancements: attach handlers for Wayfinder chat cards
Hooks.on('renderChatMessage', (app, html, data) => {
  try {
    // Attach damage roll button handler
    html.find('.wf-roll-damage-btn').each((i, btn) => {
      const $btn = html.find(btn);
      $btn.off('click.wayfinder').on('click.wayfinder', async (ev) => {
        ev.preventDefault();
        const formula = $btn.data('formula') || $btn.attr('data-formula');
        if (!formula) return ui.notifications?.warn?.('Fórmula de dano não informada');
        try {
          const roll = await new Roll(formula).evaluate({async: true});
          const title = $btn.closest('.wf-chat-card').find('.wf-card__title').text() || 'Dano';
          await roll.toMessage({flavor: `${title} — Dano`});
        } catch (err) {
          console.error('Wayfinder | error rolling damage formula', err, formula);
          ui.notifications?.error?.('Erro ao rolar dano');
        }
      });
    });
  } catch (e) {
    console.error('Wayfinder | renderChatMessage handler error', e);
  }
});

/* -------------------------------------------- */
/*  Apply / Remove Item Modifiers on Actor     */
/* -------------------------------------------- */

// When an Item is created on an Actor, check for nested modifiers on the item
// and create corresponding embedded modifier items on the actor so they apply.
Hooks.on('createItem', async (item, options, userId) => {
  try {
    console.log('Wayfinder | createItem hook fired', { item, options, userId });
    const actor = item.parent;
    console.log('Wayfinder | createItem parent:', actor?.id, actor?.documentName, actor?.name);
    if (!actor || actor.documentName !== 'Actor') return;
    // If the item is in the actor's inventory but marked as 'carregando' (loading),
    // do not apply its modifiers automatically.
    const handState = item.system?.inventory?.hand;
    if (handState === 'carregando') {
      console.log('Wayfinder | item is in carregando state; skipping modifier application', item.id);
      return;
    }
    const mods = item.system?.modifiers;
    console.log('Wayfinder | item.system.modifiers:', mods);
    if (!Array.isArray(mods) || !mods.length) return;

    // Create embedded ActiveEffects on the actor to represent modifiers
    // We avoid creating item documents on the actor per request.
    const toCreateEffects = [];
    // Modifiers -> individual effects
    for (const m of mods) {
      const changes = [];
      if (m.targetPath && (m.value !== undefined && m.value !== null)) {
        changes.push({ key: m.targetPath, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(m.value) });
      }
      // Infer pillar from the modifier's targetPath: the last segment after the final dot
      let inferredPillar = 'item';
      try {
        if (m.targetPath && typeof m.targetPath === 'string') {
          const parts = m.targetPath.split('.');
          if (parts.length) inferredPillar = parts[parts.length - 1] || 'item';
        }
      } catch (e) {
        inferredPillar = 'item';
      }

      toCreateEffects.push({
        name: m.name || item.name || 'Modifier',
        icon: 'icons/svg/aura.svg',
        origin: `Item.${item.id}`,
        disabled: false,
        changes,
        flags: {
          wayfinder: {
            sourceItemId: item.id,
            modifierId: m.id,
            pillar: inferredPillar
          }
        }
      });
    }

    // Armor defenses -> group into a single effect that adds to attribute.item
    try {
      const armorDefs = item.system?.defenses?.armor;
      if (armorDefs && typeof armorDefs === 'object') {
        const armorChanges = [];
        for (const [attrKey, val] of Object.entries(armorDefs)) {
          // Only create a change when value is a number and non-zero
          const num = Number(val);
          if (!Number.isNaN(num) && num !== 0) {
            armorChanges.push({ key: `system.attributes.${attrKey}.item`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(num) });
          }
        }
        if (armorChanges.length) {
          toCreateEffects.push({
            name: `${item.name || 'Item'} (Armor)`,
            icon: 'icons/svg/shield.svg',
            origin: `Item.${item.id}`,
            disabled: false,
            changes: armorChanges,
            flags: { wayfinder: { sourceItemId: item.id, armor: true, pillar: 'item' } }
          });
        }
      }
    } catch (err) {
      console.warn('Wayfinder | error processing armor defenses for item', item.id, err);
    }

    if (toCreateEffects.length) {
      console.log('Wayfinder | creating ActiveEffects on actor', actor.id, toCreateEffects);
      const created = await actor.createEmbeddedDocuments('ActiveEffect', toCreateEffects);
      console.log('Wayfinder | created ActiveEffects:', created);
    }
  } catch (err) {
    console.error('Wayfinder | Error applying modifiers on item create', err);
  }
});

// When an existing embedded Item on an Actor is updated (for example, the
// inventory `hand` dropdown is changed), apply or remove ActiveEffects as
// appropriate. Specifically, if the hand state becomes `carregando` we remove
// effects from that item; if it changes away from `carregando` we (re)apply them.
Hooks.on('updateItem', async (item, update, options, userId) => {
  try {
    const actor = item.parent;
    if (!actor || actor.documentName !== 'Actor') return;

    // Only act when the inventory.hand property changed
    const newHand = update?.system?.inventory?.hand;
    if (newHand === undefined) return;

    console.log('Wayfinder | updateItem inventory.hand changed for', item.id, 'new:', newHand);

    // If the new state is 'carregando', remove any ActiveEffects sourced from this item
    if (newHand === 'carregando') {
      const toDelete = actor.effects
        .filter(e => e.origin === `Item.${item.id}` || e.flags?.wayfinder?.sourceItemId === item.id)
        .map(e => e.id);
      if (toDelete.length) {
        console.log('Wayfinder | removing ActiveEffects for item due to carregando state', item.id, toDelete);
        await actor.deleteEmbeddedDocuments('ActiveEffect', toDelete);
      }
      return;
    }

    // Otherwise, if changing to a non-carregando state, create effects if they don't exist
    const existing = actor.effects.filter(e => e.origin === `Item.${item.id}` || e.flags?.wayfinder?.sourceItemId === item.id);
    if (existing.length) {
      console.log('Wayfinder | ActiveEffects already exist for item', item.id);
      return;
    }

    // Build effects similar to createItem
    const mods = item.system?.modifiers;
    const toCreateEffects = [];
    if (Array.isArray(mods) && mods.length) {
      for (const m of mods) {
        const changes = [];
        if (m.targetPath && (m.value !== undefined && m.value !== null)) {
          changes.push({ key: m.targetPath, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(m.value) });
        }

        // Infer pillar from targetPath
        let inferredPillar = 'item';
        try {
          if (m.targetPath && typeof m.targetPath === 'string') {
            const parts = m.targetPath.split('.');
            if (parts.length) inferredPillar = parts[parts.length - 1] || 'item';
          }
        } catch (e) {
          inferredPillar = 'item';
        }

        toCreateEffects.push({
          name: m.name || item.name || 'Modifier',
          icon: 'icons/svg/aura.svg',
          origin: `Item.${item.id}`,
          disabled: false,
          changes,
          flags: { wayfinder: { sourceItemId: item.id, modifierId: m.id, pillar: inferredPillar } }
        });
      }
    }

    // Armor group
    try {
      const armorDefs = item.system?.defenses?.armor;
      if (armorDefs && typeof armorDefs === 'object') {
        const armorChanges = [];
        for (const [attrKey, val] of Object.entries(armorDefs)) {
          const num = Number(val);
          if (!Number.isNaN(num) && num !== 0) {
            armorChanges.push({ key: `system.attributes.${attrKey}.item`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(num) });
          }
        }
        if (armorChanges.length) {
          toCreateEffects.push({
            name: `${item.name || 'Item'} (Armor)`,
            icon: 'icons/svg/shield.svg',
            origin: `Item.${item.id}`,
            disabled: false,
            changes: armorChanges,
            flags: { wayfinder: { sourceItemId: item.id, armor: true, pillar: 'item' } }
          });
        }
      }
    } catch (err) {
      console.warn('Wayfinder | error processing armor defenses for item on update', item.id, err);
    }

    if (toCreateEffects.length) {
      console.log('Wayfinder | creating ActiveEffects on actor due to inventory.hand change', actor.id, toCreateEffects);
      const created = await actor.createEmbeddedDocuments('ActiveEffect', toCreateEffects);
      console.log('Wayfinder | created ActiveEffects on update:', created);
    }
  } catch (err) {
    console.error('Wayfinder | Error handling updateItem hook for inventory changes', err);
  }
});

// When an Item is removed from an Actor, remove any modifier items that were
// created from it (matching by `system.sourceItemId`).
Hooks.on('deleteItem', async (item, options, userId) => {
  try {
    console.log('Wayfinder | deleteItem hook fired', { item, options, userId });
    const actor = item.parent;
    console.log('Wayfinder | deleteItem parent:', actor?.id, actor?.documentName, actor?.name);
    if (!actor || actor.documentName !== 'Actor') return;
    // Find ActiveEffects that reference this item as their source and remove them
    const toDeleteEffects = actor.effects.filter(e => e.origin === `Item.${item.id}` || e.flags?.wayfinder?.sourceItemId === item.id).map(e => e.id);
    console.log('Wayfinder | effects to delete for item', item.id, toDeleteEffects);
    if (toDeleteEffects.length) await actor.deleteEmbeddedDocuments('ActiveEffect', toDeleteEffects);
  } catch (err) {
    console.error('Wayfinder | Error removing modifiers on item delete', err);
  }
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