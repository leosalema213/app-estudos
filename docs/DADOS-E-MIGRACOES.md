# Contrato de dados e migrações pendentes

Este registro acompanha alterações persistidas enquanto a configuração do Supabase está pendente. O aplicativo continua local/offline; não é necessário aguardar o servidor para desenvolver funcionalidades. O diagnóstico e os requisitos para retomar a integração estão em `SUPABASE.md`.

## Tipos personalizados de atividade — 0.4.9 local

Modelo principal permanece na versão 1, com campos opcionais para compatibilidade:

```js
{
  blockKinds: [{ id: 'uuid', name: 'Revisão', icon: 'brain' }],
  plans: [{ blocks: [{
    id: 'uuid-do-bloco',
    type: 'lesson',
    name: 'Revisar capítulo 2',
    minutes: 25,
    kind: { id: 'uuid', name: 'Revisão', icon: 'brain' }
  }] }]
}
```

- `blockKinds` é o catálogo pessoal compartilhado entre planos. Aula e Descanso são padrões embutidos e não precisam ser duplicados nesse catálogo.
- `type` preserva os valores legados `lesson` e `break`: atividades personalizadas têm semântica de foco e usam `lesson`. Isso mantém contagem manual, tempo extra, descansos e métricas compatíveis.
- `kind` é uma cópia da identidade, nome e ícone do tipo, armazenada em cada bloco personalizado. Timer e registros históricos também preservam essa identificação. O bloco não depende de uma consulta à nuvem nem da presença da entrada no catálogo para ser exibido.
- Nome personalizado: até 40 caracteres, sem duplicação de nome após normalizar acentos e maiúsculas. IDs permanecem estáveis e os ícones usam a biblioteca existente.
- Criar um tipo salva o catálogo imediatamente e acrescenta um bloco ao rascunho do plano. Cancelar a edição do plano descarta os blocos do rascunho, mas mantém o tipo criado para reutilização.

### Migração local e backups

Perfis antigos recebem `blockKinds: []` na carga; o validador aplica o mesmo default aos backups antigos. Blocos sem `kind` continuam sendo Aula ou Descanso, sem alteração de IDs, nomes, durações, notas ou registros.

Exportação inclui o catálogo e as cópias dos tipos nos blocos/registro/timer. Importação valida esses campos; um bloco com cópia válida pode ser restaurado mesmo se a entrada correspondente não estiver no catálogo. Não é feita conversão automática de aulas antigas que tenham sido apenas renomeadas para “Revisão”, pois isso seria inferir intenção a partir de texto livre.

### Supabase

**Não exige DDL adicional.** O esquema preparado em `supabase/schema.sql` armazena o estado em `organon_sync_state.payload` (JSONB). O serializador existente percorre todo o estado, preservando `blockKinds` e `kind`, sem lista fixa de colunas por funcionalidade. Hashes canônicos incluem esses campos e detectam mudanças no catálogo.

Os testes do controlador com serviço simulado passaram a incluir um catálogo e bloco personalizados, comprovando o transporte completo e a restauração. O teste de backup Electron também inclui esses campos na comparação integral de exportação/importação e reinício. Isso prepara a compatibilidade; a validação remota continua pendente.

### Validação

- `npm test`: nomes duplicados, integridade dos tipos, migração antiga, foco/crédito manual, timer/tempo extra, histórico e roundtrip.
- `npm run test:block-types`: criação com seletor de ícones, lista excedente, limite de duas linhas sem overflow, janela 840×620, edição do plano e persistência após reiniciar.
- `npm run test:backup`: comparação integral do JSON em perfil limpo, incluindo tipos personalizados.

## Livros — 0.4.10 local

Campo opcional `books: []` no snapshot versão 1. Perfis e backups anteriores recebem o default vazio, preservando todos os identificadores e os demais dados. `notebooks` continua representando cadernos; não foi renomeado nem reaproveitado.

