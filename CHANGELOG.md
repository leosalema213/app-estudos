# Histórico de versões

## 0.5.0

- Corrige o conflito entre a prévia local e a Release 0.4.10, publicando um número superior para que as instalações existentes encontrem a atualização.
- Nova sequência de versões: após PATCH 9, avança MINOR e reinicia PATCH em zero. A 0.4.10 é preservada como histórico legado.
- Prévias passam a usar identificadores distintos, como 0.5.1-preview.1 e 0.5.1-preview.2; a versão final mantém 0.5.1 e é reconhecida como mais nova que essas prévias.
- Comandos para preparar preview/final e bloqueio de previews no publicador de produção. Planos, livros, progresso e demais dados locais permanecem no mesmo perfil.

## 0.4.10

- Biblioteca Livros independente dos cadernos, com importação de PDF, EPUB refluível, MOBI, AZW e AZW3 sem DRM, até 200 MiB por arquivo, e cópias offline deduplicadas no perfil.
- Leitor integrado com retomada automática por página, uma ou duas páginas por tela, zoom, contraste e texto selecionável quando presente no PDF. O ponto mais avançado fica separado da posição atual e da conclusão explícita.
- Biblioteca sem os textos explicativos adicionais. Seletor de páginas com opções 1/2, botões de zoom, Ctrl + scroll e maximizar/restaurar no próprio leitor.
- EPUB e Kindle guardam localização CFI independente da fonte/paginação, com fonte ajustável, contraste, uma/duas colunas e backup dos arquivos originais. EPUB de layout fixo, KFX e conteúdo protegido não são suportados.
- Vários livros por plano e vários planos por livro, com acesso pelo plano. Livros independentes não viram tarefas do Meu dia.
- Check de livro lido e listagem por semana/mês em Meu progresso, sem inventar horas de foco.
- Backup JSON portátil inclui os arquivos e verifica integridade antes de restaurar. Os binários ficam fora do JSON de trabalho e dos checkpoints do cronômetro.
- Transporte remoto recusa snapshots com livros enquanto o envio de binários não estiver implementado e validado. A nuvem permanece desativada.

## 0.4.9

- Tipos personalizados de atividade, com nome e ícone, criados diretamente no editor do plano. Atalhos ocupam até duas linhas; a lista completa aparece quando há tipos excedentes.
- Catálogo de tipos e identificação dos blocos preservados em backups, histórico e no payload preparado para sincronização. Atividades personalizadas contam como foco, mantendo o comportamento dos descansos e dos dados antigos.
- Conta opcional preparada com e-mail e senha, escolha de continuar offline lembrada neste computador e acesso posterior em Preferências → Conta. A conexão fica desativada nesta compilação até concluir a configuração e validação remota do Supabase.
- Sincronização de snapshots e imagens privadas com Supabase, envio ao abrir/fechar ou após um dia, detecção de conflitos e recuperação local antes de trazer dados da nuvem.
- Sessão protegida pelo Windows, fora do arquivo de backup; dados locais preservados ao sair da conta.
- Novas imagens, capas e rabiscos passam por uma fila de otimização fora da interface, com saída de até 1 MB e sem recompressão nos próximos backups/envios. Imagens antigas são preservadas.
- Backup restaura o cronômetro pausado com a duração e o tempo extra preservados.
- Remove a restrição de importação de 40 MB, que impedia restaurar backups grandes exportados pelo próprio aplicativo.
- Exportação usa o estado atual em memória mesmo quando o salvamento automático local falha; restauração só confirma sucesso após salvar.
- Auditoria de backup com teste Electron de exportação/importação, perfil limpo, reinício, migração e falha de gravação local.

## 0.4.8

- Após abrir e salvar os dados com sucesso, remove instaladores do atualizador da versão instalada e das anteriores, incluindo o acúmulo legado.
- Preserva downloads de versões futuras, arquivos desconhecidos, dados pessoais e Downloads do navegador; tenta novamente após 30 segundos caso o instalador ainda esteja em uso.
- Versões de desenvolvimento usam uma identificação própria no Windows, evitando conflito com o Organon instalado.
- Corrige o identificador do atalho legado Electron quando pertence ao aplicativo e informa explicitamente o nome Organon ao menu da barra de tarefas.

