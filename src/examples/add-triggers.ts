import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';

async function addChatbotTriggers() {
  console.log('Iniciando a configuração de gatilhos para o chatbot...');

  try {
    // Criar uma instância do aplicativo Nest.js para acessar os serviços
    const app = await NestFactory.createApplicationContext(AppModule);

    // Obter os serviços necessários
    const whatsappService = app.get(WhatsappService);
    const prismaService = app.get(PrismaService);

    // Buscar o fluxo de atendimento automatizado
    const chatbotFlow = await prismaService.whatsappFlow.findFirst({
      where: {
        name: 'Atendimento Automatizado',
      },
    });

    if (!chatbotFlow) {
      console.error('Fluxo de Atendimento Automatizado não encontrado!');
      await app.close();
      return;
    }

    const flowId = chatbotFlow.id;
    console.log(`Fluxo de chatbot encontrado com ID: ${flowId}`);

    // Adicionar gatilhos de texto simples
    const keywordTriggers = ['iniciar', 'começar', 'atendimento', 'menu'];
    for (const keyword of keywordTriggers) {
      whatsappService.addFlowTrigger(keyword, flowId);
      console.log(`✅ Gatilho de texto adicionado: "${keyword}"`);
    }

    // Adicionar gatilho de regex para saudações comuns
    const regexPattern = 'ola|olá|oi|hello|hi|ajuda|help';
    whatsappService.addFlowTrigger(new RegExp(regexPattern, 'i'), flowId);
    console.log(`✅ Gatilho de regex adicionado: "${regexPattern}"`);

    console.log('Gatilhos configurados com sucesso!');
    console.log(
      `Total de gatilhos configurados: ${keywordTriggers.length + 1}`,
    );

    // Guardar os gatilhos no banco de dados para persistência
    for (const trigger of whatsappService.getFlowTriggers()) {
      console.log(
        `Gatilho registrado: ${typeof trigger.keyword === 'string' ? trigger.keyword : 'regex'} → Fluxo: ${trigger.flowId}`,
      );
    }

    // Fechar a aplicação
    await app.close();
    console.log('Configuração de gatilhos concluída!');
  } catch (error) {
    console.error('Erro ao configurar gatilhos:', error);
  }
}

// Executa a função se este arquivo for executado diretamente
if (require.main === module) {
  addChatbotTriggers()
    .then(() => console.log('Script finalizado.'))
    .catch((error) => console.error('Erro no script:', error));
}
