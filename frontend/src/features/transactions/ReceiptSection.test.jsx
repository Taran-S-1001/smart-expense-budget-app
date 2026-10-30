import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { ReceiptSection } from './ReceiptSection';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function AuthControls() {
  const { setUser, setAccessToken, clearUser } = useAuth();
  return (
    <div>
      <button
        onClick={() => {
          setUser({ userId: 'user-test-123' });
          setAccessToken('valid-test-token');
        }}
        type="button"
      >
        Sign in
      </button>
      <button onClick={clearUser} type="button">Sign out</button>
    </div>
  );
}

function renderReceiptSection(transactionId = 'tx-123', onAttached = undefined) {
  return render(
    <AuthProvider>
      <AuthControls />
      <ReceiptSection transactionId={transactionId} onAttached={onAttached} />
    </AuthProvider>
  );
}

describe('ReceiptSection (Component — SEBM-F-012, TC-Exp-03)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders "No receipt attached yet." when transaction has no receipt', async () => {
    api.get.mockRejectedValueOnce({
      status: 404,
      code: 'RECEIPT_NOT_FOUND',
      message: 'No receipt found for this transaction.',
    });

    renderReceiptSection('tx-123');

    act(() => {
      screen.getByText('Sign in').click();
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/receipts/tx-123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid-test-token' },
        })
      );
    });

    const noReceiptMsg = await screen.findByTestId('no-receipt-message');
    expect(noReceiptMsg).toBeTruthy();
    expect(noReceiptMsg.textContent).toContain('No receipt attached yet.');
    expect(screen.getByTestId('receipt-file-input')).toBeTruthy();
  });

  it('renders existing receipt image and metadata when receipt exists', async () => {
    api.get.mockResolvedValueOnce({
      receipt: {
        receiptId: 'rcpt-1',
        transactionId: 'tx-123',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        createdAt: '2026-10-29T10:00:00.000Z',
      },
    });

    renderReceiptSection('tx-123');

    act(() => {
      screen.getByText('Sign in').click();
    });

    const receiptImg = await screen.findByTestId('receipt-image');
    expect(receiptImg).toBeTruthy();
    expect(receiptImg.getAttribute('src')).toContain('data:image/png;base64');
    expect(screen.getByText(/Attached:/i)).toBeTruthy();
  });

  it('allows selecting an image file, previews it, and attaches successfully', async () => {
    api.get.mockRejectedValueOnce({
      status: 404,
      code: 'RECEIPT_NOT_FOUND',
    });

    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    api.post.mockResolvedValueOnce({
      receipt: {
        receiptId: 'rcpt-new',
        transactionId: 'tx-123',
        imageUrl: sampleBase64,
        createdAt: '2026-10-29T12:00:00.000Z',
      },
    });

    const onAttachedMock = vi.fn();
    renderReceiptSection('tx-123', onAttachedMock);

    act(() => {
      screen.getByText('Sign in').click();
    });

    await screen.findByTestId('no-receipt-message');

    const fileInput = screen.getByTestId('receipt-file-input');
    const validFile = new File(['fake-png-content'], 'receipt.png', { type: 'image/png' });

    // Mock FileReader
    const originalFileReader = window.FileReader;
    class MockFileReader {
      readAsDataURL() {
        this.result = sampleBase64;
        if (this.onload) this.onload();
      }
    }
    window.FileReader = MockFileReader;

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Preview should appear
    const attachButton = await screen.findByTestId('attach-receipt-button');
    expect(attachButton).toBeTruthy();
    expect(screen.getByTestId('receipt-preview')).toBeTruthy();

    // Click attach button
    await act(async () => {
      attachButton.click();
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/receipts/tx-123',
        { imageUrl: sampleBase64 },
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid-test-token' },
        })
      );
    });

    const notice = await screen.findByTestId('receipt-notice');
    expect(notice.textContent).toContain('Receipt attached successfully!');
    expect(screen.getByTestId('receipt-image')).toBeTruthy();
    expect(onAttachedMock).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: 'rcpt-new' })
    );

    window.FileReader = originalFileReader;
  });

  it('rejects unsupported file type client-side with an error message', async () => {
    api.get.mockRejectedValueOnce({ status: 404, code: 'RECEIPT_NOT_FOUND' });

    renderReceiptSection('tx-123');

    act(() => {
      screen.getByText('Sign in').click();
    });

    await screen.findByTestId('no-receipt-message');

    const fileInput = screen.getByTestId('receipt-file-input');
    const invalidFile = new File(['pdf-content'], 'document.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    const errorBanner = await screen.findByTestId('receipt-error');
    expect(errorBanner.textContent).toMatch(/Unsupported image format/i);
    expect(screen.queryByTestId('attach-receipt-button')).toBeNull();
  });

  it('rejects oversized file (> 1 MB) client-side with an error message', async () => {
    api.get.mockRejectedValueOnce({ status: 404, code: 'RECEIPT_NOT_FOUND' });

    renderReceiptSection('tx-123');

    act(() => {
      screen.getByText('Sign in').click();
    });

    await screen.findByTestId('no-receipt-message');

    const fileInput = screen.getByTestId('receipt-file-input');
    // Create a 1.5 MB dummy file
    const largeFile = new File(['a'.repeat(1.5 * 1024 * 1024)], 'large.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    const errorBanner = await screen.findByTestId('receipt-error');
    expect(errorBanner.textContent).toMatch(/Image size exceeds 1 MB limit/i);
    expect(screen.queryByTestId('attach-receipt-button')).toBeNull();
  });

  it('displays API error message when upload fails', async () => {
    api.get.mockRejectedValueOnce({ status: 404, code: 'RECEIPT_NOT_FOUND' });

    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    api.post.mockRejectedValueOnce({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied: transaction belongs to another user.',
    });

    renderReceiptSection('tx-other');

    act(() => {
      screen.getByText('Sign in').click();
    });

    await screen.findByTestId('no-receipt-message');

    const fileInput = screen.getByTestId('receipt-file-input');
    const validFile = new File(['png-data'], 'receipt.png', { type: 'image/png' });

    const originalFileReader = window.FileReader;
    class MockFileReader {
      readAsDataURL() {
        this.result = sampleBase64;
        if (this.onload) this.onload();
      }
    }
    window.FileReader = MockFileReader;

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const attachButton = await screen.findByTestId('attach-receipt-button');
    await act(async () => {
      attachButton.click();
    });

    const errorBanner = await screen.findByTestId('receipt-error');
    expect(errorBanner.textContent).toContain('Access denied: transaction belongs to another user.');

    window.FileReader = originalFileReader;
  });

  it('cancels preview when Cancel button is clicked', async () => {
    api.get.mockRejectedValueOnce({ status: 404, code: 'RECEIPT_NOT_FOUND' });

    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    renderReceiptSection('tx-123');

    act(() => {
      screen.getByText('Sign in').click();
    });

    await screen.findByTestId('no-receipt-message');

    const fileInput = screen.getByTestId('receipt-file-input');
    const validFile = new File(['png-data'], 'receipt.png', { type: 'image/png' });

    const originalFileReader = window.FileReader;
    class MockFileReader {
      readAsDataURL() {
        this.result = sampleBase64;
        if (this.onload) this.onload();
      }
    }
    window.FileReader = MockFileReader;

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const cancelButton = await screen.findByTestId('cancel-preview-button');
    expect(cancelButton).toBeTruthy();

    act(() => {
      cancelButton.click();
    });

    expect(screen.queryByTestId('receipt-preview')).toBeNull();
    expect(screen.queryByTestId('attach-receipt-button')).toBeNull();

    window.FileReader = originalFileReader;
  });
});
