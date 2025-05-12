#!/bin/bash

# Diretório do projeto
DIR="/home/lulu/imperial-midia/imperial-midia-teste/imperial-midia-api"
cd "$DIR" || { echo "Erro: Não foi possível acessar o diretório $DIR"; exit 1; }

echo "==== REINICIANDO SERVIÇO IMPERIAL MIDIA API ===="
echo ""
echo "Parando serviços existentes..."

# Encontrar e encerrar processos existentes
echo "Procurando processos npm ou node existentes..."
PIDs=$(ps aux | grep '[n]ode.*imperial-midia-api' | awk '{print $2}')

if [ -n "$PIDs" ]; then
  echo "Encontrados os seguintes processos a serem encerrados:"
  ps -p $PIDs -o pid,cmd
  kill -9 $PIDs
  echo "Processos encerrados."
else
  echo "Nenhum processo em execução encontrado."
fi

echo ""
echo "Iniciando o serviço novamente..."

# Executar npm run start em background e redirecionar saídas
nohup npm run start > ../imperial-api.log 2>&1 &

# Obter o PID do processo recém-iniciado
NEW_PID=$!
echo "Serviço iniciado com PID: $NEW_PID"

echo ""
echo "O serviço está reiniciando. Aguarde alguns segundos para que esteja completamente operacional."
echo "Logs estão sendo gravados em: ../imperial-api.log"
echo ""
echo "Para verificar o status do serviço, execute:"
echo "tail -f ../imperial-api.log"

exit 0 