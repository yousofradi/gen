const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

async function check() {
  try {
    await mongoose.connect(MONGO_URI);
    const total = await Product.countDocuments();
    const withOptions = await Product.countDocuments({ options: { $exists: true, $not: { $size: 0 } } });
    const withVariants = await Product.countDocuments({ variants: { $exists: true, $not: { $size: 0 } } });
    
    console.log('Total Products:', total);
    console.log('Products with options array not empty:', withOptions);
    console.log('Products with variants array not empty:', withVariants);

    if (total > 0) {
      console.log('\n--- Sample Products Check ---');
      const sample = await Product.find().limit(5);
      sample.forEach(p => {
        console.log(`Product: ${p.name}`);
        console.log(`- Options: ${JSON.stringify(p.options)}`);
        console.log(`- Variants: ${JSON.stringify(p.variants)}`);
        console.log('---');
      });

      const withEmptyOptions = await Product.countDocuments({ options: [] });
      const withNullOptions = await Product.countDocuments({ options: null });
      const withMissingOptions = await Product.countDocuments({ options: { $exists: false } });

      console.log('Count options is []:', withEmptyOptions);
      console.log('Count options is null:', withNullOptions);
      console.log('Count options is missing:', withMissingOptions);
    }
  } catch (e) {
    console.error('Connection or Query Error:', e);
  } finally {
    process.exit(0);
  }
}

check();
