# Regras do projeto

## Edições

Prefira alterações incrementais e localizadas. Preserve a estrutura dos arquivos e mantenha o diff pequeno. Não reescreva arquivos inteiros nem use delete + recreate, salvo necessidade estrutural real.

## Testes e validação com o usuário

- Por preferência explícita do usuário, a execução dos testes fica, por padrão, no terminal dele. Não rode automaticamente suítes completas, integrações/E2E ou verificações amplas de cores e aparência.
- Quando houver testes a fazer, avise e forneça um único comando copiável para PowerShell, focado no que mudou, explicando brevemente o que ele verifica. Use caminhos absolutos para funcionar mesmo quando o terminal estiver em `C:\WINDOWS\system32`, sem exigir que o usuário troque de pasta. O usuário executa e envia o resumo do resultado ou o erro; não peça logs completos de execuções bem-sucedidas.
- O usuário pode rodar os testes em paralelo ao trabalho independente do agente. Não fique consultando ou aguardando repetidamente a execução; retome a análise quando o retorno chegar. Não trate ausência de retorno como aprovação nem declare testes pendentes como aprovados.
- O agente pode executar somente verificações essenciais e focadas que dependam de sua inspeção direta, por exemplo reproduzir um erro específico ou conferir uma imagem. Avise antes e explique a necessidade. Se depender de imagem, captura ou configuração adicional, combine o procedimento com o usuário primeiro.
- Reaproveite resultados válidos já obtidos. Não repita testes nem amplie a suíte sem mudança relevante, falha ou dúvida concreta que justifique. Uma alteração apenas documental destas regras não exige nova execução.

## Encerramento de um lote e publicação

- Implemente e valide todos os pedidos do lote, incluindo mensagens adicionais recebidas durante o trabalho.
- Antes de fazer commit, push, criar tag ou publicar uma Release, pergunte ao usuário se ele terminou de enviar os ajustes e se autoriza o commit e a publicação.
- Espere uma confirmação explícita. Pedidos anteriores de publicação não substituem a confirmação de encerramento do lote atual. Não considere silêncio ou tempo decorrido como autorização.
- Enquanto aguarda, pode deixar código, testes, preview e instalador local prontos para revisão, sem publicar.
- Depois da confirmação, publique somente o lote aprovado. Se chegar outro pedido antes da publicação, incorpore-o, valide e confirme novamente o encerramento.

## Versões

- Use três números: `MAJOR.MINOR.PATCH`.
- PATCH vai de 0 a 9. Incremente PATCH normalmente; depois de 9, incremente MINOR e volte PATCH para zero: `0.4.8` → `0.4.9` → `0.5.0`; `0.5.9` → `0.6.0`. Essa virada foi autorizada explicitamente pelo usuário e não exige novo pedido de MINOR.
- MAJOR só muda por pedido explícito. Escreva `0.5.0`, nunca apenas `0.5` nos arquivos e Releases.
- Atualize `package.json`, `package-lock.json` e `CHANGELOG.md` de forma consistente.
- Use a última versão publicada como base. A `0.4.10` é uma versão legada já distribuída: mantenha seu histórico e publique `0.5.0` para superá-la, sem renomear tags antigas.
- Todo instalador de teste entregue ao usuário deve ter versão distinta da final: por exemplo, `0.5.1-preview.1`, `0.5.1-preview.2` e depois `0.5.1`. Nunca entregue um preview identificado apenas com o número estável, nem reutilize o identificador de um preview já entregue.
- Use `npm run version:preview` para iniciar/avançar previews e `npm run version:final` para promover o preview à versão estável de destino. Os comandos atualizam as duas versões do pacote e o cabeçalho do changelog; não fazem commit nem publicação. Não use `npm version patch` para contornar a virada após 9.
- Previews não entram no canal de atualização de produção. O atualizador deve oferecer a final para um preview com a mesma base, e o publicador deve recusar versões com sufixo preview. Não disponibilize o instalador final para teste antes da publicação; entregue um preview identificado ou aguarde a Release.

## Dados existentes

Preserve planos, anotações, imagens, histórico e preferências do usuário ao atualizar a aplicação. Não reinicialize dados pessoais para demonstrar mudanças de interface.

## Evolução dos dados e Supabase pendente

- A integração remota com Supabase está pendente por falha de provisionamento; consulte `docs/SUPABASE.md`. Continue as funcionalidades locais e os testes offline sem depender do servidor.
- Ao adicionar ou alterar dados persistidos, prepare a migração/defaults para perfis e backups antigos e confira exportação/importação e o payload de sincronização. Registre o contrato em `docs/DADOS-E-MIGRACOES.md`.
- Se a alteração exigir DDL no Supabase, prepare o SQL correspondente no repositório e registre a aplicação remota como pendente. Não apresente testes com serviço simulado como validação do servidor real.
- Campos opcionais dentro do snapshot JSONB podem dispensar mudança de tabela; documente essa decisão em vez de criar uma migration vazia. Preserve os identificadores legados de dados e instalação.
