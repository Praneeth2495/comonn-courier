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
// WhatsApp only allows a business-initiated freeform reply within 24h of
// the customer's own last message (outside that, Gupshup rejects the
// send) — mirrors getSessionState in whatsappConversation.controller.js.
// Computed from `messages` here rather than passed down as a prop so both
// callers (the inbox panel and the order detail modal) get the same
// disabled-input behavior without either having to compute it themselves;
// the backend still enforces this independently on send.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function WhatsappThread({ phone, orderId, messages, onSent }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const lastInbound = messages?.filter((m) => m.direction === 'IN').slice(-1)[0];
  const sessionExpiresAt = lastInbound ? new Date(new Date(lastInbound.createdAt).getTime() + SESSION_WINDOW_MS) : null;
  const canReply = !!sessionExpiresAt && sessionExpiresAt > new Date();

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
        {messages?.map((m) => {
          const attachmentUrl = m.messageType && m.messageType !== 'text'
            ? `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/whatsapp/conversations/${phone}/replies/${m.id}/attachment`
            : null;
          return (
          <div key={m.id} className={`wa-bubble ${m.direction === 'OUT' ? 'out' : 'in'} ${m.status === 'failed' ? 'failed' : ''}`}>
            {m.messageType === 'image' && (
              <img
                src={attachmentUrl}
                alt={m.attachmentFileName || 'Image'}
                style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', marginBottom: m.body ? 6 : 0 }}
              />
            )}
            {attachmentUrl && m.messageType !== 'image' && (
              <a
                className="btn btn-outline btn-sm"
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                style={{ marginBottom: m.body ? 6 : 0 }}
              >
                View {m.messageType === 'file' ? 'document' : m.messageType}{m.attachmentFileName ? ` — ${m.attachmentFileName}` : ''}
              </a>
            )}
            {m.body && <p>{m.body}</p>}
            <span className="wa-bubble-meta">
              {m.direction === 'OUT' && m.sentBy?.fullName ? `${m.sentBy.fullName} · ` : ''}
              {formatDateTime(m.createdAt)}
              {m.status === 'failed' ? ' · failed to send' : ''}
            </span>
          </div>
        ))}
      </div>

      {!canReply && (
        <p className="wa-thread-window-note">
          {lastInbound
            ? `This conversation's 24-hour reply window closed ${formatDateTime(sessionExpiresAt)}. The customer needs to message again before you can reply.`
            : 'Waiting for the customer to message first — a freeform reply can only be sent within 24 hours of their own message.'}
        </p>
      )}
      <form onSubmit={send} className="wa-thread-replybox">
        <textarea
          className="input"
          placeholder={canReply ? 'Type a reply…' : 'Reply window closed'}
          rows={2}
          style={{ resize: 'vertical', flex: 1 }}
          value={body}
          disabled={!canReply}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={!canReply || !body.trim() || sending} style={{ flex: 'none' }}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
      {error && <div className="error-text" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
