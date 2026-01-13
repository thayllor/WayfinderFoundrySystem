# Wayfinder System

Sistema customizado para Foundry Virtual Tabletop.

## Estrutura do Sistema

Este é um sistema básico que inclui:

- **Atores**: Personagens (characters) e NPCs
- **Itens**: Itens, características (features) e magias (spells)
- **Atributos**: Os seis atributos clássicos (Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma)
- **Recursos**: Saúde (Health) e Poder (Power)

## Instalação

1. Copie o diretório do sistema para `Data/systems/wayfinder` no seu diretório de dados do Foundry VTT
2. Reinicie o Foundry VTT
3. Crie um novo mundo selecionando "Wayfinder System" como sistema de jogo

## Desenvolvimento

Este sistema foi criado seguindo as práticas recomendadas para Foundry VTT v11/v12.

### Estrutura de Arquivos

```
wayfinder/
├── css/
│   └── wayfinder.css
├── lang/
│   ├── en.json
│   └── pt-BR.json
├── module/
│   ├── documents/
│   │   ├── actor.mjs
│   │   └── item.mjs
│   ├── helpers/
│   │   ├── config.mjs
│   │   └── templates.mjs
│   ├── sheets/
│   │   ├── actor-sheet.mjs
│   │   └── item-sheet.mjs
│   └── wayfinder.mjs
├── templates/
│   ├── actor/
│   │   ├── parts/
│   │   ├── actor-character-sheet.hbs
│   │   └── actor-npc-sheet.hbs
│   └── item/
│       ├── item-item-sheet.hbs
│       ├── item-feature-sheet.hbs
│       └── item-spell-sheet.hbs
├── system.json
├── template.json
└── README.md
```

## Licença

Este projeto está disponível sob a licença MIT.
