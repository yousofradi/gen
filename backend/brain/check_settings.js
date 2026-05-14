const mongoose = require('mongoose');
require('dotenv').config({ path: 'backend/.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Setting = require('./backend/models/Setting');
  const adminSettings = await Setting.findOne({ key: 'admin_global_settings' });
  const sunduraSettings = await Setting.findOne({ key: 'sundura_global_settings' });
  console.log('--- ADMIN SETTINGS ---');
  console.log(JSON.stringify(adminSettings ? adminSettings.value : {}, null, 2));
  console.log('--- SUNDURA SETTINGS ---');
  console.log(JSON.stringify(sunduraSettings ? sunduraSettings.value : {}, null, 2));
  process.exit(0);
}

check();
