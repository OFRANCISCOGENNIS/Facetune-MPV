# Portrait Web

Estúdio original de retratos em HTML, CSS e JavaScript. A interface usa tons naturais, área de foto escura, tipografia Instrument Serif/Manrope e ícones vetoriais. Não usa marca, código ou recursos visuais do Facetune.

## Abrir

`dist/portrait.html` é a versão em arquivo único. Baixe e abra no seu navegador, se a política local permitir. Para desenvolver ou servir via HTTP com Python 3:

```sh
cd /workspace/Facetune-MPV/web
python3 -m http.server 3000 --bind 0.0.0.0
```

Este comando inicia um servidor de desenvolvimento. Para publicação, execute `python3 scripts/build_web.py` e hospede a pasta `dist/site/` em HTTPS, ou envie `dist/portrait-web.zip` a um host estático. A entrega inclui vendor/ com o conversor HEIC. Não requer npm, framework, compilador ou conta para editar. Consulte `docs/DEPLOYMENT.md` no repositório para execução e publicação.

## Online, instalável e offline

A versão hospedada é uma PWA: abra em HTTPS e use “Instalar app”. No Safari/iOS, use Compartilhar → Adicionar à Tela de Início; Chrome/Edge e Android oferecem instalação quando o sistema permitir. Aguarde “Pronto para offline” antes de desconectar. O app pode ser recarregado offline, incluindo importação HEIC e exportação JPEG. O cache guarda somente arquivos do aplicativo, nunca fotos ou edições. O navegador pode remover esse cache. Atualizações aguardam o fechamento das abas para preservar a edição em andamento.

O arquivo único `portrait.html` continua disponível, com fontes e HEIC incluídos, sem depender de service worker. Não há garantia de funcionamento em navegadores antigos. A interface tem alternativa de leitura nativa quando `createImageBitmap` não está disponível. A instalação em aparelhos físicos e outros motores de navegador não foi testada nesta máquina.

## Interface

- Abas Ajustes, Retoque e Filtros; seleção e navegação por setas, Home e End.
- Valores numéricos e preenchimento dos controles; estados de carregamento, erro e indisponibilidade.
- Miniaturas de filtros baseadas na foto importada; comparador antes/depois com alça arrastável e controle por teclado.
- Ajuda acessível em quatro passos, link para pular ao editor, foco visível e respeito a movimento reduzido.
- Layout responsivo; exportação no cabeçalho fixo do celular. Testado em larguras de 320, 390, 768, 1024 e 1440 px.

## Recursos e limites

Importação por seletor ou arraste de JPG/PNG/WebP/HEIC/HEIF até 25 MB; edição em Canvas no navegador; iluminação, temperatura, saturação, suavização aproximada com preservação de bordas; área manual ajustável por ponteiro/teclado; seis filtros originais com intensidade; grão e vinheta; contraste, realces, sombras, vivacidade e nitidez; clareamento manual localizado; corte por proporções e reposicionamento; giro/espelho; comparação; histórico de até 30 estados; restauração e download JPEG. Imagens são limitadas a 1600 px no maior lado para reduzir memória e latência. Os ajustes sempre partem do original; não se acumulam sobre o resultado anterior.

Fotos não são enviadas a um servidor. Não há analytics, modelos externos ou dependências remotas em execução. HEIC/HEIF usa o decodificador nativo quando disponível, com fallback local heic-to 1.6.6 em Web Worker. O decodificador é incluído na pasta vendor/ e no HTML único; não exige CDN ou serviço de conversão. São reconhecidos nome, MIME e assinatura do contêiner, inclusive arquivos de iPhone sem MIME. Conversões não substituem importações mais recentes; erros preservam a foto anterior. Recarregar/fechar a página descarta a edição. Suavização e clareamento não fazem segmentação de pele/dentes nem IA; a seleção da área é manual. O original inteiro é mantido em memória para corte e giro reversíveis. Antes/depois compara o mesmo enquadramento, e restaurar ajustes volta à imagem inteira. No modo local, iluminação, suavização e clareamento são limitados à elipse; cor e filtros continuam globais. Sem vídeo, reconstrução facial, RAW, HDR ou preservação de metadados. O histórico de até 30 estados dura apenas a sessão atual. JPEG usa fundo branco para transparência. Fotos muito grandes podem exceder a memória durante a decodificação. Em HEIC/HEIF com várias imagens, apenas a primeira é importada; não há Live Photo, preservação de HDR, dados de profundidade ou metadados. A conversão tem limite de espera de 45 segundos; variantes não suportadas recebem uma mensagem de erro. O fallback foi testado no Chromium com HEIC real; Safari/iOS e outros aparelhos não foram validados nesta máquina.

