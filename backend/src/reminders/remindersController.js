const RemindersService = require('./remindersService');

const defaultService = new RemindersService();

const createReminder = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const reminder = await defaultService.createReminder(userId, req.body || {});
    return res.status(201).json({ reminder });
  } catch (err) {
    return next(err);
  }
};

const listReminders = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const reminders = await defaultService.listReminders(userId, req.query || {});
    return res.status(200).json({ reminders });
  } catch (err) {
    return next(err);
  }
};

const getReminder = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { reminderId } = req.params;
    const reminder = await defaultService.getReminder(userId, reminderId);
    return res.status(200).json({ reminder });
  } catch (err) {
    return next(err);
  }
};

const updateReminder = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { reminderId } = req.params;
    const reminder = await defaultService.updateReminder(userId, reminderId, req.body || {});
    return res.status(200).json({ reminder });
  } catch (err) {
    return next(err);
  }
};

const deleteReminder = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { reminderId } = req.params;
    await defaultService.deleteReminder(userId, reminderId);
    return res.status(200).json({
      ok: true,
      message: 'Reminder deleted successfully.',
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  defaultService,
};
