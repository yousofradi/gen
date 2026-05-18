const axios = require('axios');
const Setting = require('../models/Setting');
const Shipping = require('../models/Shipping');

const BOSTA_API_URL = 'https://api.bosta.co/api/v2';

const normalizeString = (str) => {
  if (!str) return '';
  return str
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
};

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

  // Resolve Bosta IDs for drop-off using flexible city lookup with normalization
  const shippings = await Shipping.find({});
  const normalizedGov = normalizeString(order.customer.government);
  const shippingRecord = shippings.find(s => {
    return normalizeString(s.city) === normalizedGov || normalizeString(s.cityOtherName) === normalizedGov;
  });
  const bostaCityId = shippingRecord ? shippingRecord.bostaCityId : order.customer.government;

  const normalizePhone = (p) => {
    if (!p) return '';
    let cleaned = p.replace(/\D/g, ''); // keep only digits
    if (cleaned.startsWith('20') && cleaned.length > 11) {
      cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('2') && cleaned.length > 11) {
      cleaned = cleaned.substring(1);
    }
    return cleaned;
  };

  let bostaZoneId = order.customer.zone;
  let bostaDistrictId = order.customer.zone;
  if (shippingRecord && shippingRecord.zones) {
    const formatZoneName = (z) => {
      const zName = z.zoneOtherName || z.name || '';
      const dName = z.districtOtherName || z.districtName || '';
      return zName === dName ? zName : `${zName} - ${dName}`;
    };

    const normalizedTarget = normalizeString(order.customer.zone);
    const targetParts = (order.customer.zone || '').split('-').map(p => normalizeString(p));

    const zoneRecord = shippingRecord.zones.find(z => {
      const compound = formatZoneName(z);
      return normalizeString(z.name) === normalizedTarget ||
        normalizeString(z.otherName) === normalizedTarget ||
        normalizeString(z.zoneName) === normalizedTarget ||
        normalizeString(z.zoneOtherName) === normalizedTarget ||
        normalizeString(compound) === normalizedTarget ||
        targetParts.some(part =>
          normalizeString(z.name) === part ||
          normalizeString(z.otherName) === part ||
          normalizeString(z.zoneName) === part ||
          normalizeString(z.zoneOtherName) === part ||
          normalizeString(compound) === part
        );
    });

    if (zoneRecord) {
      if (zoneRecord.bostaZoneId) {
        bostaZoneId = zoneRecord.bostaZoneId;
      }
      bostaDistrictId = zoneRecord.bostaDistrictId || zoneRecord.bostaZoneId || bostaZoneId;
    }
  }

  const dropOffAddress = {
    city: bostaCityId,
    zoneId: bostaZoneId,
    districtId: bostaDistrictId,
    firstLine: order.customer.address
  };

  return {
    type: 10, // Package Delivery
    specs: {
      packageDetails: {
        itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
        description: order.items.map(i => `${i.name}  ( ${i.quantity} )`).join(' , ')
      }
    },
    goodsInfo: {
      amount: Math.max(0, order.totalPrice - (order.shippingFee || 0))
    },
    pickupAddress: storeAddress,
    returnAddress: storeAddress,
    dropOffAddress: dropOffAddress,
    receiver: {
      firstName: order.customer.name.split(' ')[0] || 'Customer',
      lastName: order.customer.name.split(' ').slice(1).join(' ') || 'Customer',
      phone: normalizePhone(order.customer.phone),
      ...(order.customer.secondPhone ? { secondPhone: normalizePhone(order.customer.secondPhone) } : {})
    },
    isConsigneeReschedule: true,
    notes: 'يرجى التواصل مع العميل قبل التحرك  - قابل للكسر',
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
    const errorData = err.response ? err.response.data : null;
    console.error('Bosta Bulk API Error:', errorData || err.message);
    if (errorData && errorData.message) {
      let msg = errorData.message;
      if (errorData.data && Array.isArray(errorData.data)) {
        const details = errorData.data.map(d => `${d.businessReference || `Index ${d.index}`}: ${d.errorMessage || d.message || 'Validation error'}`).join(', ');
        msg += ` -> ${details}`;
      }
      throw new Error(msg);
    }
    throw new Error(err.message);
  }
}

module.exports = { createBostaDelivery, createBulkBostaDeliveries };
