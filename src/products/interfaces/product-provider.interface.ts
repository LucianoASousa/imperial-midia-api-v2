import { Product, ProductFilter, PaginatedProducts } from './product.interface';

/**
 * Interface que define o contrato para qualquer fornecedor de produtos
 * Qualquer novo fornecedor deverá implementar esta interface
 */
export interface ProductProvider {
  /**
   * Nome único para identificar o provedor
   */
  readonly providerName: string;

  /**
   * Busca produtos com base nos filtros fornecidos
   */
  searchProducts(filter: ProductFilter): Promise<PaginatedProducts>;

  /**
   * Busca um produto específico pelo ID
   */
  getProductById(id: string): Promise<Product | null>;

  /**
   * Sincroniza produtos do provedor para o banco de dados local
   * Implementação opcional para provedores que precisam de sincronização periódica
   */
  syncProducts?(): Promise<{ added: number; updated: number; removed: number }>;
}
