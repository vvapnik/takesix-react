import type { TakeSixDocument } from '@takesix/core'

export const sample: TakeSixDocument = {
  takesix: '1.0',
  title: 'Online shop',
  blocks: [
    {
      id: 'web',
      icon: '🖥',
      title: 'Web app',
      description: 'What customers see',
      children: [
        { id: 'web-catalog', icon: '◫', title: 'Catalog', description: 'Browse and search products' },
        { id: 'web-cart', icon: '◍', title: 'Cart', description: 'Basket and checkout' },
        { id: 'web-account', icon: '◎', title: 'Account', description: 'Orders, addresses, settings' },
      ],
    },
    {
      id: 'api',
      icon: '⬡',
      title: 'API',
      description: 'Public HTTP API',
      children: [
        { id: 'api-auth', icon: '🔑', title: 'Auth', description: 'Sessions and tokens' },
        {
          id: 'api-orders',
          icon: '⇢',
          title: 'Orders',
          description: 'Checkout and refunds',
          layout: 'list',
          children: [
            { id: 'orders-service', title: 'Order service', description: 'Business rules' },
            { id: 'orders-queue', title: 'Order queue', description: 'Async fulfilment jobs' },
            { id: 'orders-worker', title: 'Fulfilment worker', description: 'Talks to the warehouse' },
          ],
        },
        { id: 'api-products', icon: '◫', title: 'Products', description: 'Catalog and prices' },
      ],
    },
    { id: 'db', icon: '◈', title: 'Database', description: 'PostgreSQL' },
    { id: 'payments', icon: '💳', title: 'Payments', description: 'External provider' },
  ],
  links: [
    { id: 'l-web-api', from: 'web', to: 'api', label: 'REST' },
    { id: 'l-cart-orders', from: 'web-cart', to: 'api-orders', label: 'checkout' },
    { id: 'l-catalog-products', from: 'web-catalog', to: 'api-products' },
    { id: 'l-account-auth', from: 'web-account', to: 'api-auth' },
    { id: 'l-orders-db', from: 'orders-service', to: 'db', label: 'SQL' },
    { id: 'l-products-db', from: 'api-products', to: 'db', label: 'SQL' },
    { id: 'l-orders-payments', from: 'orders-service', to: 'payments', label: 'charge', direction: 'both' },
    { id: 'l-service-queue', from: 'orders-service', to: 'orders-queue' },
    { id: 'l-queue-worker', from: 'orders-queue', to: 'orders-worker' },
    { id: 'l-auth-orders', from: 'api-auth', to: 'api-orders', direction: 'none' },
  ],
}
