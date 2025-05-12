# Gerenciamento de Fluxos do WhatsApp

Este documento explica como gerenciar os fluxos de conversação do WhatsApp no sistema Imperial Mídia.

## Utilizando seus próprios fluxos

Por padrão, o sistema vem com um fluxo de exemplo chamado "Atendimento Automatizado". Para utilizar
apenas os seus próprios fluxos, siga os passos abaixo:

### 1. Desativar o fluxo de exemplo

Execute o script:

```bash
cd /home/lulu/imperial-midia/imperial-midia-teste/imperial-midia-api
npx ts-node src/deactivate-sample-flow.ts
```

Este script irá desativar todos os fluxos de exemplo, permitindo que apenas os fluxos criados por você sejam utilizados.

### 2. Gerenciar seus fluxos

Para ver, ativar ou desativar seus fluxos, execute o script:

```bash
cd /home/lulu/imperial-midia/imperial-midia-teste/imperial-midia-api
npx ts-node src/manage-flows.ts
```

Este script irá:

1. Listar todos os fluxos disponíveis no sistema
2. Permitir que você escolha qual fluxo ativar
3. Desativar automaticamente os demais fluxos

## Criando novos fluxos

Para criar novos fluxos, utilize a interface web do sistema Imperial Mídia. Acesse o menu de fluxos e crie um novo fluxo com:

1. Nós de início (start)
2. Nós de mensagem
3. Nós condicionais
4. Conexões entre os nós

Após criar um fluxo, lembre-se de:

1. Salvar o fluxo
2. Ativar o fluxo usando o script `manage-flows.ts` mencionado acima

## Configurando gatilhos

Para que seus fluxos sejam acionados por mensagens específicas, configure gatilhos através da interface web ou da API:

1. Gatilhos simples: para palavras específicas como "iniciar", "ajuda", etc.
2. Gatilhos regex: para padrões como "ol[aá]", "oi|hello", etc.

Os gatilhos podem ser configurados pela API REST:

```
POST /whatsapp/triggers
Body: {
  "instanceName": "default",
  "type": "keyword",
  "value": "iniciar",
  "flowId": "seu-id-de-fluxo-aqui"
}
```

## Comportamento padrão

Quando não há gatilhos específicos correspondentes a uma mensagem:

1. O sistema vai utilizar o fluxo ativo mais recente (com preferência para fluxos criados por você)
2. Se não houver nenhum fluxo ativo, o sistema responderá com uma mensagem padrão

## Solucionando problemas

Se você encontrar problemas com seus fluxos, como:

- Respostas sendo tratadas como "fora do contexto esperado"
- Fluxos não prosseguindo corretamente
- Opções de lista não funcionando como esperado

Você pode usar a ferramenta de diagnóstico incluída:

```bash
cd /home/lulu/imperial-midia/imperial-midia-teste/imperial-midia-api
npx ts-node src/diagnose-flow.ts
```

Ou execute o script configurador e escolha a opção 3:

```bash
./configurar-fluxos-personalizados.sh
```

### Problemas comuns e soluções:

1. **Erro "Resposta fora do contexto esperado"**:

   - Certifique-se de que as opções do seu nó de lista estão corretamente conectadas
   - Verifique se você está usando os mesmos IDs nas conexões e nas opções
   - Ative apenas um fluxo por vez usando o gerenciador de fluxos

2. **Fluxo não avança para próximo nó**:

   - Verifique se todas as conexões estão corretamente configuradas
   - Use a ferramenta de diagnóstico para identificar conexões faltantes

3. **Mensagem não ativa o fluxo correto**:
   - Configure gatilhos específicos para seu fluxo através da API
   - Certifique-se de que o fluxo está ativo
