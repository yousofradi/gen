require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Shipping = require('../models/Shipping');

const filePath = path.join(__dirname, '../../Shipment.txt');

async function run() {
  try {
    const uri = process.env.DB_URI || 'mongodb+srv://yousofradi:yousof9009@cluster0.p4a1m.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=Cluster0';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const rawData = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(rawData);
    
    // The file seems to be an array with one large object containing 'data'
    const citiesData = json[0].data;

    console.log(`Processing ${citiesData.length} cities...`);

    for (const city of citiesData) {
      const { cityName, cityOtherName, cityId, districts } = city;
      
      const zones = districts.map(d => ({
        name: d.zoneName,
        otherName: d.zoneOtherName,
        districtOtherName: d.districtOtherName,
        bostaZoneId: d.zoneId,
        bostaAvailable: d.dropOffAvailability !== false
      }));

      // Try to find existing city to preserve fee
      let existing = await Shipping.findOne({ city: cityName });
      
      if (existing) {
        existing.cityOtherName = cityOtherName;
        existing.bostaCityId = cityId;
        existing.zones = zones;
        await existing.save();
        console.log(`Updated city: ${cityName}`);
      } else {
        await Shipping.create({
          city: cityName,
          cityOtherName: cityOtherName,
          bostaCityId: cityId,
          fee: 65, // Default fee if new
          zones: zones
        });
        console.log(`Created city: ${cityName}`);
      }
    }

    console.log('Finished importing shipping data.');
    process.exit(0);
  } catch (err) {
    console.error('Error during import:', err);
    process.exit(1);
  }
}

run();
