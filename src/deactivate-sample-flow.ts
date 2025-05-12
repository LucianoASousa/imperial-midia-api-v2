import { PrismaClient } from '@prisma/client';

async function deactivateSampleFlow() {
  try {
    console.log('Iniciando a desativação do fluxo de exemplo...');

    // Conectar ao Prisma
    const prisma = new PrismaClient();

    // Buscar todos os fluxos com o nome 'Atendimento Automatizado'
    const sampleFlows = await prisma.whatsappFlow.findMany({
      where: {
        name: 'Atendimento Automatizado',
      },
    });

    if (sampleFlows.length === 0) {
      console.log('Nenhum fluxo de exemplo encontrado.');
      await prisma.$disconnect();
      return;
    }

    // Desativar todos os fluxos de exemplo encontrados
    for (const flow of sampleFlows) {
      await prisma.whatsappFlow.update({
        where: {
          id: flow.id,
        },
        data: {
          active: false,
        },
      });
      console.log(
        `Fluxo de exemplo "${flow.name}" (ID: ${flow.id}) desativado com sucesso.`,
      );
    }

    console.log('\nTodos os fluxos de exemplo foram desativados.');
    console.log('Agora somente os fluxos criados por você serão utilizados.');

    // Desconectar do Prisma
    await prisma.$disconnect();
  } catch (error) {
    console.error('Erro ao desativar o fluxo de exemplo:', error);
  }
}

// Executar a função
deactivateSampleFlow();