## 0.4.7

- Ícone da janela carregado explicitamente com o símbolo do Organon.
- Barra de tarefas do Windows recebe o ícone por um arquivo físico fora do app.asar, mantendo a identidade e os dados existentes.

## 0.4.6

- Modo compacto mantém 340×112 e oferece +2, +3 ou +5 minutos pelo botão + junto ao play; opções ocupam temporariamente o título, com teclado, Escape e fechamento ao clicar fora.
- Tempo extra vale só para a sessão/data ativa e persiste com o cronômetro, sem alterar a duração das próximas aulas ou creditar minutos antecipadamente. Aulas concluídas reabrem pausadas; descansos não permitem acréscimos.
- Aplicativo renomeado para Organon, com logo próprio e ícone de ômega invertido no Windows.
- Perfil local e identificadores de atualização preservados para manter os dados das instalações Compasso.
- Instalador Organon com cópia de compatibilidade para atualização pelos clientes anteriores.
- Preferência Iniciar com o Windows em Geral, ativada por padrão e com a escolha salva.
- Registro da inicialização usa o executável atual e é removido na desinstalação; atualizações preservam a configuração.
- Opção Lembrar-me em cada nota, desativada por padrão e preservada nos backups.
- Ao abrir, uma única notificação do Windows agrupa as notas de hoje que têm Lembrar-me ativo e ainda não foram vistas.
- Clicar na notificação restaura o aplicativo, sai do modo compacto se necessário e abre Notas no filtro Hoje.
- Perfis temporários de teste não alteram a inicialização real nem exibem notificações reais do sistema.

## 0.4.5

- Planos com escolha independente de ícone e cor, incluindo cor personalizada; ícones anteriores preservados até editar.
- Biblioteca compartilhada com mais de 70 ícones e busca, disponível em planos e cadernos.
- Escolha de ícone em popup separado, sem expandir o formulário; seleção fecha o popup e Escape cancela sem fechar a edição.
- Ação de concluir o plano inteiro, separada dos checks diários, com confirmação e possibilidade de reabrir.
- Filtros Em andamento, Finalizados e Todos; planos finalizados saem de Meu dia e mantêm histórico e anotações.
- Meu progresso mostra planos concluídos por semana/mês, total geral e lista com datas de conclusão.
- Duplicar um plano finalizado cria uma cópia em andamento, com o mesmo ícone e cor e sem copiar o histórico.
- Nova área Notas com título, descrição, data específica ou recorrência diária.
- Notas pendentes aparecem abaixo dos indicadores de Meu dia, com destaque visual; marcar como vista oculta a nota e a seção some quando vazia.
- Confirmações independentes por dia, com opção de marcar como não vista, editar e excluir com confirmação.
- Preferência global para contabilizar a duração ao concluir manualmente, desativada por padrão.
- O check completa apenas o tempo que falta, evitando duplicação; desfazer retira só o acréscimo manual e mantém o tempo real do cronômetro.
- Notas, confirmações e tempo manual incluídos nos backups; dados anteriores preservados.
- Meu dia acompanha a virada da data quando está mostrando o dia atual, inclusive com o cronômetro parado.
- Edições de cadernos e notas são salvas sem aguardar o intervalo do cronômetro ativo.

## 0.4.4

- Área Cadernos independente dos planos de estudo, com vários cadernos e páginas.
- Capas opcionais por imagem, cores e ícones; edição e exclusão com confirmação.
- Seletor de cor personalizada junto às cores pastéis, 24 ícones e opção Sem ícone, inclusive em capas com imagem.
- Índice de páginas atualizado pelos títulos e índice clicável dos títulos dentro de cada página.
- Editor com negrito, itálico, tamanho de fonte, títulos, listas, desfazer/refazer e atalhos Markdown para títulos (`#`, `##`, `###`).
- Imagens, prints e rabiscos intercalados com o texto, reutilizando o editor das anotações.
- Dados anteriores preservados; cadernos, capas e formatação incluídos nos backups locais.
- Botão de maximizar com o quadrado padrão do Windows.
- Botão do modo compacto reduzido a um ícone discreto com identificação ao passar o mouse.
- Modo compacto fixo em 340 × 112 px, sem redimensionamento, preservando a última posição e restaurando o tamanho normal ao expandir.

