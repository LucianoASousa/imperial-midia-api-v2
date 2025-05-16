import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  ProductFilter,
  PaginatedProducts,
  Product,
} from './interfaces/product.interface';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async searchProducts(
    @Query('search') searchTerm?: string,
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('provider') providerName?: string,
    @Query('active') active?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<PaginatedProducts> {
    const filter: ProductFilter = {
      searchTerm,
      category,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      providerName,
      active: active === undefined ? undefined : active === true,
      limit: limit ? Number(limit) : 10,
      offset: offset ? Number(offset) : 0,
    };

    return this.productsService.searchProducts(filter);
  }

  @Get('providers')
  getProviders(): string[] {
    return this.productsService.getProviders();
  }

  @Get(':id')
  async getProductById(@Param('id') id: string): Promise<Product> {
    return this.productsService.getProductById(id);
  }

  @Post('sync')
  async syncProducts(
    @Query('provider') providerName?: string,
  ): Promise<Record<string, any>> {
    return this.productsService.syncProducts(providerName);
  }
}
