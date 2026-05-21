const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const adminAuth = require('../middleware/adminAuth');

// ── Storage Configuration ────────────────────────────────

// Check for Cloudinary credentials
const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                               process.env.CLOUDINARY_API_KEY && 
                               process.env.CLOUDINARY_API_SECRET;

let storage;

if (isCloudinaryConfigured) {
  // Cloudinary Storage (Persistent)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'ecommerce-uploads',
      format: async (req, file) => 'webp',
      allowed_formats: ['jpg', 'png', 'gif', 'webp', 'jpeg'],
      public_id: (req, file) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        return uniqueSuffix;
      }
    }
  });
  console.log('✅ Upload: Using Cloudinary storage');
} else {
  // Local Disk Storage (Fallback - NOT persistent on ephemeral platforms)
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  console.log('⚠️ Upload: Cloudinary not configured, using local disk storage');
}

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ── Routes ───────────────────────────────────────────────

// POST /api/upload — upload a single image
router.post('/', adminAuth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // For Cloudinary, req.file.path is the URL
    // For local, we construct the URL
    let imageUrl = req.file.path;
    
    if (isCloudinaryConfigured) {
      const { optimizeCloudinaryUrl } = require('../utils/cloudinary');
      imageUrl = optimizeCloudinaryUrl(imageUrl);
    } else {
      const host = req.get('host');
      // Force https if we are on render or if the host suggests it
      const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
      const finalProtocol = (host.includes('render.com') || host.includes('onrender.com')) ? 'https' : protocol;
      imageUrl = `${finalProtocol}://${host}/uploads/${req.file.filename}`;
    }
    
    res.json({ 
      url: imageUrl,
      filename: req.file.filename || req.file.public_id
    });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;
