// const fp = require('fastify-plugin');
const { authenticate } = require('../middleware/authenticate');
const users = require('../models/user');
const pastGenerations = require('../models/past_generations');
const creditRequests = require('../models/credit_requests');
const verificationRequests = require('../models/verification_requests');
const { hashPassword, comparePassword } = require('../utils/hash');
const { signToken, checkIfExpiryInLessThan2Days } = require('../utils/jwt');
const joi = require('joi');
const fs = require('fs');
const crypto = require('crypto');
const { sleep, exportGenerationsCSV, sendVerificationEmailV2, addCustomerInPaymentGateway } = require('../utils/helper');
// const { Paddle, CreateCustomerRequestBody, Customer } = require('@paddle/paddle-node-sdk');

// const paddle = new Paddle(process.env.PADDLE_API_KEY);


module.exports = async function (fastify, opts) {
    // POST /api/verify
    fastify.post('/verify', async (request, reply) => {
        try {
            const validationResponse = joi.object({
                email: joi.string().max(100).email().required(),
                password: joi.string().min(8).max(100).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
            }).validate(request.body);

            if (validationResponse.error) {
                if (validationResponse.error.details[0].type === 'string.pattern.base') {
                    return reply.status(400).send({ message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.' });
                }

                //Customer email error message
                if (validationResponse.error.details[0].type === 'string.email') {
                    return reply.status(400).send({ message: 'Please provide a valid email address.' });
                }

                return reply.status(400).send({ message: validationResponse.error.details[0].message });
            }

            const { email, password } = request.body || {};

            // const normalizedEmail = String(email).toLowerCase().trim();
            const normalizedEmail = String(email).trim();

            // Try to find user
            let user = await users.findOne({ email: normalizedEmail });

            const verificationRequest = await verificationRequests.findOne({ email: normalizedEmail, status: 'unverified' });
            if (verificationRequest) {
                return reply.send({ message: 'Email verification pending. Please verify your email.', verification_request_sent: true, resend_word: verificationRequest.resend_secret });
            }

            if (!user) {
                const emailVerificationToken = `${crypto.randomUUID()}_${Math.random().toString(36).substring(2)}`;
                const verificationLink = `https://${process.env.HOST}/email/verification?email=${encodeURIComponent(normalizedEmail)}&token=${encodeURIComponent(emailVerificationToken)}`;

                const passwordHash = await hashPassword(password);

                const resendSecret = `${normalizedEmail}_${crypto.randomBytes(16).toString('hex')}`;

                await verificationRequests.create({ email: normalizedEmail, link: verificationLink, verification_token: emailVerificationToken, passwordHash, status: 'unverified', resend_secret: resendSecret });

                // Send verification email
                await sendVerificationEmailV2(normalizedEmail, verificationLink);

                return reply.send({ message: 'Email verification sent', require_verification: true, resend_word: resendSecret });
            }

            // If user exists - verify password
            const ok = await comparePassword(password, user.passwordHash);
            if (!ok) return reply.status(401).send({ message: 'Invalid credentials' });

            if (user.token) {
                const isTokenExpiring = checkIfExpiryInLessThan2Days(user.token);
                if (!isTokenExpiring) {
                    return reply.send({ message: 'Logged in', token: user.token, user: { id: user._id, email: user.email, credits: user.credits } });
                }
            }

            const token = signToken({ sub: user._id, email: user.email });
            return reply.send({ message: 'Logged in', token, user: { id: user._id, email: user.email, credits: user.credits } });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error', error: err.message, details: err });
        }
    });

    fastify.post('/auth/resend-verification', async (request, reply) => {
        try {
            const validationResponse = joi.object({
                resend_word: joi.string().max(500).required(),
            }).validate(request.body);

            if (validationResponse.error) {
                return reply.status(400).send({ message: validationResponse.error.details[0].message });
            }

            const { resend_word } = request.body || {};

            const verificationRequest = await verificationRequests.findOne({ resend_secret: String(resend_word).trim(), status: 'unverified' });
            if (!verificationRequest) {
                return reply.status(400).send({ message: "Invalid resend request", submit_new: true });
            }

            const shouldLimitResend = verificationRequest.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

            // Limit resends to 5
            if (verificationRequest.resend_count >= 5 || shouldLimitResend) {
                //Remove the old verification request
                await verificationRequests.deleteOne({ _id: verificationRequest._id });
                return reply.status(400).send({ message: "Resend limit reached. Please submit a new verification request.", submit_new: true });
            }

            verificationRequest.resend_count += 1;
            await verificationRequest.save();

            // Send verification email
            await sendVerificationEmailV2(verificationRequest.email, verificationRequest.verification_link);

            return reply.send({ message: 'Email verification sent' });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.post('/validate/token', { preHandler: authenticate }, async (request, reply) => {
        try {
            return reply.send({ message: 'Validation successfull' });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.post('/auth/email/verification', async (request, reply) => {
        try {
            const validationResponse = joi.object({
                email: joi.string().max(100).email().required(),
                token: joi.string().max(500).required(),
            }).validate(request.query);

            if (validationResponse.error) {
                return reply.status(400).send({ message: "Invalid verification link" });
            }

            let { email, token } = request.query || {};
            email = String(email).trim();

            const verificationRequest = await verificationRequests.findOne({ email: email, verification_token: String(token).trim(), status: 'unverified' });
            if (!verificationRequest) {
                return reply.status(400).send({ message: "Invalid or expired verification link" });
            }

            verificationRequest.status = 'verified';
            await verificationRequest.save();

            // Auto-create user
            const user = await users.create({ email: email, passwordHash: verificationRequest.passwordHash });
            // Send token
            const jwt = signToken({ sub: user._id, email: user.email });

            const paymentGatewayCustomerId = await addCustomerInPaymentGateway({ email }, "paddle");

            console.log("Payment Gateway Customer ID:", paymentGatewayCustomerId);

            await user.updateOne({ $set: { token: jwt, credits: 5, paddle_customer_id: paymentGatewayCustomerId } }); // Give 5 free credits on signup
            console.log("Sending response: ", { message: 'User created and logged in', token: jwt, user: { id: user._id, email: user.email, credits: user.credits } });
            return reply.send({ message: 'User created and logged in', token: jwt, user: { id: user._id, email: user.email, credits: user.credits } });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;

            if(request.query?.only_credits) {
                return reply.send({ credits: user.credits, });
            }
            
            return reply.send({ id: user._id, gateway_customer_id: user.paddle_customer_id, email: user.email, credits: user.credits, saved_resume_file: user.saved_resume_file, ...(!user.saved_resume_file && { saved_resume_text: user.saved_resume_text }) });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.get('/past-generations', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;

            const generations = await pastGenerations.find({ user_id: user._id }, { _id: 1, title: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(200).lean();
            return reply.send({ past_generations: generations });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.get('/past-generation/:id', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;
            const generationId = request.params.id;

            if (!generationId) {
                return reply.status(400).send({ message: 'Generation ID is required' });
            }

            const generation = await pastGenerations.findOne({ _id: generationId, user_id: user._id }).lean();
            return reply.send({ past_generation: generation });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.get('/export/past-generation', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;

            const generations = await pastGenerations.find({ user_id: user._id }).lean();

            const filePath = exportGenerationsCSV(generations);

            reply.header('Content-Disposition', 'attachment; filename="Ziplai_Export.csv"');
            return reply.send(fs.createReadStream(filePath));
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.post('/add/credits/request', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;

            const validationResponse = joi.object({
                transaction_id: joi.string().max(200).required(),
                customer_id: joi.string().max(200).required(),
                amount: joi.number().min(1).max(100).required(),
            }).validate(request.body);

            if (validationResponse.error) {
                return reply.status(400).send({ message: validationResponse.error.details[0].message });
            }

            const { transaction_id, customer_id, amount } = request.body || {};

            const creditRequest = await creditRequests.create({ user_id: user._id, transaction_id, customer_id, amount, status: 'pending' });
            if (!creditRequest) {
                return reply.status(500).send({ message: 'Could not log credit request' });
            }

            return reply.send({ message: 'Credit request logged' });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });
};