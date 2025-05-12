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

// Função para ativar um fluxo específico
async function activateFlow(flowId: string) {
  try {
    // Primeiro, desativa todos os fluxos
    await prisma.whatsappFlow.updateMany({
      data: {
        active: false,
      },
    });

    // Depois, ativa apenas o fluxo selecionado
    await prisma.whatsappFlow.update({
      where: {
        id: flowId,
      },
      data: {
        active: true,
      },
    });

    console.log(`\nFluxo ID: ${flowId} ativado com sucesso!`);
    console.log('Todos os outros fluxos foram desativados.');
  } catch (error) {
    console.error('Erro ao ativar fluxo:', error);
  }
}

// Função principal
async function main() {
  try {
    console.log('=== GERENCIADOR DE FLUXOS IMPERIAL MIDIA ===');
    const flows = await listFlows();

    if (flows.length === 0) {
      console.log('Crie um fluxo na interface antes de continuar.');
      await prisma.$disconnect();
      rl.close();
      return;
    }

    rl.question(
      '\nDigite o número do fluxo que deseja ativar (ou 0 para sair): ',
      async (answer) => {
        const choice = parseInt(answer);

        if (choice === 0 || isNaN(choice)) {
          console.log('Operação cancelada.');
        } else if (choice > 0 && choice <= flows.length) {
          const selectedFlow = flows[choice - 1];
          await activateFlow(selectedFlow.id);
        } else {
          console.log('Opção inválida!');
        }

        await prisma.$disconnect();
        rl.close();
      },
    );
  } catch (error) {
    console.error('Erro no gerenciador de fluxos:', error);
    await prisma.$disconnect();
    rl.close();
  }
}

// Executar a função principal
main();
