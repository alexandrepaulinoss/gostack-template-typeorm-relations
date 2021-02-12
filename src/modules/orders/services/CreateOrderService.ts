import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const foundCustomer = await this.customersRepository.findById(customer_id);

    if (!foundCustomer) {
      throw new AppError(`Customer ${customer_id} not found`);
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (!foundProducts.length) {
      throw new AppError('Products not found');
    } else {
      const foundProductsId = await foundProducts.map(product => product.id);

      const notFoundProducts = products.filter(
        product => !foundProductsId.includes(product.id),
      );

      if (notFoundProducts.length) {
        const notFoundProductsId = await notFoundProducts.map(
          product => product.id,
        );

        throw new AppError(`Products not found: ${notFoundProductsId}`);
      }
    }

    const findProductsStocks = products.filter(
      product =>
        foundProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    let outOfStockProducts = '';

    if (findProductsStocks.length) {
      findProductsStocks.forEach(product => {
        outOfStockProducts += `Product ${product.id}, stock ${
          foundProducts.filter(p => p.id === product.id)[0].quantity
        }, sold ${product.quantity} /`;
      });

      throw new AppError(`Not enought stock for: ${outOfStockProducts}`);
    }

    const productsList = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: foundProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: foundCustomer,
      products: productsList,
    });

    const { order_products } = order;

    const orderedProducts = order_products.map(product => ({
      id: product.product_id,
      quantity:
        foundProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProducts);

    return order;
  }
}

export default CreateOrderService;
