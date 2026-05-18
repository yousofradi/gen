const mongoose = require('mongoose');
const Setting = require('./models/Setting');

async function check() {
  try {
    const uri = 'mongodb+srv://yousofradi:yousof9009@cluster0.p4a1m.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    const settings = await Setting.findOne({ key: 'shipping_options' });
    console.log(JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
