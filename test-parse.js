const fs = require('fs');
const path = require('path');

const filePath = 'Shipment.txt';
if (!fs.existsSync(filePath)) {
  console.log('Shipment.txt not found');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const sourceData = rawData[0].data;

console.log(`Total cities: ${sourceData.length}`);
console.log('Sample city:', sourceData[0].cityName);
console.log('Sample city other name:', sourceData[0].cityOtherName);
console.log('Zones in first city:', sourceData[0].districts.length);
console.log('Sample zone:', sourceData[0].districts[0].districtOtherName);
