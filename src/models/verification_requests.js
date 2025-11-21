const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    link: { type: String, required: true },
    verification_token: { type: String, required: true },
    resend_count: { type: Number, default: 0 },
    resend_secret: { type: String, required: true },
    status: { type: String, default: "unverified" },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('verification_requests', schema);