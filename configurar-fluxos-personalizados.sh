#!/bin/bash

# Diretório do projeto
DIR="/home/lulu/imperial-midia/imperial-midia-teste/imperial-midia-api"
cd "$DIR" || { echo "Erro: Não foi possível acessar o diretório $DIR"; exit 1; }

echo "==== CONFIGURADOR DE FLUXOS PERSONALIZADOS ===="
echo ""
echo "O que você deseja fazer?"
echo "1. Desativar o fluxo de exemplo"
echo "2. Gerenciar seus fluxos personalizados"
echo "3. Diagnosticar problemas em um fluxo"
echo "4. Sair"
echo ""

read -p "Digite sua escolha (1-4): " choice

case "$choice" in
    1)
        echo "Desativando fluxo de exemplo..."
        npx ts-node src/deactivate-sample-flow.ts
        ;;
    2)
        echo "Gerenciando fluxos personalizados..."
        npx ts-node src/manage-flows.ts
        ;;
    3)
        echo "Diagnosticando fluxos..."
        npx ts-node src/diagnose-flow.ts
        ;;
    4)
        echo "Saindo..."
        exit 0
        ;;
    *)
        echo "Opção inválida!"
        ;;
esac

echo ""
echo "Operação concluída!" 