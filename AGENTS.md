# Regras do projeto

## Edições

Prefira alterações incrementais e localizadas. Preserve a estrutura dos arquivos e mantenha o diff pequeno. Não reescreva arquivos inteiros nem use delete + recreate, salvo necessidade estrutural real.

## Encerramento de um lote e publicação

- Implemente e valide todos os pedidos do lote, incluindo mensagens adicionais recebidas durante o trabalho.
- Antes de fazer commit, push, criar tag ou publicar uma Release, pergunte ao usuário se ele terminou de enviar os ajustes e se autoriza o commit e a publicação.
- Espere uma confirmação explícita. Pedidos anteriores de publicação não substituem a confirmação de encerramento do lote atual. Não considere silêncio ou tempo decorrido como autorização.
- Enquanto aguarda, pode deixar código, testes, preview e instalador local prontos para revisão, sem publicar.
- Depois da confirmação, publique somente o lote aprovado. Se chegar outro pedido antes da publicação, incorpore-o, valide e confirme novamente o encerramento.

## Versões

- Use três números: `MAJOR.MINOR.PATCH`.
- Por padrão, cada lote de ajustes ou correções incrementa apenas PATCH: `0.4.0` → `0.4.1` → `0.4.2`.
- Só incremente MINOR ou MAJOR se o usuário pedir explicitamente.
- Atualize `package.json`, `package-lock.json` e `CHANGELOG.md` de forma consistente.
- Use a última versão publicada como base; por exemplo, após `0.4.0`, o lote seguinte é `0.4.1`.

## Dados existentes

Preserve planos, anotações, imagens, histórico e preferências do usuário ao atualizar a aplicação. Não reinicialize dados pessoais para demonstrar mudanças de interface.
