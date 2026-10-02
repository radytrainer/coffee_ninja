import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { expireStalePayments, paymentPublicUrl } from './services/payment.service';
import { closeRealtime, initRealtime } from './websocket';

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = createServer(app);
  initRealtime(server);

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    logger.info(
      `QR payments: ${env.PAYMENT_PROVIDER} provider, pay page ${paymentPublicUrl()}/pay/…`,
    );
    if (env.PAYMENT_PROVIDER === 'demo' && env.NODE_ENV === 'production') {
      logger.warn(
        'PAYMENT_PROVIDER=demo: anyone scanning the QR can mark an order paid. Use a real provider for a live shop.',
      );
    }
    if (!env.SMILE_TOKEN_SECRET)
      logger.warn('SMILE_TOKEN_SECRET not set: smile discount is unavailable');
  });

  // Unpaid orders are cancelled when their QR payment times out.
  const sweeper = setInterval(() => {
    expireStalePayments().catch((err: unknown) =>
      logger.error({ err }, 'payment expiry sweep failed'),
    );
  }, 15_000);
  sweeper.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    clearInterval(sweeper);
    await closeRealtime();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start API');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
