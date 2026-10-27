# Compasso

Aplicativo de estudos para Windows com planos por dia da semana, cronômetro de aulas e descansos, caderno com imagens e histórico de estudo. Funciona localmente, sem conta e sem servidor. Feito com JavaScript, React, Vite e Electron.

**[Baixar instalador para Windows · versão mais recente](https://github.com/leosalema213/app-estudos/releases/latest/download/Compasso-Instalar.exe)**

[Versões e novidades](https://github.com/leosalema213/app-estudos/releases) · [Código-fonte](https://github.com/leosalema213/app-estudos)

O link de download permanece o mesmo em todas as versões publicadas. A versão em trabalho está no `package.json`; o instalador da última Release é a versão distribuída.

![Compasso no modo compacto de espaçamento, com tema escuro](docs/interface.png)

## Abrir

Baixe e execute o instalador acima para adicionar o Compasso ao menu Iniciar e à área de trabalho. O aplicativo verifica novas versões ao abrir e pergunta antes de baixar ou instalar uma atualização. Também é possível verificar manualmente nas preferências. Seus planos, histórico e anotações são mantidos na atualização.

Para testar uma compilação local, abra `Abrir Compasso.lnk` ou `release/<versão>/win-unpacked/Compasso.exe`. Mantenha a pasta `win-unpacked` completa. O instalador gerado fica em `release/<versão>/Compasso-Instalar.exe`. Nenhuma dessas versões precisa de Node ou de um servidor para usar.

O instalador extrai o aplicativo apenas uma vez. O formato portátil opcional extrai o Electron numa pasta temporária a cada abertura e inicia mais lentamente. O motor do Electron representa a maior parte do tamanho em disco; o frontend é distribuído apenas no bundle, sem cópias extras de bibliotecas.

Para executar a partir do código:

```powershell
cd estudo-desktop
npm install
npm start
```

Para gerar a versão em pasta e o instalador:

```powershell
npm run dist
```

`npm run dev` abre somente o ambiente web de desenvolvimento. O modo compacto com janela flutuante requer o Electron (`npm start`). Depois de compilar, `npm run desktop` abre sem recompilar.

`npm run dist:portable` gera o formato portátil opcional. `npm run icon` renderiza o ícone a partir de `assets/icon.svg`, produzindo PNG e ICO com sete resoluções.

## O que você pode testar

- Três planos de exemplo editáveis: Desenvolvimento, Infraestrutura e Inglês.
- Criar, editar, duplicar e excluir planos; escolher dias da semana e cores.
- Adicionar aulas e descansos, renomear, ajustar duração e reordenar arrastando ou pelas setas.
- Ver o roteiro da data selecionada, filtrando planos pendentes, em progresso e concluídos.
- Iniciar ou pausar qualquer bloco. Existe apenas um cronômetro ativo de cada vez.
- Ao terminar, o bloco é marcado e um aviso visual, sonoro e uma notificação do Windows são emitidos. O próximo bloco sempre começa manualmente. A notificação nativa depende das permissões de notificações do Windows.
- Marcar e desmarcar conclusões manualmente, separadamente por dia.
- Editar o nome e a duração de cada aula ou descanso pelo lápis na própria linha, mantendo o tempo já estudado.
- Escolher três densidades nas preferências: **Mínimo**, **Compacto** (padrão) e **Confortável**. A escolha fica salva.
- Usar uma janela compacta de **340 × 112 px**, arrastável pelo título, redimensionável e sempre sobre as outras janelas. Expandir ou fechar esse modo retorna ao app e mantém o cronômetro.
- Alternar entre tema claro e escuro pelo sol/lua no cabeçalho ou nas preferências. O escuro usa preto e cinzas neutros, com vidro nativo Acrylic no Windows 11 22H2 ou superior e fundo sólido nos sistemas sem suporte. A preferência fica salva; dados anteriores são mantidos.
- Consultar horas reais de estudo, aulas concluídas e médias semanais e mensais. Descansos e pausas não contam como foco. Marcar uma aula manualmente não acrescenta horas.
- Usar um caderno por plano, com páginas datadas, vínculo opcional com a aula, texto, imagens, prints colados e rabiscos. Imagens PNG/JPG/WebP até 4 MB cada.
- Exportar e restaurar backup JSON, incluindo histórico e imagens.

## Persistência e comportamento do relógio

No Windows, os dados ficam em `%APPDATA%/compasso-estudos/compasso.json` (o Electron usa a pasta de dados do aplicativo). O arquivo é salvo automaticamente por substituição de um arquivo temporário. Durante uma sessão, o cronômetro atualiza a tela a cada segundo e grava um checkpoint a cada cinco segundos; pausar, editar planos ou trocar preferências salva imediatamente. Isso evita regravar cadernos e imagens a cada atualização visual. O fechamento normal também solicita uma gravação final. Sem sincronização e sem serviços externos.

Ao fechar e reabrir, o cronômetro fica pausado no último estado salvo; o tempo com o app fechado não conta. Minimizar ou usar o modo compacto mantém o timer ativo. O cálculo usa o relógio, evitando atraso acumulado dos intervalos. No Electron, o evento de suspensão do Windows pausa a sessão; ao voltar, retome manualmente. O tempo que atravessa meia-noite é distribuído entre as duas datas, e o check pertence ao dia em que o bloco começou.

Alterar um plano encerra o cronômetro dele, preservando o tempo já registrado. Excluir um plano remove seu caderno, mas conserva as horas no histórico. Duplicar cria uma sequência nova e um caderno vazio. Não há gravação ou reprodução de aulas em vídeo: o player é o cronômetro de estudo, para acompanhar o conteúdo que você abre em outra janela.

Na visualização web, a persistência usa o armazenamento do navegador, separado dos dados do aplicativo desktop. Exporte o backup para transportar os dados.

## Desenvolvimento e validação

```powershell
npm test
npm run build
npm run test:ui
```

Os testes de modelo verificam conclusão automática, pausa, troca de aulas, descansos, distribuição diária, marcação manual e backups. O teste de interface abre uma instância isolada do Electron com dados temporários e verifica os fluxos principais. As capturas ficam em `test-output/`.

Os testes também verificam edição individual, preferências de densidade, aviso de atualização, download e instalação somente após confirmação, além da rejeição de downloads corrompidos. Os testes de atualização simulam a execução do instalador; não instalam nada no computador.

## Publicar uma versão

1. Atualize a versão em `package.json` e `package-lock.json` com `npm version patch --no-git-tag-version` (ou `minor`).
2. Execute `npm test`, `npm run build` e `npm run test:ui`.
3. Gere os arquivos com `npm run dist` e `npm run checksums`.
4. Faça commit e envie para `origin/main`.
5. Execute `npm run release`.

O script usa a autenticação existente do Git, ou `GH_TOKEN`/`GITHUB_TOKEN` no ambiente. Credenciais não são gravadas em arquivos. Ele cria uma Release em rascunho, envia `Compasso-Instalar.exe` e o checksum e só então publica como a versão mais recente. O README continua apontando para o mesmo endereço de download. Executáveis, dependências, dados de teste, atalhos e arquivos `.env` ficam fora do Git.

## Atualizações no aplicativo

Ao abrir, o Compasso consulta a última Release pública de `leosalema213/app-estudos` sem bloquear a interface. Uma versão mais nova abre o aviso com as opções **Depois** e **Baixar atualização**. O download só começa após essa escolha. Quando termina, **Instalar e reiniciar** pausa o cronômetro, salva os dados e abre o instalador.

O instalador é baixado exclusivamente das Releases deste repositório. O tamanho e SHA-256 são conferidos antes de oferecer a instalação e novamente antes de executar o arquivo. Sem conexão, o app continua funcionando e permite tentar novamente nas preferências. Versões antigas (0.1 e 0.2) precisam ser atualizadas manualmente uma vez para receber esse recurso.
