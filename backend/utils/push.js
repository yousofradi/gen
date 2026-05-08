const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { publicKey, privateKey } = require('../config/notifications');

webpush.setVapidDetails(
  'mailto:support@sundura.com',
  publicKey,
  privateKey
);

async function sendPushToAdmins(payloadData) {
  try {
    const subscriptions = await PushSubscription.find();
    const payload = JSON.stringify(payloadData);

    await Promise.all(
      subscriptions.map(sub => 
        webpush.sendNotification(sub.subscription, payload)
          .catch(err => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              return PushSubscription.deleteOne({ _id: sub._id });
            }
            console.error('Push error for sub:', sub._id, err.message);
          })
      )
    );
  } catch (err) {
    console.error('Global push notification error:', err);
  }
}

module.exports = { sendPushToAdmins };
