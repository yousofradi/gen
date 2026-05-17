const axios = require('axios');
const Setting = require('../models/Setting');
const Shipping = require('../models/Shipping');

const BOSTA_API_URL = 'https://api.bosta.co/api/v2';

/** Helper to generate a single delivery payload for Bosta */
async function generateBostaPayload(order, bostaConfig) {
  const { city, districtId, firstLine, buildingNumber, floor, apartment } = bostaConfig;

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

  return {
    type: 10, // Package Delivery
    specs: {
      packageDetails: {
        itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
        description: order.items.map(i => `${i.name}  ( ${i.quantity} )`).join(' , ')
      }
    },
    goodsInfo: {
      amount: order.totalPrice
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
      phone: order.customer.phone,
      ...(order.customer.secondPhone ? { secondPhone: order.customer.secondPhone } : {})
    },
    isConsigneeReschedule: true,
    notes: 'يرجى التواصل مع العميل قبل التحرك - قابل للكسر',
    cod: (function () {
      const remaining = order.totalPrice - (order.paidAmount || 0);
      return remaining > 0 ? remaining + 10 : 0;
    })(),
    businessReference: order.orderId
  };
}

async function createBostaDelivery(order) {
  try {
    const config = await Setting.findOne({ key: 'bosta_config' });
    if (!config || !config.value || !config.value.apiKey) {
      console.warn('Bosta API Key not found in settings, skipping delivery creation');
      return null;
    }

    if (!config.value.city || !config.value.districtId || !config.value.firstLine) {
      console.warn('Bosta store address not fully configured, skipping delivery creation');
      return { error: 'Bosta address not configured' };
    }

    const payload = await generateBostaPayload(order, config.value);

    const response = await axios.post(`${BOSTA_API_URL}/deliveries`, payload, {
      headers: {
        'Authorization': config.value.apiKey,
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
    return { error: errorData.message || err.message };
  }
}

async function createBulkBostaDeliveries(orders) {
  try {
    const config = await Setting.findOne({ key: 'bosta_config' });
    if (!config || !config.value || !config.value.apiKey) {
      throw new Error('Bosta API Key not found');
    }

    const deliveries = [];
    for (const order of orders) {
      deliveries.push(await generateBostaPayload(order, config.value));
    }

    const response = await axios.post(`${BOSTA_API_URL}/deliveries/bulk`, { deliveries }, {
      headers: {
        'Authorization': config.value.apiKey,
        'Content-Type': 'application/json'
      }
    });

    // Bosta bulk response usually contains an array of results or a single object with success info
    return response.data;
  } catch (err) {
    const errorData = err.response ? err.response.data : err.message;
    console.error('Bosta Bulk API Error:', errorData);
    throw new Error(errorData.message || err.message);
  }
}

module.exports = { createBostaDelivery, createBulkBostaDeliveries };
