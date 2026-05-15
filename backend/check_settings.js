const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function checkSettings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Setting = mongoose.model('Setting', new mongoose.Schema({ key: String, value: Object }));
    const setting = await Setting.findOne({ key: 'sundura_global_settings' });
    console.log('Settings:', JSON.stringify(setting, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSettings();