Cada livro contém `{ id, title, format: 'pdf', hash, size, planIds: [], page: 1, pageCount: null, furthestPage: 0, completedAt: null, importedAt, view: { spread: 1, zoom: 1, contrast: 'paper' } }`. `hash` é SHA-256 dos bytes originais. A cópia imutável fica em `<perfil>/books/<hash>.pdf`, com limite de 200 MiB por arquivo. O caminho original nunca é persistido. A importação verifica extensão e assinatura; o leitor PDF.js verifica a estrutura ao abrir e apresenta erro para PDFs inválidos/protegidos. Sem OCR ou execução de conteúdo ativo.

Importações idênticas deduplicam por conteúdo e conservam a entrada já existente. `planIds` aceita múltiplos IDs; não cria blocos nem altera o roteiro diário. Livros sobrevivem à exclusão de planos; IDs órfãos são preservados e não exibidos como vínculos existentes. Excluir a entrada não apaga automaticamente o arquivo interno: referências antigas podem ser necessárias para recuperação. Limpeza física futura precisa considerar backups/recovery; arquivos sem entrada não são exportados.

`page` é a página corrente (primeira do par), salva após renderização; `furthestPage` é a maior página efetivamente exibida, incluindo a segunda página do par. Porcentagem = `floor(furthestPage / pageCount * 100)`. Não é medição de páginas lidas nem cobertura contínua. `completedAt` é data local do check explícito; independe da posição, permite reabertura e participa dos mesmos intervalos semanais/mensais dos planos. Nenhum tempo de estudo é criado pelo leitor. Preferências de layout, zoom e contraste são individuais. O fechamento após usar o leitor aguarda o flush local pelo protocolo de fechamento já existente.

### Binários e backup

O JSON de trabalho mantém somente metadados. Nenhum tick do timer lê ou regrava PDFs. Exportação usa o snapshot atual em memória e acrescenta `bookFiles: { [hash]: base64 }` apenas no arquivo portátil. Cada hash é exportado uma vez, em blocos de base64, para arquivo temporário; um PDF ausente/corrompido aborta a exportação sem substituir um backup anterior completo.

Importação lê e verifica todos os arquivos (assinatura, tamanho e hash) antes da confirmação; os buffers ficam temporariamente no processo principal, fora do renderer. O preview recebe metadados e um token transitório. Cancelar não instala arquivos nem muda os dados. Confirmar copia os binários verificados por gravação temporária/rename e só então restaura o snapshot validado. `bookFiles` e o token não entram no JSON de trabalho. Falhas de cópia não substituem os metadados existentes; arquivos imutáveis já copiados podem ficar sem referência e ser reaproveitados em nova tentativa. Backups antigos sem livros continuam válidos. Na importação, o JSON completo e os buffers ocupam memória; o limite por livro não é uma promessa de memória ilimitada para uma biblioteca inteira.

### Transporte futuro e Supabase

**Sem DDL nesta entrega.** Os metadados opcionais cabem no snapshot JSONB existente. O transporte atual (`packDocument`) recusa snapshots com livros: só enviar hashes sem os arquivos produziria uma cópia incompleta. A configuração continua `enabled:false`; não foi acessado nem alterado o servidor.

Na futura habilitação, os PDFs deverão ser assets privados de tipo `application/pdf`, endereçados por `<user_id>/<sha256>`, com verificação de bytes e tamanho ao receber. Upload de arquivos ausentes deve preceder o commit da revisão do snapshot; só confirmar o download após instalar todos os binários e salvar o estado. Deduplicação, revisão esperada, RLS por usuário, cotas, limite de objeto, MIME permitido do bucket e recuperação integral precisam ser implementados e validados no serviço real antes de remover o bloqueio. Não há migration vazia ou alegação de teste remoto.

### Validação

