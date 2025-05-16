import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Product,
  ProductFilter,
  PaginatedProducts,
} from './interfaces/product.interface';
import { ProductProvider } from './interfaces/product-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UpMidiAssProvider } from './providers/upmidiass-provider';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private providers: Map<string, ProductProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly upMidiAssProvider: UpMidiAssProvider,
  ) {
    // Registrar provedores disponíveis
    this.registerProvider(this.upMidiAssProvider);

    // Log dos provedores registrados
    this.logger.log(
      `Registered product providers: ${Array.from(this.providers.keys()).join(', ')}`,
    );
  }

  // Registrar um novo provedor de produtos
  registerProvider(provider: ProductProvider) {
    this.providers.set(provider.providerName, provider);
    this.logger.log(`Registered provider: ${provider.providerName}`);
  }

  // Obter todos os provedores registrados
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // Buscar produtos de todos os provedores ou de um provedor específico
  async searchProducts(filter: ProductFilter): Promise<PaginatedProducts> {
    try {
      // Se um provedor específico foi solicitado
      if (filter.providerName && this.providers.has(filter.providerName)) {
        const provider = this.providers.get(filter.providerName);
        return await provider.searchProducts(filter);
      }

      // Se nenhum provedor específico, buscar no banco de dados local
      return await this.searchLocalProducts(filter);
    } catch (error) {
      this.logger.error(
        `Error searching products: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Buscar produtos no banco de dados local
  private async searchLocalProducts(
    filter: ProductFilter,
  ): Promise<PaginatedProducts> {
    const where = {
      active: filter.active === undefined ? true : filter.active,
      ...(filter.providerName ? { providerName: filter.providerName } : {}),
      ...(filter.searchTerm
        ? {
            OR: [
              { name: { contains: filter.searchTerm, mode: 'insensitive' } },
              {
                description: {
                  contains: filter.searchTerm,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.minPrice ? { price: { gte: filter.minPrice } } : {}),
      ...(filter.maxPrice ? { price: { lte: filter.maxPrice } } : {}),
    };

    const totalCount = await this.prisma.$queryRaw`
      SELECT COUNT(*) FROM "Product"
      WHERE ${this.prisma.$queryRaw(where as any)}
    `;

    const products = await this.prisma.$queryRaw`
      SELECT * FROM "Product"
      WHERE ${this.prisma.$queryRaw(where as any)}
      ORDER BY "updatedAt" DESC
      LIMIT ${filter.limit || 10}
      OFFSET ${filter.offset || 0}
    `;

    const total =
      Array.isArray(totalCount) && totalCount.length > 0
        ? parseInt(totalCount[0].count, 10)
        : Array.isArray(products)
          ? products.length
          : 0;

    return {
      items: Array.isArray(products)
        ? products.map(this.mapDbProductToProduct)
        : [],
      total,
      page: Math.floor((filter.offset || 0) / (filter.limit || 10)) + 1,
      limit: filter.limit || 10,
      totalPages: Math.ceil(total / (filter.limit || 10)),
    };
  }

  // Obter um produto específico por ID
  async getProductById(id: string): Promise<Product> {
    // Verificar se o ID contém prefixo de provedor
    const parts = id.split('-');
    const providerName = parts.length > 1 ? parts[0] : null;
    const productIdInProvider =
      parts.length > 1 ? parts.slice(1).join('-') : id;

    try {
      // Se o ID tem um prefixo de provedor válido, buscar diretamente do provedor
      if (providerName && this.providers.has(providerName)) {
        const provider = this.providers.get(providerName);
        const product = await provider.getProductById(productIdInProvider);
        if (product) return product;
      }

      // Tentar buscar no banco local pelo ID exato
      const product = await this.prisma.$queryRaw`
        SELECT * FROM "Product" WHERE "id" = ${id}
      `;

      if (Array.isArray(product) && product.length > 0) {
        return this.mapDbProductToProduct(product[0]);
      }

      throw new NotFoundException(`Product with ID ${id} not found`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Error getting product by ID ${id}: ${error.message}`,
        error.stack,
      );
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
  }

  // Sincronizar produtos de todos os provedores ou de um provedor específico
  async syncProducts(
    providerName?: string,
  ): Promise<
    Record<string, { added: number; updated: number; removed: number }>
  > {
    const result: Record<
      string,
      { added: number; updated: number; removed: number }
    > = {};

    try {
      // Se um provedor específico foi solicitado
      if (providerName) {
        if (!this.providers.has(providerName)) {
          throw new NotFoundException(`Provider ${providerName} not found`);
        }

        const provider = this.providers.get(providerName);
        if (provider.syncProducts) {
          result[providerName] = await provider.syncProducts();
        } else {
          result[providerName] = { added: 0, updated: 0, removed: 0 };
          this.logger.warn(
            `Provider ${providerName} does not support syncProducts method`,
          );
        }

        return result;
      }

      // Sincronizar todos os provedores que suportam sincronização
      for (const [name, provider] of this.providers.entries()) {
        if (provider.syncProducts) {
          result[name] = await provider.syncProducts();
        } else {
          result[name] = { added: 0, updated: 0, removed: 0 };
          this.logger.warn(
            `Provider ${name} does not support syncProducts method`,
          );
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error syncing products: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Mapear produto do banco para o formato padrão
  private mapDbProductToProduct(dbProduct: any): Product {
    return {
      id: dbProduct.id,
      name: dbProduct.name,
      description: dbProduct.description,
      price: dbProduct.price,
      imageUrl: dbProduct.imageUrl,
      category: dbProduct.category,
      metadata: dbProduct.metadata,
      providerName: dbProduct.providerName,
      providerProductId: dbProduct.providerProductId,
      active: dbProduct.active,
      createdAt: dbProduct.createdAt,
      updatedAt: dbProduct.updatedAt,
    };
  }
}
