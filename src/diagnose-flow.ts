import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Função para listar todos os fluxos
async function listFlows() {
  try {
    const flows = await prisma.whatsappFlow.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (flows.length === 0) {
      console.log('Nenhum fluxo encontrado no sistema.');
      return [];
    }

    console.log('\n=== FLUXOS DISPONÍVEIS ===');
    console.log('ID | Nome | Status | Data de Criação');
    console.log('-----------------------------------');

    flows.forEach((flow, index) => {
      const status = flow.active ? 'ATIVO' : 'INATIVO';
      const createdAt = flow.createdAt.toLocaleDateString('pt-BR');
      console.log(
        `${index + 1}. ${flow.id} | ${flow.name} | ${status} | ${createdAt}`,
      );
    });

    return flows;
  } catch (error) {
    console.error('Erro ao listar fluxos:', error);
    return [];
  }
}

// Função para diagnosticar um fluxo específico
async function diagnoseFlow(flowId: string) {
  try {
    console.log(`\nDiagnosticando fluxo ID: ${flowId}...`);

    // Buscar o fluxo completo
    const flow = await prisma.whatsappFlow.findUnique({
      where: { id: flowId },
      include: {
        nodes: true,
        edges: true,
      },
    });

    if (!flow) {
      console.log(`Erro: Fluxo ID ${flowId} não encontrado.`);
      return;
    }

    console.log(`\nInformações do Fluxo "${flow.name}":`);
    console.log(`- Status: ${flow.active ? 'Ativo' : 'Inativo'}`);
    console.log(
      `- Data de criação: ${flow.createdAt.toLocaleDateString('pt-BR')}`,
    );
    console.log(`- Instância: ${flow.instanceName || 'Default'}`);
    console.log(`- Número de nós: ${flow.nodes.length}`);
    console.log(`- Número de conexões: ${flow.edges.length}`);

    // Verificar nó inicial
    const startNode = flow.nodes.find((node) => node.type === 'start');
    if (!startNode) {
      console.log('\n❌ ERRO: Nó inicial (tipo "start") não encontrado!');
      console.log('   O fluxo deve ter exatamente um nó do tipo "start".');
    } else {
      console.log(`\n✅ Nó inicial encontrado: ID ${startNode.id}`);

      // Verificar se há conexões saindo do nó inicial
      const startNodeConnections = flow.edges.filter(
        (edge) => edge.sourceId === startNode.id,
      );
      if (startNodeConnections.length === 0) {
        console.log('❌ ERRO: Nó inicial não possui conexões de saída!');
      } else {
        console.log(
          `✅ Nó inicial possui ${startNodeConnections.length} conexão(ões) de saída.`,
        );
      }
    }

    // Verificar nós de lista
    const listNodes = flow.nodes.filter((node) => node.type === 'list');
    console.log(`\nNós de lista encontrados: ${listNodes.length}`);

    if (listNodes.length > 0) {
      for (const listNode of listNodes) {
        console.log(`\nAnalisando nó de lista: ${listNode.id}`);

        // Obter opções da lista
        const options = listNode.data?.options || [];
        console.log(`- Opções configuradas: ${options.length}`);

        // Verificar conexões para cada opção
        options.forEach((option) => {
          console.log(`  - Opção "${option.text}" (ID: ${option.id})`);

          // Verificar se há uma conexão usando o handle da opção
          const optionConnection = flow.edges.find(
            (edge) =>
              edge.sourceId === listNode.id && edge.sourceHandle === option.id,
          );

          if (optionConnection) {
            console.log(
              `    ✅ Conexão encontrada para esta opção (target: ${optionConnection.targetId})`,
            );
          } else {
            console.log(
              `    ❌ AVISO: Nenhuma conexão encontrada para esta opção!`,
            );
          }
        });
      }
    }

    // Verificar nós sem conexões de saída (exceto os nós finais)
    const nodesWithoutOutgoingConnections = flow.nodes.filter((node) => {
      if (node.type === 'end') return false; // Ignorar nós finais

      const outgoingConnections = flow.edges.filter(
        (edge) => edge.sourceId === node.id,
      );
      return outgoingConnections.length === 0;
    });

    if (nodesWithoutOutgoingConnections.length > 0) {
      console.log(
        '\n⚠️ AVISO: Encontrados nós sem conexões de saída (becos sem saída):',
      );
      nodesWithoutOutgoingConnections.forEach((node) => {
        console.log(`  - Nó ID ${node.id} (tipo: ${node.type})`);
      });
    } else {
      console.log(
        '\n✅ Todos os nós possuem conexões de saída ou são nós finais.',
      );
    }

    // Verificar nós sem conexões de entrada (exceto o nó inicial)
    const nodesWithoutIncomingConnections = flow.nodes.filter((node) => {
      if (node.type === 'start') return false; // Ignorar nó inicial

      const incomingConnections = flow.edges.filter(
        (edge) => edge.targetId === node.id,
      );
      return incomingConnections.length === 0;
    });

    if (nodesWithoutIncomingConnections.length > 0) {
      console.log(
        '\n⚠️ AVISO: Encontrados nós sem conexões de entrada (nós inalcançáveis):',
      );
      nodesWithoutIncomingConnections.forEach((node) => {
        console.log(`  - Nó ID ${node.id} (tipo: ${node.type})`);
      });
    } else {
      console.log(
        '\n✅ Todos os nós possuem conexões de entrada ou são o nó inicial.',
      );
    }

    // Verificar gatilhos configurados para o fluxo
    const triggers = await prisma.whatsappTrigger.findMany({
      where: { flowId },
    });

    console.log(`\nGatilhos configurados para este fluxo: ${triggers.length}`);
    if (triggers.length === 0) {
      console.log('⚠️ AVISO: Este fluxo não possui gatilhos configurados.');
      console.log(
        '   Sem gatilhos, o fluxo não será ativado por mensagens específicas.',
      );
    } else {
      triggers.forEach((trigger) => {
        console.log(`  - Tipo: ${trigger.type}, Valor: "${trigger.value}"`);
      });
    }
  } catch (error) {
    console.error('Erro ao diagnosticar fluxo:', error);
  }
}

// Função principal
async function main() {
  try {
    console.log('=== DIAGNÓSTICO DE FLUXOS IMPERIAL MIDIA ===');
    const flows = await listFlows();

    if (flows.length === 0) {
      console.log('Crie um fluxo na interface antes de continuar.');
      await prisma.$disconnect();
      rl.close();
      return;
    }

    rl.question(
      '\nDigite o número do fluxo que deseja diagnosticar (ou 0 para sair): ',
      async (answer) => {
        const choice = parseInt(answer);

        if (choice === 0 || isNaN(choice)) {
          console.log('Operação cancelada.');
        } else if (choice > 0 && choice <= flows.length) {
          const selectedFlow = flows[choice - 1];
          await diagnoseFlow(selectedFlow.id);
        } else {
          console.log('Opção inválida!');
        }

        await prisma.$disconnect();
        rl.close();
      },
    );
  } catch (error) {
    console.error('Erro no diagnóstico de fluxos:', error);
    await prisma.$disconnect();
    rl.close();
  }
}

// Executar a função principal
main();
