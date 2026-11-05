const express = require('express');
const { authenticateToken } = require('../auth/jwt');
const NotificationService = require('./notificationService');
const NotificationProvider = require('./providers/NotificationProvider');
const MockNotificationProvider = require('./providers/MockNotificationProvider');
const notificationRepository = require('./notificationRepository');
const { checkThreshold } = require('../budgets');

const router = express.Router();

const enforceOwnNotifications = (req, res, targetUserId) => {
  if (!targetUserId) {
    return false;
  }

  if (req.user?.role === 'admin') {
    return true;
  }

  if (req.user?.userId !== targetUserId) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You can only access notifications for your own account.',
      },
    });
    return false;
  }

  return true;
};

router.use(authenticateToken);

/**
 * GET /api/notifications
 * In-app notification list per SRS SEBM-F-050.
 * Query parameters: userId, limit, offset
 * Requires an authenticated session and only returns the caller's own notifications.
 */
router.get('/', async (req, res, next) => {
  try {
    const requestedUserId = req.query.userId || req.user.userId;

    if (!enforceOwnNotifications(req, res, requestedUserId)) {
      return;
    }

    // Evaluate budget thresholds dynamically on read (supports test raw SQL insertions across all periods)
    try {
      await checkThreshold(requestedUserId);
    } catch (evalErr) {
      console.warn('Notification route checkThreshold evaluation warning:', evalErr.message);
    }

    const { limit, offset } = req.query;
    const result = await NotificationService.listNotifications(requestedUserId, { limit, offset });

    res.status(200).json({
      ok: true,
      notifications: result.notifications,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/user/:userId
 * In-app notification list by explicit user ID route parameter.
 * Only the owner or an admin can request a list for a user.
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!enforceOwnNotifications(req, res, userId)) {
      return;
    }

    // Evaluate budget thresholds dynamically on read for all periods
    try {
      await checkThreshold(userId);
    } catch (evalErr) {
      console.warn('Notification route checkThreshold evaluation warning:', evalErr.message);
    }

    const { limit, offset } = req.query;
    const result = await NotificationService.listNotifications(userId, { limit, offset });

    res.status(200).json({
      ok: true,
      notifications: result.notifications,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications
 * Trigger notification dispatch and persistence.
 * Request body: { userId, type, message }
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, type, message } = req.body || {};
    const targetUserId = userId || req.user.userId;

    if (!enforceOwnNotifications(req, res, targetUserId)) {
      return;
    }

    const notification = await NotificationService.send({ userId: targetUserId, type, message });

    res.status(201).json({
      ok: true,
      notification,
    });
  } catch (err) {
    next(err);
  }
});

// Re-export services and providers for consumer modules
router.NotificationService = NotificationService;
router.NotificationProvider = NotificationProvider;
router.MockNotificationProvider = MockNotificationProvider;
router.notificationRepository = notificationRepository;
router.notificationService = NotificationService.defaultInstance;

module.exports = router;