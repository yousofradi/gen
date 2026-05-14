const Collection = require('../models/Collection');

exports.getCollections = async (req, res) => {
  try {
    const collections = await Collection.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCollection = async (req, res) => {
  try {
    const { id } = req.params;
    let collection;
    
    // Check if ID is a valid MongoDB ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      collection = await Collection.findById(id).lean();
    } else {
      // Otherwise search by handle/urlName
      collection = await Collection.findOne({ urlName: id }).lean();
    }

    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json(collection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createCollection = async (req, res) => {
  try {
    const collection = new Collection(req.body);
    await collection.save();
    res.status(201).json(collection);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateCollection = async (req, res) => {
  try {
    const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json(collection);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteCollectionsBatch = async (req, res) => {
  try {
    const { collectionIds } = req.body;
    if (!Array.isArray(collectionIds)) return res.status(400).json({ error: 'collectionIds must be an array' });
    
    await Collection.deleteMany({ _id: { $in: collectionIds } });
    res.json({ message: 'Collections deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.reorderCollectionsBatch = async (req, res) => {
  try {
    const { order } = req.body;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'order array is required' });
    }
    const ops = order.map(item => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: item.sortOrder } }
      }
    }));
    await Collection.bulkWrite(ops);
    res.json({ message: 'Collections reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder collections' });
  }
};