## 0.4.3

- Anotações em documento contínuo: texto, prints, imagens e rabiscos intercalados na posição do cursor.
- É possível continuar escrevendo após cada imagem e inserir novos trechos antes ou entre os existentes.
- Inserção de imagens por colagem, arquivo ou arraste, com desfazer/refazer e remoção individual.
- Notas anteriores preservam texto, imagens, vínculo com aula, data e fixação; o formato contínuo é salvo ao editar.
- Editor carregado apenas ao abrir uma nota, mantendo a inicialização do app leve.
- Modais impedem a rolagem do aplicativo ao fundo, mantendo a rolagem no conteúdo aberto.
- Filtro por data junto à busca de notas, combinável com o texto pesquisado e com opção de limpar.

## 0.4.2

- Preferências organizadas em Aparência, Geral, Backup e Atualizações.
- Seleção visual de tema e correção das cores dos selects e opções no modo escuro.
- Temas personalizados prontos em rosa, azul, verde e roxo, com cores de texto e botões verificadas para leitura.
- Opção de fixar e desafixar notas, mantendo as fixadas no topo do caderno e das prévias.
- Imagens coladas próximas do texto, sem o espaço mínimo excessivo do editor.
- Botão de remover posicionado dentro da borda de cada imagem, inclusive nas menores.
- Janela compacta memoriza posição e tamanho, inclusive após reabrir o app, com recuperação quando um monitor é desconectado.
- Resumo de Meu dia unificado em blocos: aulas e descansos entram na quantidade concluída e na meta. O tempo de foco continua contando apenas estudo.

## 0.4.1

- Caderno de anotações ampliado, com busca, lista recolhível e editor preparado para textos longos.
- Nova anotação no cabeçalho; data e vínculo com aula disponíveis em Detalhes, sem ocupar o editor por padrão.
- Ícone próprio de caderno e prévia recolhível das últimas anotações nos planos.
- Exclusão pelo botão da nota, com confirmação separada e preservação das demais notas.
- Arraste de aulas no editor de plano restrito à alça da esquerda, permitindo selecionar texto normalmente nos campos.
- Regra do projeto para solicitar confirmação de encerramento do lote antes de commit, push ou Release e incrementar PATCH por padrão.
- Atualizações em segundo plano, sem repetir o assistente, com reinício automático; a instalação inicial continua guiada.
- Versão do aplicativo exibida discretamente abaixo da logo na sidebar.

## 0.4.0

- Instalador assistido em português com apresentação, escolha da pasta, confirmação e tela de sucesso com opção de abrir o aplicativo.
- Novos perfis seguem o tema do dispositivo; escolhas manuais são preservadas e o modo automático pode ser restaurado nas preferências.
- Primeiro uso sem planos pré-cadastrados: tutorial curto para criar um plano com Aula 1, Descanso e Aula 2.
- Alternância entre cards e lista em Planos de estudo, com a escolha salva.
- Ajuste da janela compacta para permanecer sobre as outras janelas no Windows.
- Preservação de planos, histórico, anotações e preferências existentes na atualização.

## 0.3.0

- Interface mais compacta por padrão, com opções Mínimo, Compacto e Confortável nas preferências.
- Remoção de textos motivacionais e descrições repetidas para mostrar mais aulas na tela.
- Edição individual de nome e duração das aulas e descansos pelo lápis na própria linha.
- Verificação de atualizações ao abrir, download após confirmação e instalação com preservação dos dados locais.
- Verificação SHA-256 do instalador baixado.
- Repositório público e link fixo para baixar o instalador da versão mais recente.

## 0.2.0

- Modo compacto de 340 × 112 px, com título e controles essenciais.
- Tema escuro em preto e cinzas neutros, efeito de vidro e alternância de tema.
- Ícone próprio e versão de abertura direta para evitar extração em cada inicialização.

## 0.1.0

- Planos de estudo com dias da semana, aulas, descansos, duplicação e reordenação.
- Cronômetro com pausa, conclusão automática e aviso sonoro.
- Caderno com imagens e rabiscos, métricas de estudo e backup local.
