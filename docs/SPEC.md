# Especificação do FaceTune MVP (metodologia SPARC)

Este documento segue o fluxo **SPARC** usado pelo [ruflo](https://github.com/ruvnet/ruflo)
(Specification → Pseudocode → Architecture → Refinement → Completion).

> **Sobre a "engenharia reversa".** O Facetune (Lightricks) é software proprietário.
> Este MVP é uma implementação **clean-room**: as funcionalidades foram levantadas a partir
> do comportamento público do app (loja, tutoriais, uso observável). Nenhum binário foi
> descompilado e nenhum código, asset, nome comercial ou marca da Lightricks foi usado.

---

## 1. Specification — o que o Facetune faz

### 1.1 Mapa de funcionalidades do Facetune

| Área | Recurso no Facetune | Prioridade p/ MVP | Status no MVP |
|---|---|---|---|
| Pele | **Smooth** – pincel de suavização de pele | P0 | ✅ `Suavizar` |
| Pele | Auto-retoque com detecção de rosto | P0 | ✅ `✨ Auto` (detecção de pele YCbCr, sem ML) |
| Pele | **Patch / Heal** – remover espinhas e manchas | P0 | ✅ `Corrigir` (toque) |
| Rosto | **Whiten** – clarear dentes e olhos | P0 | ✅ `Clarear` |
| Rosto | **Reshape** – liquify/empurrar traços | P0 | ✅ `Remodelar` |
| Rosto | **Details** – realçar olhos, cabelo, textura | P1 | ✅ `Detalhes` |
| Rosto | Face/Eyes/Nose/Lips sliders (landmarks) | P2 | ⏳ roadmap (requer face landmarks) |
| Cor | Ajustes (brilho, contraste, saturação, temperatura, vinheta) | P1 | ✅ `Ajustes` |
| Cor | Filtros / presets com intensidade | P1 | ✅ `Filtros` (6 presets + slider) |
| Fluxo | Antes/depois (segurar para comparar) | P0 | ✅ botão `Antes` |
| Fluxo | Desfazer/refazer, borracha por ferramenta | P0 | ✅ |
| Fluxo | Exportar/salvar | P0 | ✅ JPEG |
| Fluxo | Zoom com pinça | P1 | ⏳ roadmap |
| Avançado | Maquiagem, cabelo, fundo (IA), vídeo, corpo | P3 | ❌ fora do escopo |
| Negócio | Assinatura / paywall, conta | P3 | ❌ fora do escopo |

### 1.2 Requisitos do MVP

- **RF1** Abrir foto da galeria/câmera ou por arrastar-e-soltar (respeitando orientação EXIF).
- **RF2** Ferramentas de pincel (Suavizar, Clarear, Detalhes) com tamanho, intensidade e borracha.
- **RF3** Remoção de manchas por toque.
- **RF4** Remodelar por arrasto (warp).
- **RF5** Ajustes globais e filtros com intensidade.
- **RF6** Comparar com o original, desfazer/refazer, limpar ferramenta.
- **RF7** Exportar a imagem final.
- **RNF1** Privacidade: 100% local, nenhuma imagem sai do dispositivo, sem modelos baixados.
- **RNF2** Interativo em celular: pincel a 60 fps em imagens de até 1280 px.
- **RNF3** Não destrutivo: cada ferramenta pode ser apagada ou desfeita independentemente.

---

## 2. Pseudocode — algoritmos principais

**Suavizar (surface blur, preserva bordas)**
```
blur  = gaussiana(original, r)                  // 3× box blur
peso  = exp(-(lum(blur) - lum(original))² / 2σ²)
suave = original + (blur - original) · peso     // só suaviza onde a diferença é pequena
saída = mix(original, suave, máscara_pincel)
```

**Corrigir (patch)**
```
alvo  = estatísticas do anel ao redor da mancha
para cada candidato em círculos a 2.2r, 2.8r, 3.6r:
    score = |cor(disco) - cor(alvo)|·2 + |cor(anel) - cor(alvo)| + desvio(disco)·1.5
melhor = argmin(score)
copiar disco(melhor) → mancha, com borda suave e correção de cor (alvo - anel(melhor))
```

**Remodelar (warp por campo de deslocamento, mapeamento reverso)**
```
saída(p) = fonte(p + d(p))                       // bilinear
arrasto Δ com raio R:  f = (1 - |p-c|²/R²)² · força
d'(p) = d(p - Δ·f) - Δ·f                         // compõe com deformações anteriores
```

**Clarear**: dessaturar 75% + leve compensação de azul + elevar luminosidade 22%.
**Detalhes**: unsharp mask `orig + (orig - blur) · 1.4`.
**Auto**: máscara de pele em YCbCr (Cb∈[77,127], Cr∈[133,173]) → desfocada → máscara de suavização.

---

## 3. Architecture

```
src/
├── main.ts            UI (DOM, eventos de ponteiro, painéis) — única parte com DOM
└── core/              Motor puro em TypeScript, sem DOM, 100% testável em Node
    ├── image.ts       Tipo Img (compatível com ImageData), retângulos, regiões
    ├── filters.ts     boxBlur, surfaceSmooth, sharpen, whiten, skinMask
    ├── mask.ts        Pincel macio (dabs) e traços
    ├── heal.ts        Busca e clonagem de patch para manchas
    ├── warp.ts        Campo de deslocamento + push warp + aplicação bilinear
    ├── adjust.ts      Ajustes globais (LUT) e matrizes de cor dos filtros
    ├── history.ts     Pilha de desfazer/refazer limitada
    └── editor.ts      Estado + pipeline de composição
```

**Pipeline não destrutivo** (`Editor`):

```
original ─► base (patches de Corrigir)
           ─► mix(camada Suavizar, Clarear, Detalhes  por máscaras 0..255)
           ─► ajustes + filtro
           ─► warp (Remodelar)
           ─► saída
```

- As camadas de efeito (pele suavizada, clareada, nítida) são **pré-calculadas uma vez** ao abrir a foto;
  pintar só altera uma máscara `Uint8Array` e recompõe o **retângulo sujo** — por isso o pincel é rápido.
- As máscaras vivem no espaço da imagem original; ao pintar sobre uma área já remodelada, o ponto
  da tela é mapeado de volta pelo campo de deslocamento.
- Histórico guarda snapshots por tipo (máscara, warp, look, região de patch), no máximo 25 passos.
- Resolução de trabalho limitada a 1280 px no maior lado (RNF2).

---

## 4. Refinement — decisões e trade-offs

| Decisão | Motivo | Alternativa futura |
|---|---|---|
| Detecção de pele heurística (YCbCr) | Zero download, privacidade, funciona offline | MediaPipe Face Landmarker para máscaras precisas |
| Canvas 2D + JS puro | Sem dependências, bundle de ~7 kB gzip | WebGL/WebGPU shaders para 4K em tempo real |
| Limite de 1280 px | Memória de histórico e fluidez no celular | Tiles + exportação em resolução total |
| Web/PWA mobile-first | Um código para iOS/Android/desktop | Empacotar com Capacitor para as lojas |

Problemas encontrados no teste E2E e corrigidos:
- Patches com pincel grande clonavam fundo/olhos → o score passou a comparar a cor do **disco** de origem, não só do anel.
- Um único tamanho de pincel servia mal a todas as ferramentas → tamanho lembrado **por ferramenta**.

---

## 5. Completion — verificação e roadmap

**Verificação**
- `npm test` — 20 testes unitários do motor (blur, suavização preserva bordas, clareamento, máscara de pele,
  pincel/borracha, warp desloca conteúdo, patch remove mancha, desfazer/refazer de todas as ferramentas).
- E2E com Playwright (Chromium, viewport de iPhone): abrir foto → Auto → Corrigir 33 manchas (~12 ms/toque)
  → Clarear dentes → Remodelar bochecha → filtro → desfazer → exportar JPEG, sem erros no console.

**Roadmap (pós-MVP)**
1. Zoom/pan com pinça e pincel com dois dedos.
2. Landmarks faciais (MediaPipe) → sliders de rosto: afinar rosto, aumentar olhos, nariz, sorriso.
3. Processamento em WebGL + exportação em resolução original.
4. Ferramenta de olhos vermelhos, desfoque de fundo e recorte/rotação.
5. App nativo via Capacitor, salvar direto na galeria.
