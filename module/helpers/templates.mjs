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

    let html = '<div class="form-group trait-description-group">';
    html += '<div class="trait-description-header">';
    html += `<label class="trait-description-label">${label}</label>`;

    if (editable) {
      html += '<button type="button" class="trait-editor-toggle-btn" title="Editar descrição">';
      html += '<i class="fas fa-edit"></i> Editar';
      html += '</button>';
    }

    html += '</div>';
    html += '<div class="trait-editor-wrapper">';
    html += '<div class="trait-editor-toolbar" style="display: none;">';

    // Undo/Redo
    html += '<button type="button" class="editor-fmt-btn" data-format="undo" title="Desfazer (Ctrl+Z)"><i class="fas fa-undo"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="redo" title="Refazer (Ctrl+Y)"><i class="fas fa-redo"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Formatação Básica
    html += '<button type="button" class="editor-fmt-btn" data-format="bold" title="Negrito (Ctrl+B)"><i class="fas fa-bold"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="italic" title="Itálico (Ctrl+I)"><i class="fas fa-italic"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="underline" title="Sublinhado (Ctrl+U)"><i class="fas fa-underline"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Listas
    html += '<button type="button" class="editor-fmt-btn" data-format="insertUnorderedList" title="Lista com bullets"><i class="fas fa-list-ul"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="insertOrderedList" title="Lista numerada"><i class="fas fa-list-ol"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Títulos
    html += '<button type="button" class="editor-fmt-btn" data-format="formatBlock" data-value="h2" title="Título H2"><strong>H2</strong></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="formatBlock" data-value="h3" title="Título H3"><strong>H3</strong></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="formatBlock" data-value="p" title="Parágrafo Normal"><strong>P</strong></button>';
    html += '<span class="editor-separator"></span>';

    // Alinhamento
    html += '<button type="button" class="editor-fmt-btn" data-format="justifyLeft" title="Alinhar à esquerda"><i class="fas fa-align-left"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="justifyCenter" title="Centralizar"><i class="fas fa-align-center"></i></button>';
    html += '<button type="button" class="editor-fmt-btn" data-format="justifyRight" title="Alinhar à direita"><i class="fas fa-align-right"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Citação e Links
    html += '<button type="button" class="editor-fmt-btn" data-format="formatBlock" data-value="blockquote" title="Citação"><i class="fas fa-quote-right"></i></button>';
    html += '<button type="button" class="editor-fmt-btn editor-link-btn" title="Inserir Link"><i class="fas fa-link"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Cores
    html += '<button type="button" class="editor-fmt-btn editor-text-color-btn" title="Cor do Texto"><i class="fas fa-palette"></i></button>';
    html += '<button type="button" class="editor-fmt-btn editor-bg-color-btn" title="Cor de Fundo"><i class="fas fa-fill-drip"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Tabela e Imagem
    html += '<button type="button" class="editor-fmt-btn editor-table-btn" title="Inserir Tabela"><i class="fas fa-table"></i></button>';
    html += '<button type="button" class="editor-fmt-btn editor-image-btn" title="Inserir Imagem"><i class="fas fa-image"></i></button>';
    html += '<span class="editor-separator"></span>';

    // Preview e Stats
    html += '<button type="button" class="editor-fmt-btn editor-preview-btn" title="Alternar Pré-visualização"><i class="fas fa-eye"></i></button>';
    html += '<span class="editor-stats"></span>';
    html += '<button type="button" class="editor-close-btn" title="Fechar Editor"><i class="fas fa-times"></i> Pronto</button>';

    html += '</div>';
    html += `<div class="trait-editor-content" contenteditable="false" data-text-editable="false">${value}</div>`;
    html += '<div class="trait-editor-preview" style="display: none;"></div>';
    html += `<textarea name="${name}" style="display: none;">${value}</textarea>`;
    html += '</div>';
    html += '</div>';

    return new Handlebars.SafeString(html);
  });

  // Componente de efeito colapsável para talents
  Handlebars.registerHelper('collapsibleEffect', function(options) {
    const hash = options.hash || {};
    const effect = hash.effect || {};
    const idx = hash.idx || 0;
    const effectId = `effect-${idx}-${Math.random().toString(36).substr(2, 9)}`;
    const isActive = effect.type === 'active-effect';

    let html = '<div class="effect-collapsible">';
    html += `<div class="effect-collapsible-header ${isActive ? 'active-header' : 'passive-header'}" data-effect-id="${effectId}">`;
    html += '<i class="fas fa-chevron-right effect-collapsible-icon"></i>';
    html += `<span class="effect-collapsible-title">${effect.name || 'Efeito'}</span>`;

    // Add badges
    if (isActive && effect.isMagic && effect.magicCircle) {
      const circleText = effect.magicCircle === 'cantrip' ? 'Cantrip' : `${effect.magicCircle}º Círculo`;
      html += `<span class="effect-badge magic-badge"><i class="fas fa-hat-wizard"></i> ${circleText}</span>`;
    }
    if (isActive && effect.focusCost > 0) {
      html += `<span class="effect-badge focus-badge"><i class="fas fa-star"></i> ${effect.focusCost} Foco</span>`;
    }

    // Add toggle for passive effects (if not permanent)
    if (!isActive && !effect.isPermanent) {
      const isActiveState = effect.isActive !== false; // default to true
      html += `<label class="effect-toggle" title="${isActiveState ? 'Ativo' : 'Inativo'}">`;
      html += `<input type="checkbox" data-effect-uuid="${effect.uuid}" ${isActiveState ? 'checked' : ''}/>`;
      html += `<span class="toggle-label">${isActiveState ? 'Ativo' : 'Inativo'}</span>`;
      html += '</label>';
    }

    html += '</div>';
    html += `<div class="effect-collapsible-content" id="${effectId}" style="display: none;">`;
    html += '<div class="effect-details">';

    // Traits first: always render at the top of the effect tab
    if (Array.isArray(effect.traitsResolved) && effect.traitsResolved.length) {
      html += '<div class="effect-section effect-traits">';
      html += '<div class="effect-section-header"><i class="fas fa-tags"></i> Traits</div>';
      html += '<div class="effect-traits-row">';
      for (const trait of effect.traitsResolved) {
        const color = trait.color || '#666666';
        const name = trait.name || 'Trait';
        html += `<span class="trait-chip trait-chip-small" style="background-color: ${color};" title="${name}">`;
        html += `<span class="trait-chip-name">${name}</span>`;
        html += '</span>';
      }
      html += '</div>';
      html += '</div>';
    }

    // Spell header (pretty title) above metadata when magic
    if (effect.isMagic) {
      html += '<div class="spell-title"><i class="fas fa-scroll"></i><span>Magia</span></div>';
    }

    // Metadata block (single card) shown above description
    const hasMetadata = (effect.range || effect.target || effect.duration || effect.isMagic || effect.focusCost > 0 || effect.magicCircle);
    if (hasMetadata) {
      html += '<div class="effect-section effect-meta-block">';
      html += '<div class="effect-meta-flex">';

      if (effect.isMagic && (effect.magicCircle || effect.isMagic)) {
        const circleText = effect.magicCircle === 'cantrip' ? 'Cantrip' : `${effect.magicCircle || ''}º Círculo`;
        html += '<div class="effect-meta-chip">';
        html += '<i class="fas fa-hat-wizard"></i>';
        html += `<span>${circleText.trim() || 'Magia'}</span>`;
        html += '</div>';
      }

      if (effect.focusCost > 0) {
        html += '<div class="effect-meta-chip">';
        html += '<i class="fas fa-star"></i>';
        html += `<span>${effect.focusCost} Foco</span>`;
        html += '</div>';
      }

      if (effect.range) {
        html += '<div class="effect-meta-chip">';
        html += '<i class="fas fa-ruler-combined"></i>';
        html += `<span>Alcance: ${effect.range}</span>`;
        html += '</div>';
      }
      if (effect.target) {
        html += '<div class="effect-meta-chip">';
        html += '<i class="fas fa-crosshairs"></i>';
        html += `<span>Alvo: ${effect.target}</span>`;
        html += '</div>';
      }
      if (effect.duration) {
        html += '<div class="effect-meta-chip">';
        html += '<i class="fas fa-hourglass-half"></i>';
        html += `<span>Duração: ${effect.duration}</span>`;
        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
    }

    // (traits rendered above)

    if (effect.description) {
      html += '<div class="effect-section effect-description">';
      html += '<div class="effect-section-header"><i class="fas fa-file-alt"></i> Descrição</div>';
      html += `<div class="effect-text">${effect.description}</div>`;
      html += '</div>';
    }

    if (effect.effect) {
      html += '<div class="effect-section effect-effect">';
      html += '<div class="effect-section-header"><i class="fas fa-magic"></i> Efeito</div>';
      html += `<div class="effect-text">${effect.effect}</div>`;
      html += '</div>';
    }

    // Heightened table info (magic scaling)
    // Show heightened table if entries exist (robust), even if isMagic wasn't toggled
    if (Array.isArray(effect.heightened) && effect.heightened.length) {
      html += '<div class="effect-section effect-heightened">';
      html += '<div class="effect-section-header"><i class="fas fa-level-up-alt"></i> Efeitos Aprimorados</div>';
      html += '<div class="heightened-list">';
      for (const entry of effect.heightened) {
        const levelLabel = entry?.level || '';
        const text = (entry?.effects ?? entry?.effect) || '';
        html += '<div class="heightened-row">';
        html += `<span class="heightened-badge"><span class="heightened-label">Aprimorado</span><span class="heightened-level-pill">${levelLabel}</span></span>`;
        html += `<div class="heightened-text">${text}</div>`;
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    html += '</div>';
    html += '</div>';

    return new Handlebars.SafeString(html);
  });

  // Load main sheet template
  return foundry.applications.handlebars.loadTemplates([
    "systems/wayfinder/templates/actor/actor-character-sheet.hbs",
    "systems/wayfinder/templates/actor/actor-npc-sheet.hbs",
    "systems/wayfinder/templates/actor/parts/actor-features.hbs",
    "systems/wayfinder/templates/actor/parts/actor-items.hbs",
    "systems/wayfinder/templates/actor/parts/actor-spells.hbs",
    "systems/wayfinder/templates/actor/parts/actor-effects.hbs",
    "systems/wayfinder/templates/actor/parts/actor-talents.hbs",
    "systems/wayfinder/templates/item/item-active-effect-sheet.hbs",
    "systems/wayfinder/templates/item/item-passive-effect-sheet.hbs",
    "systems/wayfinder/templates/item/item-trait-sheet.hbs",
    "systems/wayfinder/templates/item/item-talent-sheet.hbs"
  ]).then(() => {
    console.log('✓ Wayfinder | All templates loaded successfully');
  });
};
