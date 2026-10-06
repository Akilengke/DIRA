// DIRA Kaa-Rada - Web Push & Background Notification Service Worker
// Enables receiving incoming calls and chat messages even when the app is closed on phones

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'DIRA Alert',
        body: event.data.text(),
      };
    }
  }

  const isCall = data.type === 'CALL_INVITE';
  const title = data.title || (isCall ? '📞 Incoming Call - DIRA' : '💬 DIRA Message');
  const body = data.body || (isCall ? 'Incoming call. Tap to answer.' : 'You have a new message.');
  
  const options = {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    vibrate: data.vibrate || (isCall ? [500, 250, 500, 250, 500, 250, 500] : [250, 100, 250]),
    tag: data.tag || (data.callId ? `dira-call-${data.callId}` : `dira-msg-${Date.now()}`),
    renotify: true,
    requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : isCall,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: data.url || (data.callId ? `/?callId=${data.callId}&action=answer` : (data.channelId ? `/?channel=${data.channelId}` : '/')),
      callId: data.callId,
      channelId: data.channelId,
      type: data.type,
      ...data,
    },
    actions: data.actions || (isCall ? [
      { action: 'answer', title: '🟢 Answer Call' },
      { action: 'decline', title: '🔴 Decline' }
    ] : [
      { action: 'open_chat', title: '💬 Open Chat' }
    ]),
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';

  // If user tapped Decline on an incoming call:
  if (event.action === 'decline' && data.callId) {
    event.waitUntil(
      fetch('/api/calls/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: data.callId, reason: 'rejected' })
      }).catch((e) => console.warn('Failed to decline call from notification:', e))
    );
    return;
  }

  // If user tapped Answer or clicked the notification body for a call:
  if ((event.action === 'answer' || !event.action) && data.callId) {
    targetUrl = `/?callId=${data.callId}&action=answer`;
  } else if ((event.action === 'open_chat' || !event.action) && data.channelId) {
    targetUrl = `/?channel=${data.channelId}`;
  }

  // Focus existing open window or launch new window on phone
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    fetch('/api/push/vapid-public-key')
      .then(res => res.json())
      .then(keyData => {
        if (!keyData.publicKey) return;
        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyData.publicKey,
        });
      })
      .then(sub => {
        if (!sub) return;
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub })
        });
      })
      .catch(err => console.warn('[SW] Subscription renewal failed:', err))
  );
});
