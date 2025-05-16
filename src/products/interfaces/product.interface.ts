export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl?: string;
  category?: string;
  metadata?: Record<string, any>; // Dados adicionais específicos de cada fornecedor
  providerName: string; // Nome do fornecedor que forneceu este produto
  providerProductId?: string; // ID original do produto no sistema do fornecedor
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Interface para definir filtros de busca de produtos
export interface ProductFilter {
  searchTerm?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  providerName?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

// Interface para paginação de resultados
export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
