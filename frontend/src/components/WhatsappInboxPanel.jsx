import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import WhatsappThread from './WhatsappThread';
import { formatDateTime } from '../utils/dateFormat';

/**
 * Admin WhatsApp inbox — one conversation per phone number that has ever
 * sent/received a freeform message, polled the same way every other admin
 * panel refreshes its list (StorageAdminPanel.jsx/RidersPanel.jsx).
 */
export default function WhatsappInboxPanel() {
  const [conversations, setConversations] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  function loadConversations(silent) {
    client.get('/admin/whatsapp/conversations').then(({ data }) => setConversations(data.conversations)).catch(() => {
      if (!silent) setConversations([]);
    });
  }
  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => loadConversations(true), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  function loadThread(phone) {
    setSelectedPhone(phone);
    setLoadingThread(true);
    client.get(`/admin/whatsapp/conversations/${phone}`).then(({ data }) => setThread(data)).finally(() => setLoadingThread(false));
  }

  function onSent(reply) {
    setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, reply] } : prev));
    loadConversations(true);
  }

  if (conversations === null) return <LoadingLogo />;

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 4 }}>WhatsApp</h1>
      <p className="lead" style={{ marginBottom: 16 }}>Customer replies to order notifications, and your own replies back.</p>

      <div className="wa-inbox-layout">
        <div className="wa-inbox-list card">
          {conversations.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', padding: 16 }}>No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.phone}
                className={`wa-inbox-row ${selectedPhone === c.phone ? 'active' : ''}`}
                onClick={() => loadThread(c.phone)}
              >
                <div className="wa-inbox-row-top">
                  <span className="wa-inbox-row-name">{c.customerName || c.phone}</span>
                  {c.needsReply && <span className="wa-inbox-dot" aria-label="Needs reply" />}
                </div>
                <div className="wa-inbox-row-preview">{c.lastMessage.direction === 'OUT' ? 'You: ' : ''}{c.lastMessage.body}</div>
                <div className="wa-inbox-row-time">{formatDateTime(c.lastMessage.createdAt)}</div>
              </button>
            ))
          )}
        </div>

        <div className="wa-inbox-thread card">
          {!selectedPhone ? (
            <p style={{ fontSize: 13, color: 'var(--slate-light)' }}>Select a conversation to view and reply.</p>
          ) : loadingThread || !thread ? (
            <LoadingLogo size={36} />
          ) : (
            <>
              <div className="wa-inbox-thread-head">
                <div>
                  <h3 style={{ fontSize: 15 }}>{thread.customerName || thread.phone}</h3>
                  <span style={{ fontSize: 11.5, color: 'var(--slate-light)' }}>{thread.phone}</span>
                </div>
                {thread.order && <span className="pill pill-cobalt">Order {thread.order.orderNumber}</span>}
              </div>
              <WhatsappThread phone={thread.phone} orderId={thread.order?.id} messages={thread.messages} onSent={onSent} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
