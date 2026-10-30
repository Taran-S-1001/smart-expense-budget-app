const ReceiptService = require('../../../src/receipts/receiptService');

describe('ReceiptService (Unit — SEBM-F-012, TC-Exp-03)', () => {
  let mockRepository;
  let service;

  const validPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const validJpegDataUrl =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const validWebpDataUrl =
    'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

  beforeEach(() => {
    mockRepository = {
      findTransactionOwner: jest.fn(),
      findReceiptByTransactionId: jest.fn(),
      upsertReceipt: jest.fn(),
    };
    service = new ReceiptService(mockRepository);
  });

  describe('validateImage', () => {
    it('accepts valid PNG, JPEG, and WebP Data URLs', () => {
      expect(service.validateImage(validPngDataUrl)).toBe(validPngDataUrl);
      expect(service.validateImage(validJpegDataUrl)).toBe(validJpegDataUrl);
      expect(service.validateImage(validWebpDataUrl)).toBe(validWebpDataUrl);
    });

    it('throws VALIDATION_ERROR (400) when image data is missing or empty', () => {
      expect(() => service.validateImage(null)).toThrow('Image payload is required.');
      expect(() => service.validateImage('')).toThrow('Image payload is required.');
      expect(() => service.validateImage('   ')).toThrow('Image payload is required.');
    });

    it('throws UNSUPPORTED_MEDIA_TYPE (400) for unsupported image formats like GIF or PDF', () => {
      const gifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      expect(() => service.validateImage(gifDataUrl)).toThrow(
        'Only PNG, JPEG, and WebP image formats are supported.'
      );

      const pdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK';
      expect(() => service.validateImage(pdfDataUrl)).toThrow(
        'Only PNG, JPEG, and WebP image formats are supported.'
      );
    });

    it('throws VALIDATION_ERROR (400) for malformed Data URLs or plain text', () => {
      expect(() => service.validateImage('http://example.com/receipt.png')).toThrow(
        /Invalid image format/
      );
      expect(() => service.validateImage('not-a-data-url')).toThrow(/Invalid image format/);
      expect(() => service.validateImage('data:image/png;base64,invalid!@#base64')).toThrow(
        /Invalid image format/
      );
    });

    it('accepts a valid near-limit image (up to 1 MB decoded)', () => {
      // 1,048,572 bytes decoded = 1,398,096 base64 chars (multiple of 4) <= 1,048,576 bytes
      const nearLimitBase64 = 'A'.repeat(1398096);
      const nearLimitDataUrl = `data:image/png;base64,${nearLimitBase64}`;
      expect(service.validateImage(nearLimitDataUrl)).toBe(nearLimitDataUrl);
    });

    it('throws PAYLOAD_TOO_LARGE (413) when image size exceeds 1 MB', () => {
      // 1 MB = 1,048,576 bytes. Generate base64 string corresponding to > 1 MB.
      // Base64 encoding expands size by ~4/3, so 1.4 million characters is ~1.05 MB decoded.
      const largeBase64 = 'A'.repeat(1400000);
      const largeDataUrl = `data:image/png;base64,${largeBase64}`;

      expect(() => service.validateImage(largeDataUrl)).toThrow(
        'Image size exceeds the allowed limit (max 1 MB).'
      );
    });
  });

  describe('verifyTransactionOwnership', () => {
    it('throws VALIDATION_ERROR (400) when transactionId is missing or empty', async () => {
      await expect(service.verifyTransactionOwnership('user-1', '')).rejects.toThrow(
        'Transaction ID is required.'
      );
      await expect(service.verifyTransactionOwnership('user-1', null)).rejects.toThrow(
        'Transaction ID is required.'
      );
    });

    it('throws TRANSACTION_NOT_FOUND (404) when transaction does not exist', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue(null);

      await expect(service.verifyTransactionOwnership('user-1', 'tx-unknown')).rejects.toThrow(
        'Transaction not found.'
      );
      expect(mockRepository.findTransactionOwner).toHaveBeenCalledWith('tx-unknown');
    });

    it('throws FORBIDDEN (403) when transaction belongs to another user', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-1',
        userId: 'other-user',
      });

      await expect(service.verifyTransactionOwnership('user-1', 'tx-1')).rejects.toThrow(
        'Access denied: transaction belongs to another user.'
      );
    });

    it('succeeds when transaction belongs to the requesting user', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-1',
        userId: 'user-1',
      });

      await expect(service.verifyTransactionOwnership('user-1', 'tx-1')).resolves.toBeUndefined();
    });
  });

  describe('attachReceipt', () => {
    it('validates image, verifies ownership, and calls upsertReceipt', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-100',
        userId: 'user-1',
      });
      mockRepository.upsertReceipt.mockResolvedValue({
        receiptId: 'rcpt-100',
        transactionId: 'tx-100',
        imageUrl: validPngDataUrl,
        createdAt: '2026-10-29T10:00:00.000Z',
      });

      const result = await service.attachReceipt('user-1', 'tx-100', validPngDataUrl);

      expect(mockRepository.findTransactionOwner).toHaveBeenCalledWith('tx-100');
      expect(mockRepository.upsertReceipt).toHaveBeenCalledWith('tx-100', validPngDataUrl);
      expect(result).toEqual({
        receiptId: 'rcpt-100',
        transactionId: 'tx-100',
        imageUrl: validPngDataUrl,
        createdAt: '2026-10-29T10:00:00.000Z',
      });
    });

    it('rejects attachment when transaction belongs to someone else', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-100',
        userId: 'different-user',
      });

      await expect(service.attachReceipt('user-1', 'tx-100', validPngDataUrl)).rejects.toThrow(
        'Access denied: transaction belongs to another user.'
      );
      expect(mockRepository.upsertReceipt).not.toHaveBeenCalled();
    });
  });

  describe('getReceipt', () => {
    it('returns receipt metadata when transaction belongs to user and receipt exists', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-100',
        userId: 'user-1',
      });
      mockRepository.findReceiptByTransactionId.mockResolvedValue({
        receiptId: 'rcpt-100',
        transactionId: 'tx-100',
        imageUrl: validPngDataUrl,
        createdAt: '2026-10-29T10:00:00.000Z',
      });

      const result = await service.getReceipt('user-1', 'tx-100');

      expect(mockRepository.findTransactionOwner).toHaveBeenCalledWith('tx-100');
      expect(mockRepository.findReceiptByTransactionId).toHaveBeenCalledWith('tx-100');
      expect(result).toEqual({
        receiptId: 'rcpt-100',
        transactionId: 'tx-100',
        imageUrl: validPngDataUrl,
        createdAt: '2026-10-29T10:00:00.000Z',
      });
    });

    it('throws RECEIPT_NOT_FOUND (404) when transaction exists but has no receipt', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-100',
        userId: 'user-1',
      });
      mockRepository.findReceiptByTransactionId.mockResolvedValue(null);

      await expect(service.getReceipt('user-1', 'tx-100')).rejects.toThrow(
        'No receipt found for this transaction.'
      );
    });

    it('throws FORBIDDEN (403) when attempting to view another user\'s receipt', async () => {
      mockRepository.findTransactionOwner.mockResolvedValue({
        transactionId: 'tx-100',
        userId: 'victim-user',
      });

      await expect(service.getReceipt('attacker-user', 'tx-100')).rejects.toThrow(
        'Access denied: transaction belongs to another user.'
      );
      expect(mockRepository.findReceiptByTransactionId).not.toHaveBeenCalled();
    });
  });
});
