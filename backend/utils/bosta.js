const axios = require('axios');
const Setting = require('../models/Setting');
const Shipping = require('../models/Shipping');

const BOSTA_API_URL = 'https://api.bosta.co/api/v2';

async function createBostaDelivery(order) {
  try {
    const config = await Setting.findOne({ key: 'bosta_config' });
    if (!config || !config.value || !config.value.apiKey) {
      console.warn('Bosta API Key not found in settings, skipping delivery creation');
      return null;
    }

    const { apiKey, city, districtId, firstLine, buildingNumber, floor, apartment } = config.value;

    if (!city || !districtId || !firstLine) {
      console.warn('Bosta store address (city, districtId, firstLine) not fully configured, skipping delivery creation');
      return { error: 'Bosta address not configured' };
    }

    const storeAddress = {
      city: city,
      district: districtId,
      firstLine: firstLine,
      buildingNumber: buildingNumber,
      floor: floor,
      apartment: apartment
    };

    // Resolve Bosta IDs for drop-off
    const shippingRecord = await Shipping.findOne({ city: order.customer.government });
    const bostaCityId = shippingRecord ? shippingRecord.bostaCityId : order.customer.government;

    let bostaZoneId = order.customer.zone;
    if (shippingRecord && shippingRecord.zones) {
      const zoneRecord = shippingRecord.zones.find(z => z.name === order.customer.zone || z.otherName === order.customer.zone);
      if (zoneRecord && zoneRecord.bostaZoneId) {
        bostaZoneId = zoneRecord.bostaZoneId;
      }
    }

    const payload = {
      type: 10, // Package Delivery
      specs: {
        packageDetails: {
          itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
          description: order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
        }
      },
      pickupAddress: storeAddress,
      returnAddress: storeAddress,
      dropOffAddress: {
        city: bostaCityId,
        zone: bostaZoneId,
        district: bostaZoneId,
        firstLine: order.customer.address
      },
      receiver: {
        firstName: order.customer.name.split(' ')[0],
        lastName: order.customer.name.split(' ').slice(1).join(' ') || 'Customer',
        phone: order.customer.phone
      },
      isConsigneeReschedule: true,
      notes: 'برجاء الاتصال قبل الوصول',
      cod: (function() {
        const remaining = order.totalPrice - (order.paidAmount || 0);
        return remaining > 0 ? remaining + 10 : 0;
      })()
    };

    const response = await axios.post(`${BOSTA_API_URL}/deliveries`, payload, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });

    return {
      deliveryId: response.data._id,
      trackingNumber: response.data.trackingNumber
    };
  } catch (err) {
    const errorData = err.response ? err.response.data : err.message;
    console.error('Bosta API Error:', errorData);
    // Don't throw, just return null so the order update doesn't crash
    return { error: errorData.message || err.message };
  }
}

module.exports = { createBostaDelivery };
