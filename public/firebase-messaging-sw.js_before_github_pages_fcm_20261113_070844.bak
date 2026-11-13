importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyDi3BZwW1Bj9q-l5aifdetKGrIpIZXw79I",
  authDomain: "cashtube-1679a.firebaseapp.com",
  projectId: "cashtube-1679a",
  storageBucket: "cashtube-1679a.firebasestorage.app",
  messagingSenderId: "453269438044",
  appId: "1:453269438044:web:6290085ed840a19d677099"
});

const messaging = firebase.messaging();

messaging.setBackgroundMessageHandler(function(payload) {
  const title = (payload.notification && payload.notification.title) || 'CashTube';
  const options = {
    body: (payload.notification && payload.notification.body) || 'CashTube မှ အသိပေးချက်အသစ် ရှိပါတယ်။',
    icon: '/favicon.ico',
    data: {
      url: (payload.data && payload.data.url) || '/'
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }

        return clients.openWindow(targetUrl);
      })
  );
});