## MVP ampliado e referências

Contraste, realces, sombras, vivacidade e nitidez ficam em Ajustes → Tons e detalhes. Filtros têm intensidade, grão e vinheta. Retoque oferece clareamento somente quando a área manual está ativada. Corte permite proporções 1:1, 4:5, 16:9 e 9:16, posição X/Y, giro de 90° e espelho. Desfazer/refazer ficam na barra da foto; importar outra imagem limpa esse histórico.

O MVP usa implementação original, apoiada em pesquisa de documentação pública de Lightroom, VSCO, Photoshop Express e Facetune. Não é cópia, não oferece todas as funções desses produtos e não teve acesso aos seus códigos/binários. A análise REA foi de scripts públicos dos sites. Evidências e limites estão em docs/EDITOR_RESEARCH.md no repositório.

## Imagem, fontes e licenças

- `assets/demo.png`: retrato de Eileen Collins, NASA, distribuído por scikit-image. Origem: https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png. Imagem NASA em domínio público; não implica endosso.
- Instrument Serif e Manrope, distribuídas sob SIL Open Font License 1.1. Fontes obtidas de `google/fonts` no GitHub e incluídas localmente em `assets/fonts/`. Textos completos das licenças: `InstrumentSerif-OFL.txt` e `Manrope-OFL.txt`. O arquivo único inclui as licenças no download “Sobre o projeto”.

## HEIC/HEIF e dependências

`vendor/heic-to/heic-to.js` é o bundle IIFE original, sem modificações, de `heic-to@1.6.6` (libheif 1.23.6). Licença LGPL-3.0-or-later; textos das licenças, origens e informações para reconstruir/substituir o decodificador estão em `vendor/heic-to/`. O download “Sobre o projeto” inclui esses avisos e as licenças completas. O aplicativo não restringe a substituição do decodificador por uma implementação compatível.

## Gerar o arquivo único

Na raiz, execute `python3 scripts/build_web.py`. O resultado `dist/portrait.html` incorpora imagem, fontes, CSS, JavaScript e notas. Pode ser distribuído sozinho. Nesta máquina o Chromium administrado bloqueia file://; a versão independente foi testada via HTTP e depois com a rede desligada. Nenhuma política foi desativada.

## Testes

Playwright precisa estar disponível para o Node e Chromium em `/usr/bin/chromium`. Na máquina atual isso é fornecido pelo runtime. Com o servidor da porta 3000 ativo:

```sh
node web/tests/browser.cjs
node web/tests/interface.cjs
node web/tests/heic.cjs
```

Para o arquivo único, sirva `dist/` na porta 3001 e execute `node web/tests/offline.cjs`. Para análise automática de acessibilidade, instale `@axe-core/playwright@4.11.1` em uma pasta de ferramentas fora do checkout e forneça seu caminho com `PORTRAIT_AXE_PATH`; execute `node web/tests/accessibility.cjs` com o servidor da porta 3000 ativo.

O teste HEIC também usa a porta 3001 para verificar o HTML independente com a rede desligada. Para outras portas, use `PORTRAIT_TEST_ORIGIN` e `PORTRAIT_STANDALONE_ORIGIN`.

Relatórios da entrega: `upgrade-test-results.json` (1 transição entre versões com cache HTTP já preenchido, sem interromper a edição aberta), `advanced-test-results.json` (19 verificações dos novos ajustes, preset/intensidade, clareamento, geometria, histórico e exportação), `pwa-test-results.json` (8 verificações de PWA, recarga offline, HEIC, JPEG, subdiretórios e alternativa sem createImageBitmap), `heic-test-results.json` (11 verificações de HEIC real, HEIF, MIME ausente, assinatura, arraste, JPEG, corrupção, concorrência e modo offline), `test-results.json` (15 verificações funcionais), `interface-test-results.json` (9 verificações de interface), `offline-test-results.json` (4 verificações do HTML independente) e `accessibility-test-results.json` (7 estados inspecionados com axe WCAG 2 A/AA e 2.1 AA). A análise automática não é certificação completa de acessibilidade. Não foram testados Safari/Firefox, leitor de tela ou aparelhos físicos. Publicação e execução são documentadas em `docs/DEPLOYMENT.md`; o resultado da publicação é registrado em `dist/deployment.json`, sem presumir prontidão antes da validação HTTP. O teste iOS continua separado.
