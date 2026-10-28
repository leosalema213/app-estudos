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

## Para as próximas alterações

Ao criar novos campos, registrar formato/defaults, compatibilidade de leitura, transporte no backup e snapshot e testes relevantes. Preparar SQL apenas se houver alteração real da estrutura relacional/RPC/permissões. Aplicação de migrations e testes de isolamento no servidor ficam explicitamente pendentes até retomar a integração. Não enviar dados pessoais como fixture de teste.
