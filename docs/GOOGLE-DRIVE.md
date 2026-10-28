# Google Drive — viabilidade e proposta

Avaliação em 28/10/2026. Esta é uma proposta técnica; nenhuma conta foi conectada, projeto Cloud criado ou integração implementada.

## Recomendação

Começar com **backup completo em uma pasta local sincronizada**. Hoje já é possível escolher essa pasta no diálogo Exportar backup. Uma evolução pequena poderia lembrar o destino e gerar cópias datadas automaticamente. O Organon continuaria com seu banco local em AppData e gravaria somente snapshots na pasta escolhida. Não colocar o `compasso.json` de trabalho diretamente numa pasta compartilhada entre máquinas.

Se a intenção for eliminar a dependência do Drive para computador e oferecer de fato **Conectar com Google Drive**, a conexão OAuth/API é viável como uma segunda etapa, com identidade Google Cloud do projeto Organon. Cada usuário final autorizaria a própria conta; não precisaria criar seu próprio projeto Cloud. Não é necessário um servidor próprio para o fluxo desktop, embora a publicação exija manutenção da identidade e das políticas do aplicativo.

| Aspecto | Pasta local sincronizada | OAuth/API no Organon |
| --- | --- | --- |
| Configuração | Usuário instala/conecta Drive para computador e escolhe a pasta | Responsável pelo Organon configura projeto Cloud, consentimento e cliente OAuth |
| Interface | “Escolher pasta de backup”; não implica login no Organon | “Conectar com Google Drive”, conta, destino, estado, desconectar |
| Envio | Organon confirma gravação local; Drive envia depois | Organon sabe se o upload terminou e pode verificar o arquivo remoto |
| Offline | Cópia local disponível conforme configuração do Drive | Banco local e fila persistida de snapshots; upload quando voltar a conexão |
| Tokens | Geridos pelo Drive para computador | Organon protege tokens e trata expiração/revogação |
| Complexidade | Baixa para exportação manual; moderada para agendamento/retenção | Maior: OAuth, uploads, erros, contas, pasta, recuperação e testes |
| Duas máquinas | Cópias separadas por dispositivo/data | Mesmo desenho inicial; mesclagem de edição simultânea é um projeto distinto |

