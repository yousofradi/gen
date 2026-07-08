const mongoose = require('mongoose');

// Define Schema locally for the seed script
const shippingSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  fee: { type: Number, required: true, default: 0 },
  zones: [{ type: String }]
}, { timestamps: true });

async function seedShipping() {
  require('dotenv').config();
  const MONGODB_URI = process.env.DB_URI;
  if (!MONGODB_URI) {
    console.error('ERROR: DB_URI not found in .env');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.useDb('ecommerce');
  const Shipping = db.model('Shipping', shippingSchema, 'shippings');

  // New Data from User (Sample - User should provide full JSON if needed)
  const newData = [
    {
      city: 'Alexandria',
      fee: 85,
      zones: [
        'Abu Yousef',
        'Qetaa ElTarik ElSahrawi',
        'Agami',
        'Amreya',
        'Anfoushi',
        'Asafra',
        'Attarin',
        'Azarita',
        'Bacchus',
        'Bolkly',
        'Burg El Arab',
        'Camp Caesar',
        'Cleopatra',
        'Dekheila',
        'Fleming',
        'Gianaclis',
        'Glim',
        'Hadara',
        'Ibrahimeya',
        'Kabbary',
        'Kafr Abdu',
        'Karmouz',
        'Kom El Dikka',
        'Labban',
        'Laurent',
        'Maamoura',
        'Mandara',
        'Mansheya',
        'Miami',
        'Moharem Bek',
        'Montaza',
        'Nakhl',
        'Nozha',
        'Old San Stefano',
        'Raml Station',
        'Roshdy',
        'Saba Pasha',
        'San Stefano',
        'Shatby',
        'Siouf',
        'Smouha',
        'Sporting',
        'Stanley',
        'Victoria',
        'Wardian',
        'Zizinia'
      ]
    },
    { city: 'Cairo', fee: 85, zones: ['Maadi', 'Nasr City', 'Heliopolis', 'Zamalek', 'Tagamoa'] },
    { city: 'Giza', fee: 85, zones: ['Dokki', 'Mohandessin', 'Haram', 'Faisal', '6th of October'] }
  ];

  await Shipping.deleteMany({});
  await Shipping.insertMany(newData);
  console.log('Hierarchical shipping data seeded successfully!');
  process.exit(0);
}

seedShipping().catch(err => {
  console.error(err);
  process.exit(1);
});
