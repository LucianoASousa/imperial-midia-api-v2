import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Importar o fluxo de exemplo
const sampleFlowPath = path.join(__dirname, 'sample-chatbot-flow.json');
const sampleFlow = JSON.parse(fs.readFileSync(sampleFlowPath, 'utf8'));

async function setupChatbot() {
  try {
    console.log('Iniciando a configuração do chatbot...');

    // Conectar ao Prisma
    const prisma = new PrismaClient();

    // Verificar se o fluxo já existe
    const existingFlow = await prisma.whatsappFlow.findFirst({
      where: {
        name: sampleFlow.name,
      },
    });

    if (existingFlow) {
      console.log(`Fluxo "${sampleFlow.name}" já existe. Atualizando...`);
      // Excluir o fluxo existente para recriar
      await prisma.whatsappFlow.delete({
        where: {
          id: existingFlow.id,
        },
      });
    }

    // Criar o fluxo no banco de dados
    console.log(`Criando fluxo "${sampleFlow.name}"...`);
    const flow = await prisma.whatsappFlow.create({
      data: {
        name: sampleFlow.name,
        description: sampleFlow.description,
        active: true,
        instanceName: 'default', // usar a instância padrão
      },
    });

    // Criar os nós
    console.log(`Criando ${sampleFlow.nodes.length} nós...`);
    for (const node of sampleFlow.nodes) {
      await prisma.flowNode.create({
        data: {
          id: node.id,
          type: node.type,
          position: {
            x: node.position.x,
            y: node.position.y,
          },
          data: node.data,
          flowId: flow.id,
        },
      });
    }

    // Criar as arestas
    console.log(`Criando ${sampleFlow.edges.length} conexões...`);
    for (const edge of sampleFlow.edges) {
      await prisma.flowEdge.create({
        data: {
          id: edge.id,
          sourceId: edge.source,
          targetId: edge.target,
          flowId: flow.id,
        },
      });
    }

    console.log('Fluxo de chatbot configurado com sucesso!');
    console.log('ID do fluxo:', flow.id);
    console.log('');
    console.log('Para adicionar um gatilho para este fluxo, você pode usar:');
    console.log('- Gatilho de texto simples: /whatsapp/trigger/add');
    console.log(
      '  Corpo: { "keyword": "iniciar", "flowId": "' + flow.id + '" }',
    );
    console.log('');
    console.log('- Gatilho de regex: /whatsapp/trigger/add');
    console.log(
      '  Corpo: { "keyword": "ola|oi|ajuda|help", "flowId": "' +
        flow.id +
        '", "isRegex": true }',
    );
    console.log('');
    console.log('Ou pelo endpoint mais recente: /whatsapp/triggers');
    console.log(
      '  Corpo: { "instanceName": "default", "type": "keyword", "value": "iniciar", "flowId": "' +
        flow.id +
        '" }',
    );
    console.log('');

    // Desconectar do Prisma
    await prisma.$disconnect();
  } catch (error) {
    console.error('Erro ao configurar o chatbot:', error);
  }
}

// Executar a função
setupChatbot();
