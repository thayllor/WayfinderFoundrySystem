# Sistema de Efeitos Ativos e Passivos - Wayfinder

## 📚 Como Usar

### Criando Efeitos

#### Efeitos Ativos

Efeitos que têm um limite de uso e precisam ser ativados pelo jogador.

**Campos:**

- **Nome**: Nome do efeito
- **Descrição**: Descrição detalhada
- **Alcance**: Alcance do efeito (Ex: Toque, 6m, 30m)
- **Alvo**: Quem é afetado (Ex: Uma criatura, Auto)
- **Duração**: Por quanto tempo o efeito dura (Ex: 1 rodada, 10 minutos)
- **Custo em Foco**: Quanto de Foco gasta para ativar
- **Requer Roll?**: Se deve fazer um teste/rolagem ao ativar
- **Fórmula do Roll**: Fórmula Foundry para o roll (Ex: `1d20 + @attributes.dexterity.modifier`)
- **Efeito ao Chat**: Descrição do que aparece no chat quando ativado

#### Efeitos Passivos

Efeitos que estão o tempo todo ativos (ou podem ser ativados/desativados).

**Campos:**

- **Nome**: Nome do efeito
- **Efeito**: Descrição do efeito passivo
- **Descrição Adicional**: Informações extras
- **Efeito Permanente?**: Se é permanente ou pode ser desativado

### Adicionando Efeitos à Ficha

1. **Criar um novo item** do tipo "Active Effect" ou "Passive Effect"
2. **Preencher os campos** conforme necessário
3. **Arrastar para a ficha** ou já aparecerá automaticamente na aba "Efeitos"

### Usando os Efeitos

#### Efeitos Ativos

- Clique no botão ⚡ para **ativar** o efeito
- O sistema verificará automaticamente se você tem Foco suficiente
- Uma mensagem aparecerá no chat descrevendo a ativação
- Se houver roll necessário, ele será feito automaticamente

#### Efeitos Passivos

- Clique no botão 🔄 para **ativar/desativar** o efeito
- Uma mensagem aparecerá no chat indicando o novo estado
- Efeitos permanentes não podem ser desativados

### Botões de Ação

Cada efeito (ativo ou passivo) tem 3 botões:

| Botão   | Função                             |
| ------- | ---------------------------------- |
| ⚡ / 🔄 | Ativa o efeito ou muda seu estado  |
| 👁️      | Abre a ficha do efeito para editar |
| ✕       | Remove o efeito da ficha           |

### Exemplo de Roll Formulas

```
1d20                                    // Um d20 simples
1d20 + 5                                // Um d20 + modificador fixo
1d20 + @attributes.strength.modifier    // Com modificador do atributo
2d6 + @attributes.wisdom.modifier       // 2d6 + Sabedoria
```

## 🎯 Modificadores (Em desenvolvimento)

Futuramente, você poderá adicionar modificadores que:

- Aplicam bônus/penalidades a atributos
- Mudam valores de recursos
- Aplicam efeitos visuais

## 💡 Dicas

- Use campos descritivos para que o chat fique compreensível
- Crie templates de efeitos comuns para reutilizar
- Combine efeitos para criar combos interessantes
- O custo em Foco é descontado automaticamente ao ativar
