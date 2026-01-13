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

// Import helper/utility classes and constants
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { WAYFINDER } from "./helpers/config.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', async function() {
  console.log('Wayfinder | Initializing Wayfinder System');

  // Add utility classes to the global game object
  game.wayfinder = {
    WayfinderActor,
    WayfinderItem
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

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("wayfinder", WayfinderActorSheet, {
    makeDefault: true,
    label: "WAYFINDER.SheetLabels.Actor"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("wayfinder", WayfinderItemSheet, {
    makeDefault: true,
    label: "WAYFINDER.SheetLabels.Item"
  });

  // Preload Handlebars templates
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function() {
  console.log('Wayfinder | System Ready');
});
