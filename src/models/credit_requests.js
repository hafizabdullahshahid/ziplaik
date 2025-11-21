const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const schema = new mongoose.Schema({
    user_id: { type: ObjectId, required: true, ref: 'users' },
    transaction_id: { type: String, required: true },
    customer_id: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, required: true },
    metadata: { type: Object },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('credit_requests', schema);