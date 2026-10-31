const express = require('express');
const { authenticateToken } = require('../auth/jwt');
const {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  deleteReminder,
} = require('./remindersController');
const RemindersService = require('./remindersService');
const RemindersRepository = require('./remindersRepository');
const {
  processDueReminders,
  startReminderScheduler,
  stopReminderScheduler,
  getSchedulerStatus,
} = require('./reminderScheduler');

const router = express.Router();

// Require JWT authentication for all reminder endpoints per SEBM-F-051
router.use(authenticateToken);

router.post('/', createReminder);
router.get('/', listReminders);
router.get('/:reminderId', getReminder);
router.put('/:reminderId', updateReminder);
router.delete('/:reminderId', deleteReminder);

router.RemindersService = RemindersService;
router.RemindersRepository = RemindersRepository;
router.processDueReminders = processDueReminders;
router.startReminderScheduler = startReminderScheduler;
router.stopReminderScheduler = stopReminderScheduler;
router.getSchedulerStatus = getSchedulerStatus;

module.exports = router;
