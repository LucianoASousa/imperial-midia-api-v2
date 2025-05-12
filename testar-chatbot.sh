#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="http://localhost:3000"
TELEFONE="+5511999999999"  # Substitua pelo seu número de telefone de teste

echo -e "${YELLOW}=== Testando o Chatbot Imperial Mídia ===${NC}"
echo -e "${BLUE}API: ${API_URL}${NC}"
echo -e "${BLUE}Telefone de teste: ${TELEFONE}${NC}"
echo ""

# Função para enviar mensagem
enviar_mensagem() {
    local mensagem=$1
    echo -e "${YELLOW}Enviando mensagem:${NC} ${mensagem}"
    
    curl -s -X POST "${API_URL}/whatsapp/incoming-message" \
        -H "Content-Type: application/json" \
        -d "{\"from\": \"${TELEFONE}\", \"message\": \"${mensagem}\"}" | jq .
    
    echo ""
    echo -e "${GREEN}Aguardando 2 segundos...${NC}"
    sleep 2
}

# Perguntar ao usuário qual tipo de teste deseja executar
echo -e "${YELLOW}Escolha o tipo de teste:${NC}"
echo "1) Teste completo do fluxo"
echo "2) Testar gatilhos de regex (oi, olá, ajuda)"
echo "3) Testar respostas fora de contexto"
echo "4) Testar fluxo de vendas"
echo "5) Sair"
read -p "Opção: " OPCAO

case $OPCAO in
    1)
        # Testar iniciar o chatbot
        echo -e "${YELLOW}Teste 1: Iniciando o chatbot${NC}"
        enviar_mensagem "iniciar"

        # Testar menu de opções
        echo -e "${YELLOW}Teste 2: Selecionando opção do menu${NC}"
        enviar_mensagem "informações"

        # Testar resposta fora do contexto
        echo -e "${YELLOW}Teste 3: Enviando resposta fora do contexto${NC}"
        enviar_mensagem "preço"

        # Testar continuar fluxo
        echo -e "${YELLOW}Teste 4: Decidindo continuar o fluxo${NC}"
        enviar_mensagem "não"

        # Testar retorno ao menu
        echo -e "${YELLOW}Teste 5: Voltando ao menu principal${NC}"
        enviar_mensagem "voltar"

        # Testar opção de suporte
        echo -e "${YELLOW}Teste 6: Selecionando opção de suporte${NC}"
        enviar_mensagem "suporte"

        # Enviar descrição de problema
        echo -e "${YELLOW}Teste 7: Enviando descrição de problema${NC}"
        enviar_mensagem "Estou tendo problemas para configurar o chatbot"

        # Finalizar teste
        echo -e "${YELLOW}Teste 8: Finalizando atendimento${NC}"
        enviar_mensagem "não"
        ;;
    2)
        # Testar gatilhos de regex
        echo -e "${YELLOW}Testando gatilho 'oi'${NC}"
        enviar_mensagem "oi"
        
        # Resetar o chat para testar outro gatilho
        echo -e "${RED}Resetando chat...${NC}"
        sleep 3
        
        echo -e "${YELLOW}Testando gatilho 'olá'${NC}"
        enviar_mensagem "olá"
        
        # Resetar o chat para testar outro gatilho
        echo -e "${RED}Resetando chat...${NC}"
        sleep 3
        
        echo -e "${YELLOW}Testando gatilho 'ajuda'${NC}"
        enviar_mensagem "ajuda"
        ;;
    3)
        # Testar respostas fora de contexto
        echo -e "${YELLOW}Iniciando o chatbot${NC}"
        enviar_mensagem "iniciar"
        
        echo -e "${YELLOW}Enviando resposta fora de contexto${NC}"
        enviar_mensagem "isso é um teste fora de contexto"
        
        echo -e "${YELLOW}Decidindo encerrar o fluxo${NC}"
        enviar_mensagem "sim"
        
        # Reiniciar o chatbot
        echo -e "${YELLOW}Reiniciando o chatbot${NC}"
        enviar_mensagem "iniciar"
        
        echo -e "${YELLOW}Enviando resposta fora de contexto novamente${NC}"
        enviar_mensagem "outro teste fora de contexto"
        
        echo -e "${YELLOW}Decidindo continuar o fluxo${NC}"
        enviar_mensagem "não"
        ;;
    4)
        # Testar fluxo de vendas
        echo -e "${YELLOW}Iniciando o chatbot${NC}"
        enviar_mensagem "iniciar"
        
        echo -e "${YELLOW}Selecionando opção de vendas${NC}"
        enviar_mensagem "vendas"
        
        echo -e "${YELLOW}Selecionando serviço de chatbot${NC}"
        enviar_mensagem "chatbot"
        
        echo -e "${YELLOW}Fornecendo informações de contato${NC}"
        enviar_mensagem "Maria Silva, maria@exemplo.com"
        
        echo -e "${YELLOW}Finalizando atendimento${NC}"
        enviar_mensagem "não"
        ;;
    5|*)
        echo -e "${RED}Saindo...${NC}"
        exit 0
        ;;
esac

echo -e "${GREEN}Testes concluídos!${NC}" 