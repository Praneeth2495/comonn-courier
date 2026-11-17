import { useState } from 'react';
import client from '../api/client';
import { formatDateTime } from '../utils/dateFormat';

/**
 * Chat-bubble rendering of a WhatsApp conversation (both directions) plus a
 * reply box — shared by the admin WhatsApp inbox (WhatsappInboxPanel.jsx)
 * and the order detail modal's WhatsApp section, so the bubble styling and
 * send logic only live in one place. `phone` is required (identifies the
 * conversation); `orderId` is optional and just gets attached to whatever
 * reply is sent, for the inbox's "jump to order" convenience later.
 */
export default function WhatsappThread({ phone, orderId, messages, onSent }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    if (!body.trim() || !phone) return;
    setSending(true);
    setError('');
    try {
      const { data } = await client.post(`/admin/whatsapp/conversations/${phone}/replies`, {
        body: body.trim(),
        orderId: orderId || undefined,
      });
      setBody('');
      onSent?.(data.reply);
    } catch (err) {
      // A failed send still gets logged server-side (status "failed") and
      // returned on err.response.data.reply — surface it the same way a
      // successful one would so the thread doesn't just silently drop it.
      if (err.response?.data?.reply) onSent?.(err.response.data.reply);
      setError(err.response?.data?.error || 'Could not send this message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wa-thread">
      <div className="wa-thread-messages">
        {(!messages || messages.length === 0) && (
          <p style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>No messages yet.</p>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`wa-bubble ${m.direction === 'OUT' ? 'out' : 'in'} ${m.status === 'failed' ? 'failed' : ''}`}>
            <p>{m.body}</p>
            <span className="wa-bubble-meta">
              {m.direction === 'OUT' && m.sentBy?.fullName ? `${m.sentBy.fullName} · ` : ''}
              {formatDateTime(m.createdAt)}
              {m.status === 'failed' ? ' · failed to send' : ''}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="wa-thread-replybox">
        <textarea
          className="input"
          placeholder="Type a reply…"
          rows={2}
          style={{ resize: 'vertical', flex: 1 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={!body.trim() || sending} style={{ flex: 'none' }}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
      {error && <div className="error-text" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
