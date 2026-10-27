# MediaPipe Selfie Segmentation

Runtime, modelos e grafo originais do pacote npm `@mediapipe/selfie_segmentation@0.1.1675465747`, sem modificações. Origem: https://registry.npmjs.org/@mediapipe/selfie_segmentation/-/selfie_segmentation-0.1.1675465747.tgz

Projeto: https://github.com/google-ai-edge/mediapipe. Licença Apache-2.0, conforme package.json; o texto completo acompanha esta pasta em LICENSE, obtido de https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE. Autoria indicada pelo pacote: mediapipe@google.com. README.md e index.d.ts originais foram preservados. Hashes individuais estão em provenance.json.

O aplicativo usa o modelo `selfie_segmentation.tflite` (modelSelection: 0) para seleção de pessoa/fundo. O modelo alternativo de paisagem e os runtimes WASM SIMD/sem SIMD acompanham a distribuição original. Os pesos não foram treinados ou modificados neste projeto.

O carregamento ocorre no navegador, de recursos locais ou blobs do HTML independente. O wrapper original web/ai.js adapta os resultados aos efeitos do Portrait, sem enviar fotos a serviços externos. Efeitos e filtros do Portrait não pertencem ao Instagram/Meta. Não há vínculo ou endosso por Google, Meta ou pelos editores usados como referência.
