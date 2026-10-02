// Shared by every page that opens a Razorpay checkout (box reserve, box
// renew) — the SDK boilerplate (constructor shape, payment.failed wiring,
// modal dismiss wiring) is identical everywhere; only which API calls
// surround it (create order, confirm payment) differ per flow, so those
// stay with the caller.
export function razorpayAvailable() {
  return Boolean(window.Razorpay);
}

export function openRazorpayCheckout({ keyId, providerOrderId, description, name = 'Comonn', onSuccess, onFailure, onDismiss }) {
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: providerOrderId,
    name,
    description,
    handler: onSuccess,
    modal: { ondismiss: onDismiss },
    theme: { color: '#0f172a' },
  });
  rzp.on('payment.failed', onFailure);
  rzp.open();
}
