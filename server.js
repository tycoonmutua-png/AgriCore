// ============================================================
// AGRICORE — server.js  (complete & updated with Cloudinary)
// ============================================================

const express  = require("express");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const cors     = require("cors");
const axios    = require("axios");
const multer   = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve static files (HTML pages) ────────────────────────
const path = require("path");
app.use(express.static(path.join(__dirname)));

// ── Cloudinary Config ───────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "agricore-products",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ============================================================
// DATABASE MODELS
// ============================================================

// ── User Model ──
const UserSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, default: "" },
  role:     { type: String, default: "customer" },
  googleId: { type: String, default: "" },
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

// ── Product Model ──
const ProductSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  price:       { type: Number, required: true },
  stock:       { type: Number, default: 0 },
  category:    { type: String, default: "General" },
  image:       { type: String, default: "" },
  description: { type: String, default: "" },
  unit:        { type: String, default: "unit" },
}, { timestamps: true });

const Product = mongoose.model("Product", ProductSchema);

// ── Order Model ──
const OrderSchema = new mongoose.Schema({
  customer: {
    name:  String,
    email: String,
    phone: String,
  },
  items: [{
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    price:       Number,
    quantity:    Number,
  }],
  totalAmount:   { type: Number, required: true },
  paymentStatus: { type: String, default: "pending" },
  paymentMethod: { type: String, default: "mpesa-stk" },
  mpesaCode:     { type: String, default: "" },
  status:        { type: String, default: "pending" },
}, { timestamps: true });

const Order = mongoose.model("Order", OrderSchema);

// ============================================================
// HELPERS
// ============================================================

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

const protect = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "Not logged in" });
  try {
    req.user = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin only" });
  next();
};

// ============================================================
// IMAGE UPLOAD ROUTE
// ============================================================

app.post("/api/upload", protect, adminOnly, upload.single("image"), (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    // Cloudinary gives back the full https:// URL
    res.json({
      imageUrl: req.file.path,
      message:  "Image uploaded to Cloudinary successfully",
    });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ============================================================
// AUTH ROUTES
// ============================================================

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed });

    res.status(201).json({
      token: generateToken(user),
      name:  user.name,
      email: user.email,
      role:  user.role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({
      token: generateToken(user),
      name:  user.name,
      email: user.email,
      role:  user.role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Google Login
app.post("/api/auth/google", async (req, res) => {
  try {
    const { access_token } = req.body;
    const { data } = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const { email, name, sub } = data;

    let user = await User.findOne({ email });
    if (!user)
      user = await User.create({ name, email, googleId: sub, role: "customer" });

    res.json({
      token: generateToken(user),
      name:  user.name,
      email: user.email,
      role:  user.role,
    });
  } catch (err) {
    res.status(500).json({ message: "Google login failed" });
  }
});

// ============================================================
// PRODUCT ROUTES
// ============================================================

// Get all products — public
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add product — admin only
app.post("/api/products", protect, adminOnly, async (req, res) => {
  try {
    const { name, price, stock, category, image, description, unit } = req.body;
    if (!name || price == null)
      return res.status(400).json({ message: "Name and price are required" });

    const product = await Product.create({
      name, price,
      stock:       stock       || 0,
      category:    category    || "General",
      image:       image       || "",
      description: description || "",
      unit:        unit        || "unit",
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update product — admin only
app.put("/api/products/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!product)
      return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete product — admin only (also removes from Cloudinary)
app.delete("/api/products/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });

    // Delete from Cloudinary if image exists
    if (product.image && product.image.includes("cloudinary.com")) {
      // Extract public_id from URL
      const parts   = product.image.split("/");
      const file    = parts[parts.length - 1].split(".")[0];
      const folder  = parts[parts.length - 2];
      const publicId = `${folder}/${file}`;
      await cloudinary.uploader.destroy(publicId);
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ORDER ROUTES
// ============================================================

// Place order
app.post("/api/orders", protect, async (req, res) => {
  try {
    const {
      customer, items, totalAmount,
      paymentStatus, paymentMethod, mpesaCode, status
    } = req.body;

    if (!customer || !items || !totalAmount)
      return res.status(400).json({ message: "Missing order details" });

    const order = await Order.create({
      customer,
      items,
      totalAmount,
      paymentStatus: paymentStatus || "pending",
      paymentMethod: paymentMethod || "mpesa-stk",
      mpesaCode:     mpesaCode     || "",
      status:        status        || "pending",
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get my orders
app.get("/api/orders/my", protect, async (req, res) => {
  try {
    const orders = await Order.find({ "customer.email": req.user.email })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all orders — admin only
app.get("/api/orders/all", protect, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update order — admin only
app.patch("/api/orders/:id", protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    );
    if (!order)
      return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// M-PESA ROUTES
// ============================================================

const getMpesaToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const { data } = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return data.access_token;
};

// STK Push
app.post("/api/mpesa/pay", protect, async (req, res) => {
  try {
    const { phone, amount, orderId } = req.body;
    const formattedPhone = phone.replace(/\s/g, "").startsWith("0")
      ? "254" + phone.replace(/\s/g, "").slice(1)
      : phone.replace(/\s/g, "");

    const token     = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password  = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   "CustomerPayBillOnline",
        Amount:            Math.ceil(amount),
        PartyA:            formattedPhone,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       formattedPhone,
        CallBackURL:       `${process.env.CALLBACK_URL}/api/mpesa/callback`,
        AccountReference:  "Agricore",
        TransactionDesc:   "Farm supplies payment",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ message: "Payment prompt sent. Enter your M-Pesa PIN." });
  } catch (err) {
    console.error("STK Push error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment request failed. Try again." });
  }
});

// M-Pesa Callback
app.post("/api/mpesa/callback", async (req, res) => {
  try {
    const result = req.body.Body?.stkCallback;
    if (result?.ResultCode === 0) {
      const mpesaCode = result.CallbackMetadata?.Item?.find(
        i => i.Name === "MpesaReceiptNumber"
      )?.Value;
      console.log("✅ M-Pesa payment confirmed:", mpesaCode);
    } else {
      console.log("❌ M-Pesa payment failed:", result?.ResultDesc);
    }
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// USER ROUTES — Admin only
// ============================================================

app.get("/api/users", protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Agricore server is running" });
});

// ── Keep Alive ──────────────────────────────────────────────
const RENDER_URL = process.env.RENDER_URL || "";
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${RENDER_URL}/api/health`);
      console.log("🏓 Keep-alive ping sent");
    } catch (err) {
      console.log("⚠️ Keep-alive failed:", err.message);
    }
  }, 10 * 60 * 1000);
}

// ============================================================
// START SERVER
// ============================================================

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(process.env.PORT || 5001, () => {
      console.log(`🚀 Agricore server running on port ${process.env.PORT || 5001}`);
      console.log(`   Open: http://localhost:${process.env.PORT || 5001}/index.html`);
    });
  })
  .catch(err => console.log("❌ DB Error:", err.message));