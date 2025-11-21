const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    paddle_customer_id: { type: String, default: null },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    token: { type: String, default: null },
    credits: { type: Number, default: Number(process.env.DEFAULT_CREDITS || 0) },
    saved_resume_file: { type: Object, default: null },
    saved_resume_text: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('users', userSchema);