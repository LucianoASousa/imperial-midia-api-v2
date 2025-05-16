import { Injectable, Logger } from '@nestjs/common';
import { ProductProvider } from '../interfaces/product-provider.interface';
import {
  Product,
  ProductFilter,
  PaginatedProducts,
} from '../interfaces/product.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class UpMidiAssProvider implements ProductProvider {
  readonly providerName = 'upmidiass';
  private readonly logger = new Logger(UpMidiAssProvider.name);
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.apiBaseUrl =
      this.configService.get<string>('UPMIDIASS_API_URL') ||
      'https://upmidiass.net/api';
    this.apiKey = this.configService.get<string>('UPMIDIASS_API_KEY') || '';
  }

  async searchProducts(filter: ProductFilter): Promise<PaginatedProducts> {
    try {
      // Mapear filtros locais para os parâmetros da API UpMidiAss
      const apiParams = {
        search: filter.searchTerm,
        category: filter.category,
        min_price: filter.minPrice,
        max_price: filter.maxPrice,
        page: Math.floor((filter.offset || 0) / (filter.limit || 10)) + 1,
        limit: filter.limit || 10,
      };

      // Chamada para a API externa
      const response = await axios.get(`${this.apiBaseUrl}/products`, {
        params: apiParams,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Converter resposta da API para o formato padronizado
      const products = response.data.data.map((item) =>
        this.mapApiProductToProduct(item),
      );

      return {
        items: products,
        total: response.data.meta.total || products.length,
        page: response.data.meta.current_page || 1,
        limit: response.data.meta.per_page || filter.limit || 10,
        totalPages:
          response.data.meta.last_page ||
          Math.ceil(products.length / (filter.limit || 10)),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching products from UpMidiAss API: ${error.message}`,
        error.stack,
      );

      // Em caso de erro na API, tentar retornar produtos do banco local
      return this.getProductsFromLocalDB(filter);
    }
  }

  async getProductById(id: string): Promise<Product | null> {
    try {
      // Verificar primeiro no banco local
      const localProduct = await this.prisma.product.findFirst({
        where: {
          providerProductId: id,
          providerName: this.providerName,
        },
      });

      if (localProduct) {
        return this.mapDbProductToProduct(localProduct);
      }

      // Se não encontrado localmente, buscar na API
      const response = await axios.get(`${this.apiBaseUrl}/products/${id}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.data) {
        return this.mapApiProductToProduct(response.data.data);
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error fetching product ${id} from UpMidiAss API: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async syncProducts(): Promise<{
    added: number;
    updated: number;
    removed: number;
  }> {
    try {
      // Resultado final
      const result = { added: 0, updated: 0, removed: 0 };

      // Buscar todos os produtos da API
      let page = 1;
      let hasMorePages = true;
      const allApiProducts = [];

      while (hasMorePages) {
        const response = await axios.get(`${this.apiBaseUrl}/products`, {
          params: { page, limit: 100 },
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        const products = response.data.data || [];
        allApiProducts.push(...products);

        // Verificar se há mais páginas
        hasMorePages = page < (response.data.meta.last_page || 1);
        page++;
      }

      // Obter IDs de produtos da API
      const apiProductIds = allApiProducts.map((p) => p.id);

      // Obter produtos existentes no banco
      const existingProducts = await this.prisma.product.findMany({
        where: {
          providerName: this.providerName,
        },
      });
      const existingProductIds = existingProducts.map(
        (p) => p.providerProductId,
      );

      // Produtos para adicionar (existem na API mas não no banco)
      const productsToAdd = allApiProducts.filter(
        (p) => !existingProductIds.includes(p.id),
      );

      // Produtos para atualizar (existem em ambos)
      const productsToUpdate = allApiProducts.filter((p) =>
        existingProductIds.includes(p.id),
      );

      // Produtos para remover (existem no banco mas não na API)
      const productsToRemove = existingProducts.filter(
        (p) => !apiProductIds.includes(p.providerProductId),
      );

      // Adicionar novos produtos
      if (productsToAdd.length > 0) {
        await this.prisma.product.createMany({
          data: productsToAdd.map((apiProduct) => ({
            name: apiProduct.name,
            description: apiProduct.description || '',
            price: parseFloat(apiProduct.price || '0'),
            imageUrl: apiProduct.image_url,
            category: apiProduct.category,
            metadata: apiProduct,
            providerName: this.providerName,
            providerProductId: apiProduct.id,
            active: apiProduct.active || true,
          })),
        });
        result.added = productsToAdd.length;
      }

      // Atualizar produtos existentes
      for (const apiProduct of productsToUpdate) {
        await this.prisma.product.updateMany({
          where: {
            providerProductId: apiProduct.id,
            providerName: this.providerName,
          },
          data: {
            name: apiProduct.name,
            description: apiProduct.description || '',
            price: parseFloat(apiProduct.price || '0'),
            imageUrl: apiProduct.image_url,
            category: apiProduct.category,
            metadata: apiProduct,
            active: apiProduct.active || true,
            updatedAt: new Date(),
          },
        });
      }
      result.updated = productsToUpdate.length;

      // Remover produtos que não existem mais na API
      if (productsToRemove.length > 0) {
        await this.prisma.product.deleteMany({
          where: {
            id: {
              in: productsToRemove.map((p) => p.id),
            },
          },
        });
        result.removed = productsToRemove.length;
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error syncing products from UpMidiAss API: ${error.message}`,
        error.stack,
      );
      return { added: 0, updated: 0, removed: 0 };
    }
  }

  // Métodos auxiliares privados
  private async getProductsFromLocalDB(
    filter: ProductFilter,
  ): Promise<PaginatedProducts> {
    const where: any = {
      providerName: this.providerName,
      active: filter.active === undefined ? true : filter.active,
    };

    // Adicionar filtros adicionais com tipagem correta
    if (filter.searchTerm) {
      where.OR = [
        {
          name: {
            contains: filter.searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          description: {
            contains: filter.searchTerm,
            mode: 'insensitive' as const,
          },
        },
      ];
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (filter.minPrice) {
      where.price = { ...where.price, gte: filter.minPrice };
    }

    if (filter.maxPrice) {
      where.price = { ...where.price, lte: filter.maxPrice };
    }

    const totalItems = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      skip: filter.offset || 0,
      take: filter.limit || 10,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      items: products.map(this.mapDbProductToProduct),
      total: totalItems,
      page: Math.floor((filter.offset || 0) / (filter.limit || 10)) + 1,
      limit: filter.limit || 10,
      totalPages: Math.ceil(totalItems / (filter.limit || 10)),
    };
  }

  private mapApiProductToProduct(apiProduct: any): Product {
    return {
      id: `upmidiass-${apiProduct.id}`, // Prefixo para evitar conflitos com outros provedores
      name: apiProduct.name,
      description: apiProduct.description || '',
      price: parseFloat(apiProduct.price || '0'),
      imageUrl: apiProduct.image_url,
      category: apiProduct.category,
      metadata: apiProduct,
      providerName: this.providerName,
      providerProductId: apiProduct.id,
      active: apiProduct.active || true,
      createdAt: new Date(apiProduct.created_at || Date.now()),
      updatedAt: new Date(apiProduct.updated_at || Date.now()),
    };
  }

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
