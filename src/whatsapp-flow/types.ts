export type Position = {
  x: number;
  y: number;
};

export type NodeBase = {
  id: string;
  type: string;
  position: Position;
};

// Novo tipo para Gatilhos de Nó
export type NodeGatilho = {
  tipo: 'texto' | 'regex' | 'qualquer'; // Tipo do gatilho
  valor?: string; // Valor para "texto" ou "regex"
  resposta?: string; // Resposta automática opcional do bot a este gatilho
  proximoNoId?: string; // ID do próximo nó específico para este gatilho (opcional, para condicionais complexas)
};

// Interface para dados básicos de nós
export interface BaseNodeData {
  label?: string;
  aguardaResposta?: boolean;
  tempoLimite?: number;
  gatilhos?: NodeGatilho[];
}

// Tipos de nós específicos atualizados
export type StartNodeData = BaseNodeData & Record<string, never>; // Label já está em BaseNodeData

export type MessageNodeData = BaseNodeData & Record<string, never>; // Label já está em BaseNodeData

export type ConditionalNodeData = BaseNodeData & {
  condition?: string; // Pode ser removido se a lógica condicional for gerenciada por gatilhos
  yesLabel?: string; // Pode ser removido
  noLabel?: string; // Pode ser removido
  // A lógica de "yes"/"no" pode ser representada por dois gatilhos com `proximoNoId` diferentes
};

export type ListOption = {
  id: string;
  text: string;
  description?: string;
  proximoNoId?: string; // Opcional: para onde esta opção da lista deve levar
};

export type ListNodeData = BaseNodeData & {
  options: ListOption[];
};

export type EndNodeData = BaseNodeData & Record<string, never>; // Label já está em BaseNodeData

// União de todos os tipos de dados
export type NodeData =
  | StartNodeData
  | MessageNodeData
  | ConditionalNodeData
  | ListNodeData
  | EndNodeData;

// Definições de nós completos
export type FlowNode = NodeBase & {
  // O campo data agora pode ser qualquer um dos NodeData, que já incluem BaseNodeData
  data: NodeData;
};

// Definição de borda/aresta
export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

// Definição do fluxo completo
export type WhatsappFlowData = {
  id?: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  instanceName?: string;
};

// DTO para criação de fluxo
export class CreateFlowDto {
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  instanceName?: string;
}

// DTO para atualização de fluxo
export class UpdateFlowDto {
  name?: string;
  description?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  active?: boolean;
  instanceName?: string;
}

// Resposta de execução de fluxo
export type FlowExecutionResponse = {
  success: boolean;
  message: string;
  currentNodeId?: string;
  nextNodeIds?: string[];
  error?: string;
};

// Tipos de nós no fluxo
export type FlowNodeType =
  | 'start'
  | 'end'
  | 'message'
  | 'conditional'
  | 'list'
  | 'product'; // Adicionado novo tipo 'product'

// Dados para nó do tipo produto
export interface ProductNodeData extends BaseNodeData {
  productId?: string; // ID do produto (opcional - pode ser definido dinamicamente)
  providerName?: string; // Nome do provedor (opcional - pode ser definido dinamicamente)
  showPrice?: boolean; // Se deve mostrar o preço
  showDescription?: boolean; // Se deve mostrar a descrição
  showImage?: boolean; // Se deve mostrar a imagem
  addToCartButton?: boolean; // Se deve mostrar botão de adicionar ao carrinho
  customText?: string; // Texto personalizado adicional
}
