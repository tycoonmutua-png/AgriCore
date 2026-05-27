require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");

cloudinary.config({
  cloud_name: "dd1p7kcvz",
  api_key: "247165752669976",
  api_secret: "tYKqia1bjdP3wPIny-INnwbjH94",
});

const Product = mongoose.model("Product", new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const result = await cloudinary.api.resources({
    type: "upload",
    prefix: "agrigo/products/",
    max_results: 500,
  });

  const resources = result.resources;
  console.log("Found " + resources.length + " images in Cloudinary");

  const products = await Product.find({});
  let updated = 0;

  for (const product of products) {
    // Remove size/quantity in brackets e.g. "Mancozeb Fungicide (100g)" → "mancozeb fungicide"
    const cleanName = product.name.replace(/\s*\(.*?\)\s*/g, "").toLowerCase().trim();

    const match = resources.find(function(r) {
      const displayName = (r.display_name || r.public_id.split("/").pop()).toLowerCase().trim();
      return displayName === cleanName;
    });

    if (match) {
      await Product.findByIdAndUpdate(product._id, { image: match.secure_url });
      console.log("Updated: " + product.name);
      updated++;
    } else {
      console.log("No match: " + product.name + " (looked for: " + cleanName + ")");
    }
  }

  console.log("Done! Updated " + updated + " products");
  await mongoose.disconnect();
}

main().catch(function(err) {
  console.error("Error: " + err.message);
  process.exit(1);
});