const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    data: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('api_logs', schema);