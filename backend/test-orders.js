const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  
  const allOrders = await Order.find({});
  
  const currentMonth = 6; // July is 6 in 0-indexed JS Date
  const currentYear = 2026;
  
  const julyOrders = allOrders.filter(o => {
    if (!o.createdAt) return false;
    const d = new Date(o.createdAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  
  console.log(`Found ${julyOrders.length} total orders in July 2026`);
  
  const paidJulyOrders = julyOrders.filter(o => o.paid || Number(o.paidAmount) > 0);
  console.log(`Found ${paidJulyOrders.length} paid/partially paid orders in July 2026`);
  
  // List all July orders for debugging
  console.log("--- ALL JULY ORDERS ---");
  julyOrders.forEach(o => {
    console.log(`${o.orderId} | Status: ${o.status} | Paid: ${o.paid} | PaidAmount: ${o.paidAmount} | TotalPrice: ${o.totalPrice} | ShippingFee: ${o.shippingFee} | Net: ${o.totalPrice - (o.shippingFee||0)} | Arch: ${o.archived}`);
  });
  
  mongoose.disconnect();
}

run();
