#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Iniciando configuração do Imperial Midia Chatbot ===${NC}"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js não está instalado. Por favor, instale o Node.js para continuar.${NC}"
    exit 1
fi

# Verificar se o Yarn está instalado
if ! command -v yarn &> /dev/null; then
    echo -e "${YELLOW}Yarn não está instalado. Tentando usar npm...${NC}"
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Nem Yarn nem npm estão instalados. Por favor, instale um gerenciador de pacotes para continuar.${NC}"
        exit 1
    fi
    USE_NPM=true
else
    USE_NPM=false
fi

echo -e "${GREEN}Instalando dependências...${NC}"
if [ "$USE_NPM" = true ]; then
    npm install
else
    yarn install
fi

# Verificar se o banco de dados está configurado
echo -e "${GREEN}Configurando o banco de dados...${NC}"
if [ "$USE_NPM" = true ]; then
    npx prisma migrate dev --name chatbot-setup
else
    yarn prisma migrate dev --name chatbot-setup
fi

# Compilar o TypeScript
echo -e "${GREEN}Compilando o código...${NC}"
if [ "$USE_NPM" = true ]; then
    npm run build
else
    yarn build
fi

# Criar diretório para exemplos se não existir
mkdir -p dist/examples

# Copiar o arquivo de fluxo de exemplo para a pasta dist
echo -e "${GREEN}Copiando arquivos de exemplo...${NC}"
cp src/examples/sample-chatbot-flow.json dist/examples/

# Executar o script de configuração do chatbot
echo -e "${GREEN}Configurando o chatbot...${NC}"
node dist/examples/setup-chatbot.js

# Executar o script de adição de gatilhos
echo -e "${GREEN}Adicionando gatilhos para o chatbot...${NC}"
node dist/examples/add-triggers.js

# Iniciar o servidor
echo -e "${GREEN}Iniciando o servidor...${NC}"
if [ "$USE_NPM" = true ]; then
    npm run start
else
    yarn start
fi 