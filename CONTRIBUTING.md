# Contribuindo com o Kaisha

Toda ajuda é bem-vinda: temas novos, móveis, traduções, correções. Abra uma issue ou um pull request.

## Criando um tema

Um tema é uma pasta em `themes/` com um `theme.yaml`. Não precisa mexer em código.

```yaml
nome: Halloween
titulo: "Feliz Halloween!"        # faixa no topo do painel (opcional)
periodo: { de: "10-25", ate: "10-31" }
efeito: folhas                    # neve, confete, folhas, morcegos (opcional)

enfeites:
  - { sprite: teia,    ponto: teto }
  - { sprite: abobora, ponto: canto }
  - { sprite: morcego, ponto: parede, cada: 4 }
  - { sprite: vela,    ponto: mesa }
  - { sprite: bruxa,   ponto: cabeca }

desenhos:
  abobora:
    paleta: { o: "#f0883e", O: "#c0652a", g: "#4fa66a", k: "#3a2a1a" }
    pixels:
      - "....g...."
      - "..OoOoO.."
      - ".OokoOkoO"
      - ".OoooooO."
      - ".OokkkoO."
      - "..OoOoO.."
```

**Período**
- Fixo: `periodo: { de: "MM-DD", ate: "MM-DD" }`. Pode virar o ano (`"12-26"` a `"01-02"`).
- Móvel: `movel: { base: pascoa, de: -51, ate: -46 }` (dias em relação à Páscoa; Carnaval é -51 a -46). Também existe `base: black_friday`.
- Quando dois temas valem no mesmo dia, ganha o de período mais curto.
- `calendarios: [br]` limita o tema a um calendário (o `office.yaml` escolhe com `calendario:`).

**Onde os enfeites vão (`ponto`)**

| Ponto | Onde |
| --- | --- |
| `teto` | repetido ao longo do topo de cada sala (bandeirinhas, luzinhas) |
| `parede` | na parede, a cada `cada` blocos (padrão 4), pulando janelas e quadros; `offset` desloca |
| `canto` | num canto do chão de cada sala (`side: left` ou `right` para fixar) |
| `mesa` | em cima de cada mesa |
| `cabeca` | na cabeça de cada agente (chapéus, gorros) |

`salas: [id1, id2]` limita um enfeite a algumas salas.

**Desenhos**: cada desenho é uma lista de linhas de texto; cada letra é uma cor da `paleta` e `.` é transparente. Um bloco do escritório tem 16×16 pixels; um gorro tem uns 10×7, uma árvore 16×22.

**Testando**: coloque `tema: <id-da-pasta>` no `office.yaml`. O painel recarrega sozinho a cada alteração no `theme.yaml`.

## Móveis e bonecos

Ficam em [`web/sprites.js`](web/sprites.js), desenhados em código. Um móvel novo é uma entrada em `FURNITURE` com `w`, `h` e uma função `draw`.

## Regras

- Desenhos só originais (feitos por você) ou CC0. Nada de pacotes de pixel art com licença restrita.
- Sem dependências novas sem conversar antes: a ideia é continuar com uma imagem pequena e um container só.
