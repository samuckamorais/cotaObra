import { Router } from 'express';
import { SubscriptionsController } from './subscriptions.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireTenant } from '../../middleware/tenant.middleware';
import { requirePermission } from '../../middleware/permissions.middleware';

const router = Router();
const controller = new SubscriptionsController();

// All routes require authentication and tenant isolation
router.use(authenticate);
router.use(requireTenant);

// List subscriptions - requires view permission
router.get('/', requirePermission('SUBSCRIPTIONS', 'canView'), (req, res) =>
  controller.list(req, res)
);

// Get one subscription
router.get('/:id', requirePermission('SUBSCRIPTIONS', 'canView'), (req, res) =>
  controller.getOne(req, res)
);

// Create subscription - requires create permission
router.post('/', requirePermission('SUBSCRIPTIONS', 'canCreate'), (req, res) =>
  controller.create(req, res)
);

// Update plan - requires edit permission
router.patch('/:id/plan', requirePermission('SUBSCRIPTIONS', 'canEdit'), (req, res) =>
  controller.updatePlan(req, res)
);

// Renew subscription - requires edit permission
router.post('/:id/renew', requirePermission('SUBSCRIPTIONS', 'canEdit'), (req, res) =>
  controller.renew(req, res)
);

// Cancel subscription - requires delete permission
router.post('/:id/cancel', requirePermission('SUBSCRIPTIONS', 'canDelete'), (req, res) =>
  controller.cancel(req, res)
);

// Reset quota - requires edit permission (admin only, emergency)
router.post('/:id/reset-quota', requirePermission('SUBSCRIPTIONS', 'canEdit'), (req, res) =>
  controller.resetQuota(req, res)
);

export default router;
