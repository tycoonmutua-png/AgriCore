const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI);

const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));

async function fixImages() {
  const products = await Product.find({});
  
  for (const product of products) {
    if (product.image && product.image.includes('localhost:5001/images/')) {
      const filename = product.image.split('/images/')[1]; // extract e.g. "spinach.jpeg"
      product.image = `/images/${filename}`; // relative path
      await product.save();
      console.log(`Fixed: ${filename}`);
    }
  }

  console.log('Done!');
  mongoose.disconnect();
}

fixImages();