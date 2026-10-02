import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed-data';

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

async function main() {
  const prisma = new PrismaClient();
  const production = process.env.NODE_ENV === 'production';
  try {
    await seedDatabase(prisma, {
      adminEmail: required('SEED_ADMIN_EMAIL', 'admin@pnccoffee.local'),
      adminPassword: required('SEED_ADMIN_PASSWORD', production ? undefined : 'Admin@12345'),
      staffEmail: required('SEED_STAFF_EMAIL', 'barista@pnccoffee.local'),
      staffPassword: required('SEED_STAFF_PASSWORD', production ? undefined : 'Staff@12345'),
      // Demo sales history is only generated outside production unless explicitly requested.
      demoOrders: process.env.SEED_DEMO_ORDERS
        ? process.env.SEED_DEMO_ORDERS === 'true'
        : !production,
      log: (message) => console.log(`  • ${message}`),
    });
    console.log('✓ Database seeded');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('✗ Seeding failed:', error);
  process.exit(1);
});
