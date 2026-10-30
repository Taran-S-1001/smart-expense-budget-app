const ReceiptService = require('./receiptService');

const receiptService = new ReceiptService();

const attachReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const imageUrl = req.body?.imageUrl || req.body?.image || req.body?.imageData || req.body?.image_url;

    const receipt = await receiptService.attachReceipt(req.user.userId, transactionId, imageUrl);
    return res.status(201).json({ receipt });
  } catch (error) {
    return next(error);
  }
};

const getReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const receipt = await receiptService.getReceipt(req.user.userId, transactionId);
    return res.status(200).json({ receipt });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  attachReceipt,
  getReceipt,
};
