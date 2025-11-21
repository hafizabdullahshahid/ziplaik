const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const pastGenerationsSchema = new mongoose.Schema({
    user_id: { type: ObjectId, required: true, ref: 'users' },
    title: { type: String, required: false },
    job_description: { type: String, required: true },
    resume_text: { type: String, required: true },
    cover_letter: { type: String, required: true },
    recruiter_message: { type: String, required: true },
    company_name: { type: String, required: false },
    contact_person_name: { type: String, required: false }, 
    contact_person_email: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('past_generations', pastGenerationsSchema);