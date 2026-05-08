const mongoose = require('mongoose');
const Product = require('./backend/models/Product');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

async function check() {
  await mongoose.connect(MONGO_URI);
  const total = await Product.countDocuments();
  const withOptions = await Product.countDocuments({ options: { $exists: true, $not: { $size: 0 } } });
  const withVariants = await Product.countDocuments({ variants: { $exists: true, $not: { $size: 0 } } });
  
  console.log('Total Products:', total);
  console.log('Products with options array not empty:', withOptions);
  console.log('Products with variants array not empty:', withVariants);

  if (withOptions > 0) {
    const one = await Product.findOne({ options: { $exists: true, $not: { $size: 0 } } });
    console.log('Example product with options:', one.name, JSON.stringify(one.options));
  }

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
