export type Position = {
  x: number;
  y: number;
};

export type NodeBase = {
  id: string;
  type: string;
  position: Position;
};

// Tipos de nós específicos
export type StartNodeData = {
  label: string;
};

export type MessageNodeData = {
  label: string;
};

export type ConditionalNodeData = {
  label: string;
  condition: string;
  yesLabel: string;
  noLabel: string;
};

export type ListOption = {
  id: string;
  text: string;
};

export type ListNodeData = {
  label: string;
  options: ListOption[];
};

export type EndNodeData = {
  label: string;
};

// União de todos os tipos de dados
export type NodeData =
  | StartNodeData
  | MessageNodeData
  | ConditionalNodeData
  | ListNodeData
  | EndNodeData;

// Definições de nós completos
export type FlowNode = NodeBase & {
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
