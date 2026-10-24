const express = require('express');
const NotificationService = require('./notificationService');
const NotificationProvider = require('./providers/NotificationProvider');
const MockNotificationProvider = require('./providers/MockNotificationProvider');
const notificationRepository = require('./notificationRepository');

const router = express.Router();

/**
 * GET /api/notifications
 * In-app notification list per SRS SEBM-F-050.
 * Query parameters: userId, limit, offset
 * Passes through if userId is not provided.
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.query.userId;
    if (!userId) {
      return next(); // Pass through to 404 handler when no userId query or auth session is provided
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
 * GET /api/notifications/user/:userId
 * In-app notification list by explicit user ID route parameter.
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
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
    const notification = await NotificationService.send({ userId, type, message });

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