O Google informa que espelhamento mantém os arquivos no computador e na nuvem; streaming usa cache e exige disponibilidade offline explícita para arquivos não baixados. Alterações e exclusões se propagam entre cópias. Por isso, sincronização sozinha não substitui versões independentes de backup. [Documentação oficial sobre espelhamento e streaming](https://support.google.com/drive/answer/13401938?hl=pt-BR).

## Organização dos arquivos

Proposta de pastas (ainda não criada):

```text
Organon/
  Backups/
    organon-2026-10-28-110000-PC.json
  Notas/
    notas-2026-10-28.html
  Cadernos/
    nome-id/
      pagina-id.html
      imagens/
```

**Backups** contém snapshots integrais restauráveis, incluindo planos, registros, lembretes/vistos, configurações e documentos com imagens. **Notas** e **Cadernos** seriam exportações opcionais para leitura/navegação: HTML preserva mais formatação do que Markdown e pode acompanhar imagens locais. Para leitura conveniente no navegador do Drive, PDF ou Google Docs podem ser avaliados depois; não se deve prometer que o Drive renderizará todo HTML como um site.

Arquivos separados ajudam a localizar e compartilhar conteúdo, mas não recompõem sozinhos as relações, histórico, datas vistas, preferências e sessão do timer. Dividir o único backup em centenas de arquivos exige manifesto, IDs, versão do formato, hashes e confirmação de que todos pertencem ao mesmo snapshot. Upload ou sincronização parcial deixa uma restauração incompleta. Recomendação: manter um JSON integral como fonte de restauração e gerar as cópias de leitura a partir dele; nunca importar silenciosamente edições nos arquivos de leitura.

A API permite criar pastas com `files.create`, MIME `application/vnd.google-apps.folder` e relacionar arquivos por IDs de pais. Guardar o ID do destino, sem depender de nomes únicos. [Pastas na API](https://developers.google.com/workspace/drive/api/guides/folder). A pasta especial `appDataFolder` é oculta e não navegável pelo usuário; por isso não atende ao desejo de ver Organon/Notas/Cadernos. [Pasta de dados do aplicativo](https://developers.google.com/workspace/drive/api/guides/appdata).

## Conexão direta: pré-requisitos e desenho

1. Definir responsável pelo projeto Google Cloud, habilitar Drive API, cadastrar marca, contato, público e escopos no Google Auth Platform e criar cliente **Desktop app**. Para uma conta pessoal, usar público externo; em testes, adicionar usuários permitidos. Preparar página de privacidade, identificação e verificações exigidas antes de distribuição pública. [Configuração do consentimento](https://developers.google.com/workspace/guides/configure-oauth-consent).
2. Autorizar pelo navegador padrão, com PKCE, `state` imprevisível e retorno loopback temporário em `127.0.0.1`. Fazer a troca de código e os pedidos de API no processo principal Electron. Aplicativos desktop são clientes públicos: um segredo distribuído no executável não pode ser tratado como confidencial. Pedir acesso offline para renovação sem novo login. [OAuth para desktop](https://developers.google.com/identity/protocols/oauth2/native-app).
3. Preferir `drive.file`, escopo não sensível que limita acesso a arquivos criados/abertos ou compartilhados com o app. Criar Organon é o caminho inicial mais simples. Escolher pasta existente exige seleção/autorização explícita; não equivale a listar todo o Drive. Google recomenda Picker em conjunto com `drive.file`; integrar o Picker ao fluxo desktop requer desenhar a superfície web e suas credenciais/origens, sem pedir acesso irrestrito só para contornar isso. `drive` completo é restrito e aumenta os requisitos de verificação; a classificação não sensível ainda prevê verificação básica aplicável. [Escopos oficiais](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
4. Manter access token em memória e refresh token criptografado fora do `compasso.json`, via API assíncrona `safeStorage` quando disponível e com falha explícita se a proteção não estiver disponível. No Windows ela utiliza DPAPI; não protege contra todos os programas executados na mesma conta. Não incluir tokens em backup, logs ou renderer. “Desconectar” remove os tokens locais e oferece revogação; não apaga os backups remotos automaticamente. [safeStorage do Electron](https://www.electronjs.org/docs/latest/api/safe-storage).
5. Tratar conexão revogada/expirada com “Reconectar”, preservando os dados locais. No modo externo **Testing**, refresh tokens com escopo Drive expiram em sete dias; esse modo não é adequado como configuração definitiva. [Expiração de tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

## Offline, concorrência e recuperação

Estas são decisões de arquitetura propostas, não capacidades já implementadas. Criar snapshot consistente local, atribuir ID/data/dispositivo e hash, enfileirar e enviar. Para arquivos grandes ou rede instável, usar upload retomável, recomendado pelo Google acima de 5 MB; manter tentativa com recuo e variação aleatória, evitando reenviar a cada segundo do timer. [Uploads retomáveis](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

Só mostrar “Backup no Drive concluído” depois da confirmação remota; diferenciar de “salvo no computador” e “aguardando conexão”. Exibir último sucesso, tamanho e erro acionável. Na pasta local, o Organon só pode atestar gravação no disco, pois a confirmação de upload pertence ao cliente Drive.

Para vários computadores, nomes/IDs de snapshot independentes evitam sobrescrita do mesmo arquivo. Restauração sempre explícita, com data, dispositivo, contagens e confirmação. Mesclar automaticamente edições offline exigiria revisão por entidade, tombstones de exclusão e resolução de conflito; o estado atual não tem esse protocolo. Na primeira versão, restaurar um snapshot completo é mais previsível.

Testar queda durante upload, retry sem duplicação, token revogado, pasta removida/permissão perdida, conta trocada, armazenamento cheio, backup grande, versão incompatível, corrupção e restauração depois de reinstalar. Reautenticar na nova instalação: os tokens são credenciais locais, não conteúdo restaurável.

## Custos, limites e decisão pendente

A documentação atual mudou cotas em maio de 2026 e distingue projetos antigos. Para novos projetos lista 1.000.000 unidades/minuto/projeto e 325.000/minuto/usuário/projeto; operações têm pesos diferentes. Há limites diários e limiar diário de 400 milhões de unidades, sem cobrança extra abaixo dele; detalhes de faturamento adicionais serão anunciados pelo Google. Não presumir API ilimitada ou gratuita para qualquer volume. Conferir as cotas reais do projeto antes de distribuir. Armazenamento ocupado pelos backups também precisa caber na conta do usuário. [Limites e faturamento atuais](https://developers.google.com/workspace/drive/api/guides/limits).

Para avançar, falta escolher: pasta sincronizada ou conexão direta; backup manual ou automático; frequência/retenção; e se as cópias navegáveis fazem parte da primeira entrega. Para OAuth, também definir quem administra o projeto Cloud e sua identidade pública. Recomendo primeira entrega com pasta escolhida, snapshots datados e retenção conservadora; depois OAuth com criação da pasta Organon e, por último, exportações de leitura. Nada externo foi configurado nesta avaliação.
