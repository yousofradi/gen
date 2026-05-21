const cloudinary = require('cloudinary').v2;

// Check for Cloudinary credentials
const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                               process.env.CLOUDINARY_API_KEY && 
                               process.env.CLOUDINARY_API_SECRET;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

/**
 * Uploads an image from a URL or Local Path to Cloudinary
 * @param {string} source - URL or local file path
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<string>} - The uploaded image URL
 */
async function uploadToCloudinary(source, folder = 'ecommerce-products') {
  if (!isCloudinaryConfigured) {
    console.warn('⚠️ Cloudinary not configured, returning original source');
    return source;
  }

  try {
    const result = await cloudinary.uploader.upload(source, {
      folder: folder,
      resource_type: 'auto',
      format: 'webp'
    });
    
    let finalUrl = result.secure_url;
    // Force the URL to end in .webp explicitly
    finalUrl = finalUrl.replace(/\.(png|jpe?g|gif)$/i, '.webp');
    // Ensure f_auto and q_auto are applied
    return optimizeCloudinaryUrl(finalUrl);
  } catch (err) {
    console.error('❌ Cloudinary Upload Error:', err);
    return source; // Fallback to original
  }
}

/**
 * Checks if a URL is from Google Drive
 * @param {string} url 
 * @returns {boolean}
 */
function isDriveUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('drive.google.com') || url.includes('googleusercontent.com');
}

/**
 * Injects f_auto and q_auto into a Cloudinary URL for optimal compression.
 * @param {string} url - The original Cloudinary image URL.
 * @returns {string} - The optimized URL.
 */
function optimizeCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  // Check if it's actually a Cloudinary URL and doesn't already have the flags
  if (url.includes('res.cloudinary.com') && !url.includes('f_auto') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto/');
  }
  
  return url;
}

module.exports = {
  uploadToCloudinary,
  isDriveUrl,
  isCloudinaryConfigured,
  optimizeCloudinaryUrl
};
