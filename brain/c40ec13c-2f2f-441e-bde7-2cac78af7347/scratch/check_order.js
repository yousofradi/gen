const mongoose = require('mongoose');
const Order = require('../backend/models/Order');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/ecommerce');
  const order = await Order.findOne({ 'customer.phone': '01017277326' });
  console.log(JSON.stringify(order, null, 2));
  await mongoose.disconnect();
}

check();
