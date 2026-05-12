const Product = require('../models/Product');

/**
 * Adjusts stock for a product or variant.
 * @param {string} productId - The product ID.
 * @param {Array} selectedOptions - Array of {groupName, label} for variants.
 * @param {number} quantityDiff - The amount to change (negative to decrease, positive to increase).
 */
async function adjustStock(productId, selectedOptions, quantityDiff) {
  if (!quantityDiff) return;

  const product = await Product.findById(productId);
  if (!product) {
    console.error(`[Inventory] Product ${productId} not found for adjustment`);
    return;
  }

  // Handle variants if selectedOptions are provided
  if (selectedOptions && selectedOptions.length > 0) {
    if (product.variants && product.variants.length > 0) {
      // Option 1: Product has hardcoded variants
      const variant = product.variants.find(v => {
        return selectedOptions.every(so => v.combination.get(so.groupName) === so.label);
      });

      if (variant && variant.quantity !== null && variant.quantity !== undefined) {
        variant.quantity += quantityDiff;
        if (variant.quantity < 0) variant.quantity = 0;
        await product.save();
        return;
      }
    } else {
      // Option 2: Dynamic options (currently no per-option quantity in schema, 
      // but we can deduct from base product quantity if that's how it's set up)
    }
  }

  // Fallback to base product quantity
  if (product.quantity !== null && product.quantity !== undefined) {
    product.quantity += quantityDiff;
    if (product.quantity < 0) product.quantity = 0;
    await product.save();
  }
}

module.exports = { adjustStock };
