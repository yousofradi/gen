const mongoose = require('mongoose');
const Order = require('./models/Order');

async function check() {
  try {
    const uri = 'mongodb+srv://yousofradi:yousof9009@cluster0.p4a1m.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=Cluster0';
    console.log('Connecting to Atlas...');
    await mongoose.connect(uri);
    console.log('Connected!');
    const order = await Order.findOne({ 'customer.phone': '01017277326' });
    console.log(JSON.stringify(order, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
