const PUBLIC_VAPID_KEY = 'BPWeuGHolC2Mv5vI4QUf02hiK6TSWCzGrwOxhYhqaSjNvzU80G8Db8Iyye14e8EYP8Rw2x1_f0QJhx3xEa92pqM';

async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  
  // Check if already subscribed
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    console.log('Already subscribed to push');
    return;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission denied');
    return;
  }

  // Subscribe
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
    });

    // Send to backend
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': localStorage.getItem('adminKey')
      }
    });

    console.log('Push subscription successful');
  } catch (err) {
    console.error('Failed to subscribe to push', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Auto-init on settings page or dashboard
if (location.pathname.includes('settings.html') || location.pathname.includes('index.html')) {
  // Use a button to trigger for better UX/Permission compliance
  // But for now, we'll try to auto-init
  window.addEventListener('load', () => {
    // Wait a bit to not annoy user immediately
    setTimeout(initPushNotifications, 3000);
  });
}
