import { initConfig } from '../src/config.js';
import { closePool } from '../src/db.js';
import { reconcileOnce } from '../src/modules/payments/reconcile.js';
import { stripe } from '../src/modules/payments/stripe.js';

initConfig();
try {
  const summary = await reconcileOnce(stripe());
  console.log('reconcile: done', summary);
} finally {
  await closePool();
}
