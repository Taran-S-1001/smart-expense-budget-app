import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB limit
const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * ReceiptSection component
 * S2-12: Receipt photo attach and view (SEBM-F-012, TC-Exp-03).
 *
 * Standalone component that allows a user to view an attached receipt
 * or attach/replace a receipt photo for a specific transaction.
 *
 * @param {Object} props
 * @param {string} props.transactionId - ID of the transaction to manage receipt for
 * @param {Function} [props.onAttached] - Optional callback invoked when a receipt is successfully attached
 */
export function ReceiptSection({ transactionId, onAttached }) {
  const { accessToken } = useAuth();
  const fileInputRef = useRef(null);

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Fetch existing receipt on mount or when transactionId/accessToken changes
  useEffect(() => {
    if (!accessToken || !transactionId) {
      setReceipt(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotice('');
    setPreviewUrl(null);

    const options = {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    };

    api.get(`/receipts/${transactionId}`, options)
      .then((data) => {
        if (controller.signal.aborted) return;
        setReceipt(data.receipt || null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // 404 RECEIPT_NOT_FOUND is expected when no receipt has been uploaded yet
        if (err.status === 404 || err.code === 'RECEIPT_NOT_FOUND') {
          setReceipt(null);
        } else {
          setError(err.message || 'Failed to load receipt.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, transactionId]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setError('');
    setNotice('');

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError('Unsupported image format. Please select a PNG, JPEG, or WebP image.');
      event.target.value = '';
      setPreviewUrl(null);
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image size exceeds 1 MB limit. Please select a smaller image.');
      event.target.value = '';
      setPreviewUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result);
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
      setPreviewUrl(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAttach = async (event) => {
    if (event) event.preventDefault();
    if (!previewUrl || !transactionId || !accessToken) return;

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const options = {
        headers: { Authorization: `Bearer ${accessToken}` },
      };
      const response = await api.post(`/receipts/${transactionId}`, { imageUrl: previewUrl }, options);

      setReceipt(response.receipt);
      setNotice('Receipt attached successfully!');
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (typeof onAttached === 'function') {
        onAttached(response.receipt);
      }
    } catch (err) {
      setError(err.message || 'Failed to attach receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPreview = () => {
    setPreviewUrl(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section className="receipt-section" data-testid="receipt-section" aria-labelledby={`receipt-heading-${transactionId}`}>
      <div className="receipt-header">
        <h3 id={`receipt-heading-${transactionId}`} className="receipt-title">
          Receipt Attachment
        </h3>
      </div>

      {error && (
        <div className="form-message error-message" role="alert" data-testid="receipt-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="form-message success-message" role="status" data-testid="receipt-notice">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="receipt-meta" data-testid="receipt-loading">
          Loading receipt details...
        </p>
      ) : receipt ? (
        <div className="receipt-display" data-testid="receipt-display">
          <img
            src={receipt.imageUrl}
            alt="Attached receipt"
            className="receipt-image"
            data-testid="receipt-image"
          />
          <p className="receipt-meta">
            Attached: {new Date(receipt.createdAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="receipt-meta" data-testid="no-receipt-message">
          No receipt attached yet.
        </p>
      )}

      {/* Selected Image Preview (prior to upload) */}
      {previewUrl && (
        <div className="receipt-preview-container" data-testid="receipt-preview-container">
          <p className="receipt-meta">Preview before uploading:</p>
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="receipt-preview"
            data-testid="receipt-preview"
          />
          <div className="receipt-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleAttach}
              disabled={submitting}
              data-testid="attach-receipt-button"
            >
              {submitting ? 'Attaching...' : (receipt ? 'Replace Receipt' : 'Attach Receipt')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleCancelPreview}
              disabled={submitting}
              data-testid="cancel-preview-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* File Upload Input */}
      {!previewUrl && (
        <div className="receipt-input-container">
          <label htmlFor={`receipt-file-input-${transactionId}`} className="receipt-meta">
            {receipt ? 'Upload a new photo to replace current receipt:' : 'Select receipt photo (PNG, JPEG, WebP, max 1 MB):'}
          </label>
          <input
            id={`receipt-file-input-${transactionId}`}
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="receipt-file-input"
            onChange={handleFileChange}
            disabled={submitting || loading}
            aria-label="Select receipt photo"
            data-testid="receipt-file-input"
          />
        </div>
      )}
    </section>
  );
}

export default ReceiptSection;