`npm test` verifica defaults antigos, limites, posição versus ponto mais avançado/conclusão, independência do roteiro, deduplicação, original movido, caminhos inválidos, backup íntegro em perfil limpo, corrupção/falta de binários e bloqueio do transporte remoto incompleto. `npm run test:books` usa PDFs sintéticos e perfis temporários para testar os controles de produção, texto selecionável, reinício, layout, vínculos múltiplos, períodos e exportação/restauração. `ORGANON_REFERENCE_PDF` permite validar um PDF explicitamente fornecido sem adicioná-lo ao repositório; não é uma dependência do teste padrão.

### EPUB e Kindle no mesmo lote 0.4.10

`format` também aceita `epub`, `mobi`, `azw` e `azw3`. EPUB fica em `<hash>.epub`; os três sufixos Kindle compartilham a cópia canônica `<hash>.mobi`. PDFs existentes continuam em `<hash>.pdf`, sem renomeação nem novo ID. A assinatura do contêiner é validada além da extensão; Kindle com sinalizador de criptografia é recusado. A estrutura interna é validada pelos parsers ao abrir. EPUB refluível e MOBI/KF8 sem DRM têm suporte direto; EPUB de layout fixo e KFX são recusados com erro específico. EPUBs têm limite adicional de 512 MiB descomprimidos no total e 64 MiB por recurso antes da leitura de entradas.

Campos opcionais novos: `location` (CFI canônico do começo do trecho), `fraction` (posição atual entre 0 e 1), `furthestFraction` (maior fim de trecho exibido entre 0 e 1), `view.fontSize` (12–36, default 20). Os campos PDF `page/pageCount/furthestPage` permanecem intactos e só são interpretados para PDF. Ausência de localização significa primeira abertura; ausência das frações significa zero. Mudar fonte/layout ou redimensionar a janela preserva o CFI; navegar deliberadamente o atualiza. A porcentagem do card usa `floor(furthestFraction * 100)`, sem concluir automaticamente nem adicionar horas. Backups incluem os mesmos bytes originais sob `bookFiles`, com validação de formato, hash e tamanho; metadados antigos de PDF continuam válidos sem migração física.

O serializador remoto continua bloqueando qualquer biblioteca não vazia. O futuro transporte precisará acrescentar MIME de EPUB (`application/epub+zip`) e Kindle (`application/x-mobipocket-ebook`) aos assets privados, além de PDF; não houve alteração de servidor/DDL.

Foliate.js usa a revisão `78914aef4466eb960965702401634c2cb348e9b1`. Integração usa os módulos de formato/paginação, sem um segundo PDF.js. Antes do iframe, cada documento é reconstruído sem script, iframe/object/embed, base, formulário, meta de navegação ou atributos de evento. Recebe CSP própria com `script-src 'none'`, recursos locais blob/data e sem rede, navegação ou formulários. O iframe no Chromium fica com `sandbox="allow-same-origin"`, sem `allow-scripts`. Links externos não abrem pelo livro. Testes incluem tentativas sintéticas de script e onerror.

`npm run test:ebooks` verifica EPUB/MOBI/AZW sintéticos, fonte, duas colunas, CFI após reinício, remoção de conteúdo ativo e backup/restauração em perfil limpo. A amostra KF8/AZW3 opcional vem de [Project Gutenberg, eBook 11](https://www.gutenberg.org/ebooks/11); `ORGANON_AZW3_REFERENCE` aponta para a cópia local de teste, mantida fora do repositório e da aplicação. `npm run test:books` também verifica Ctrl + scroll, scroll comum sem zoom, botões −/+ e maximização/restauração reais da janela.

## Para as próximas alterações

Ao criar novos campos, registrar formato/defaults, compatibilidade de leitura, transporte no backup e snapshot e testes relevantes. Preparar SQL apenas se houver alteração real da estrutura relacional/RPC/permissões. Aplicação de migrations e testes de isolamento no servidor ficam explicitamente pendentes até retomar a integração. Não enviar dados pessoais como fixture de teste.
