const ReceiptRepository = require('./receiptRepository');

const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB limit
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const DATA_URL_REGEX = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/;

class ReceiptService {
  constructor(repository = new ReceiptRepository()) {
    this.repository = repository;
  }

  /**
   * Validates image Data URL payload, MIME type, and size limit.
   *
   * @param {string} imageDataUrl
   * @returns {string} Trimmed, validated image Data URL
   */
  validateImage(imageDataUrl) {
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) {
      const error = new Error('Image payload is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const trimmed = imageDataUrl.trim();

    // Check if it's a data URL
    if (trimmed.startsWith('data:')) {
      const mimeMatch = trimmed.match(/^data:([^;,]+);base64,/);
      if (mimeMatch) {
        const mimeType = mimeMatch[1].toLowerCase();
        if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
          const error = new Error('Only PNG, JPEG, and WebP image formats are supported.');
          error.statusCode = 400;
          error.code = 'UNSUPPORTED_MEDIA_TYPE';
          throw error;
        }
      }
    }

    const match = trimmed.match(DATA_URL_REGEX);
    if (!match) {
      const error = new Error('Invalid image format. Expected a base64 Data URL (PNG, JPEG, WebP).');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const base64Data = match[3];
    // Calculate approximate decoded byte size
    const padding = (base64Data.endsWith('==') ? 2 : (base64Data.endsWith('=') ? 1 : 0));
    const byteSize = Math.ceil((base64Data.length * 3) / 4) - padding;

    if (byteSize > MAX_IMAGE_BYTES) {
      const error = new Error('Image size exceeds the allowed limit (max 1 MB).');
      error.statusCode = 413;
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }

    return trimmed;
  }

  /**
   * Verifies that transaction belongs to the requesting user.
   *
   * @param {string} userId
   * @param {string} transactionId
   * @returns {Promise<void>}
   */
  async verifyTransactionOwnership(userId, transactionId) {
    if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
      const error = new Error('Transaction ID is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const transaction = await this.repository.findTransactionOwner(transactionId.trim());
    if (!transaction) {
      const error = new Error('Transaction not found.');
      error.statusCode = 404;
      error.code = 'TRANSACTION_NOT_FOUND';
      throw error;
    }

    if (transaction.userId !== userId) {
      const error = new Error('Access denied: transaction belongs to another user.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }
  }

  /**
   * Attach or update a receipt for an existing transaction.
   *
   * @param {string} userId
   * @param {string} transactionId
   * @param {string} rawImageUrl
   * @returns {Promise<Object>}
   */
  async attachReceipt(userId, transactionId, rawImageUrl) {
    const validatedImageUrl = this.validateImage(rawImageUrl);
    await this.verifyTransactionOwnership(userId, transactionId);

    return this.repository.upsertReceipt(transactionId.trim(), validatedImageUrl);
  }

  /**
   * Retrieve receipt metadata and image data for a transaction.
   *
   * @param {string} userId
   * @param {string} transactionId
   * @returns {Promise<Object>}
   */
  async getReceipt(userId, transactionId) {
    await this.verifyTransactionOwnership(userId, transactionId);

    const receipt = await this.repository.findReceiptByTransactionId(transactionId.trim());
    if (!receipt) {
      const error = new Error('No receipt found for this transaction.');
      error.statusCode = 404;
      error.code = 'RECEIPT_NOT_FOUND';
      throw error;
    }

    return receipt;
  }
}

module.exports = ReceiptService;
module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
module.exports.SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES;
