// const fp = require('fastify-plugin');
const joi = require('joi');
const { authenticate, authenticateTest } = require('../middleware/authenticate');
const { EventName } = require('@paddle/paddle-node-sdk');
const { extractText, sleep, generateCoverLetterAndMessage, generatePrompt, generateResponse, testGeneration, saveUserResume } = require('../utils/helper');
const { logAPICall } = require('../utils/logging');
const pastGenerations = require('../models/past_generations');
const users = require('../models/user');
const creditRequests = require('../models/credit_requests');
const apiLogs = require('../models/api_logs');
const path = require('path');
const fs = require('fs').promises;

module.exports = async function (fastify, opts) {
    fastify.post('/generate/old', { preHandler: authenticate }, async (request, reply) => {
        let apiError;
        try {
            const schema = joi.object({
                job_description: joi.string().min(1).max(5000)
                    .required(),

                resume_text: joi.string()
                    .min(1)
                    .max(6000)
                    .allow('')
                    .optional()
            });

            const parts = request.parts();

            let fields = {};
            let resumeFileBuffer = null;
            let resumeFileMeta = null;

            for await (const part of parts) {
                if (part.file && part.fieldname === 'resume_file') {
                    resumeFileBuffer = await part.toBuffer();
                    resumeFileMeta = part;
                } else {
                    fields[part.fieldname] = part.value;
                }
            }

            const { error } = schema.validate(fields, { abortEarly: true });
            if (error) {
                return reply.status(400).send({ error: error.details[0].message });
            }

            if (!fields.resume_text && !resumeFileBuffer) {
                return reply
                    .status(400)
                    .send({ error: 'Either "resume_text" or "resume_file" is required.' });
            }

            if (resumeFileMeta && !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(resumeFileMeta.mimetype)) {
                return reply.status(400).send({ error: '"resume_file" must be a PDF.' });
            }

            let resumeText = fields.resume_text;
            if (resumeFileBuffer) {
                resumeText = await extractText(resumeFileBuffer, resumeFileMeta.mimetype);
            }

            const user = request.user;

            // Check credits
            if (user.credits <= 0) return reply.status(402).send({ message: 'Insufficient credits. Please top up.' });

            reply.raw.setHeader("Content-Type", "text/event-stream");
            reply.raw.setHeader("Cache-Control", "no-cache");
            reply.raw.setHeader("Connection", "keep-alive");
            reply.raw.flushHeaders();

            const prompt = generatePrompt(resumeText, fields.job_description);

            const stream = await global['open_ai'].chat.completions.create({
                model: "gpt-5-nano",
                messages: [
                    { role: "system", content: "You are an expert career coach and professional writer experienced in helping job seekers from all industries craft personalized, natural, and professional application materials." },
                    { role: "user", content: prompt }
                ],
                // temperature: 1,
                // temperature: 0.7,
                stream: true
            });

            for await (const chunk of stream) {
                const token = chunk.choices?.[0]?.delta?.content || "";
                if (token) reply.raw.write(`data: ${JSON.stringify({ responseToken: token })}\n\n`);
            }

            reply.raw.write(`data: ${JSON.stringify({ USER_REMAINING_CREDITS: user.credits - 1 })}\n\n`);

            reply.raw.write("data: [DONE]\n\n");

            // const { jobTitle, coverLetter, recruiterMessage } = await generateCoverLetterAndMessage(resumeText, fields.job_description);

            // let jobTitle = 'Frontend Developer Position';

            // Deduct one credit (atomicity considerations for production)
            user.credits = user.credits - 1;
            user.save();

            // Placeholder generation result (actual implementation will call OpenAI)
            // const coverLetter = `Dear Hiring Manager,\n\nThis is an auto-generated cover letter for the role you provided.\n\nBest,\n${user.email}`;
            // const recruiterMessage = `Hi, I'm interested in the role. Please find my details attached.`;

            // Save to past generations
            // pastGenerations.create({
            //     user_id: user._id,
            //     title: jobTitle,
            //     job_description: fields.job_description,
            //     resume_text: resumeText,
            //     cover_letter: coverLetter,
            //     recruiter_message: recruiterMessage,
            // });
            // return reply.send({ cover_letter: coverLetter, recruiter_message: recruiterMessage, remaining_credits: user.credits });
        } catch (err) {
            console.log("Error in generate API Log:\n,", err);
            fastify.log.error("Error in generate API:\n,", err);
            apiError = err;
            // return reply.status(500).send({ message: 'Server error' });
        }
        finally {
            if (!apiError) {
                reply.raw.end();
            }
            else {
                console.clear();
                console.log("Error in generate API Log:\n,", apiError);
                return reply.status(500).send({ message: 'Server error' });
            }
        }
    });

    fastify.post('/generate', { preHandler: authenticate }, async (request, reply) => {
        try {
            const user = request.user;
            const requestId = request.id;
            // await logAPICall({ request_id: requestId, endpoint: '/generate', user_id: request.user._id, position: 'intital', timestamp: new Date().toISOString() });

            // Check credits
            if (user.credits <= 0) return reply.status(402).send({ message: 'Insufficient credits. Please top up.' });

            const schema = joi.object({
                job_description: joi.string().min(1).max(5000)
                    .required(),
                resume_text: joi.string()
                    .min(1)
                    .max(6000)
                    .allow('')
                    .optional(),
                use_saved_resume: joi.boolean().optional().default(false),
            });

            const parts = request.parts();

            let fields = {};
            let resumeFilePart = null;
            let resumeFileBuffer = null;
            let resumeFileMeta = null;

            for await (const part of parts) {
                if (part.file && part.fieldname === 'resume_file') {
                    // resumeFilePart = part;
                    // Read file stream into buffer
                    const chunks = [];
                    for await (const chunk of part.file) {
                        chunks.push(chunk);
                    }
                    resumeFileBuffer = Buffer.concat(chunks);
                    resumeFileMeta = {
                        filename: part.filename,
                        mimetype: part.mimetype,
                        encoding: part.encoding,
                    };
                    // 
                } else {
                    fields[part.fieldname] = part.value;
                }
            }

            const { error } = schema.validate(fields, { abortEarly: true });

            if (error) {
                return reply.status(400).send({ error: error.details[0].message });
            }

            const useSavedResume = fields.use_saved_resume;

            if (resumeFileBuffer) {
                if (useSavedResume) {
                    return reply.status(400).send({ error: 'Cannot upload a new resume file when "use_saved_resume" is true.' });
                }
                // resumeFileBuffer = await resumeFilePart.toBuffer();
                // resumeFileMeta = resumeFilePart;
            }

            let resumeText = fields.resume_text;

            if (!useSavedResume) {
                if (!fields.resume_text && !resumeFileBuffer) {
                    return reply
                        .status(400)
                        .send({ error: 'Either "resume_text" or "resume_file" is required.' });
                }

                if (resumeFileMeta && !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(resumeFileMeta.mimetype)) {
                    return reply.status(400).send({ error: '"resume_file" must be a PDF or DOCX.' });
                }

                if (resumeFileBuffer) {
                    // await logAPICall({ request_id: requestId, endpoint: '/generate', user_id: request.user._id, position: 'calling_extractText_function', timestamp: new Date().toISOString() });
                    resumeText = await extractText(resumeFileBuffer, resumeFileMeta.mimetype);
                    // await logAPICall({ request_id: requestId, endpoint: '/generate', user_id: request.user._id, position: 'right_after_extractText_function', timestamp: new Date().toISOString() });
                }
            }
            else {
                if (!user.saved_resume_text) {
                    return reply.status(400).send({ error: 'No saved resume found in your profile.' });
                }
                resumeText = user.saved_resume_text;
            }

            // await logAPICall({ request_id: requestId, endpoint: '/generate', user_id: request.user._id, position: 'calling_generateResponse_function', timestamp: new Date().toISOString() });
            const { coverLetter, recruiterMessage, jobTitle, companyName, contactPersonName, contactPersonEmail } = await generateResponse(resumeText, fields.job_description);

            // Deduct one credit (atomicity considerations for production)
            user.credits = user.credits - 1;

            reply.send({ cover_letter: coverLetter, recruiter_message: recruiterMessage, remaining_credits: user.credits });

            if (!useSavedResume) {
                if (resumeFileBuffer) {
                    // Save user resume file in background
                    const filePath = await saveUserResume(user._id, resumeFileBuffer, resumeFileMeta);
                    user.saved_resume_file = {
                        path: filePath,
                        original_name: resumeFileMeta.filename,
                        mimetype: resumeFileMeta.mimetype,
                        size: resumeFileMeta.byteCount
                    };

                    user.saved_resume_text = resumeText;
                }
                else {
                    user.saved_resume_text = resumeText;
                    user.saved_resume_file = null;
                }
            }

            await user.save();

            // Save to past generations
            await pastGenerations.create({
                user_id: user._id,
                title: jobTitle,
                job_description: fields.job_description,
                resume_text: resumeText,
                cover_letter: coverLetter,
                recruiter_message: recruiterMessage,
                company_name: companyName,
                contact_person_name: contactPersonName,
                contact_person_email: contactPersonEmail,

            });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ message: 'Server error' });
        }
    });

    fastify.post('/test/generation', { preHandler: authenticateTest }, async (request, reply) => {
        try {
            const testGenerationResult = await testGeneration();
            return reply.send({ testGenerationResult });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: err });
        }
    });

    fastify.post('/custom/webhooks', async (request, reply) => {
        try {
            console.log("Receiving Paddle webhook...");

            const { data, eventType, occurredAt, API_SECRET } = request.body;

            if (API_SECRET == process.env.VERCEL_API_SECRET) {
                if (eventType === EventName.TransactionCompleted) {
                    if (!data.customerId) {
                        // console.log("No customerId in event data:", JSON.stringify(data));
                        return reply.code(400).send({ error: 'No customerId in event data' });
                    }

                    // Find your user by Paddle customer ID
                    const user = await users.findOne({ paddle_customer_id: data.customerId });

                    if (user) {
                        // Add credits to the user's account
                        await users.updateOne(
                            { _id: user._id },
                            { $inc: { credits: 50 } } // or calculate based on amount
                        );

                        const metadata = {
                            occurredAt, // notification.occurredAt
                            transaction_id: data.id, // transaction.id
                            transaction_status: data.status, // transaction.status
                            customer_id: data.customerId, // transaction.customerId
                            items: data.items, // transaction.items
                            details_totals: data.details?.totals, // transaction.details.totals
                            payments_method_details: data.payments?.map(p => p.method_details), // transaction.payments[].method_details
                            // The following fields are for subscriptions, include if relevant to your use case
                            // subscription_id: data.subscriptionId, // subscription.id
                            // subscription_status: data.subscription?.status, // subscription.status
                            // subscription_items: data.subscription?.items, // subscription.items
                            // subscription_products: data.subscription?.items?.map(item => item.price.product_id), // subscription.items[].price.product_id
                            // collection_mode: data.subscription?.collection_mode, // subscription.collection_mode
                            // scheduled_change: data.subscription?.scheduled_change, // subscription.scheduled_change
                            // next_billed_at: data.subscription?.next_billed_at, // subscription.next_billed_at
                            // current_billing_period: data.subscription?.current_billing_period, // subscription.current_billing_period
                            // billing_details: data.subscription?.billing_details // subscription.billing_details
                        };

                        // Log the credit request
                        await creditRequests.create({
                            user_id: user._id,
                            transaction_id: data.id,
                            customer_id: data.customerId,
                            amount: parseFloat(data.payments ? data.payments[0].amount : 0),
                            status: data.status,
                            metadata: metadata
                        });
                    }
                    else {
                        console.log(`User with Paddle customer ID ${data.customer_id} not found.`);
                    }
                }
            }
        } catch (err) {
            console.log("Error in Paddle webhook handler:", err);
            fastify.log.error("Error in Paddle webhook handler:", err);
        } finally {
            // Respond quickly to Paddle
            reply.code(200).send();
        }
        // }
    });

    fastify.post('/paddlee/webhooks', async (request, reply) => {
        // fastify.post('/paddle/webhooks', {
        // config: { rawBody: true }, handler: async (request, reply) => {
        try {
            console.log("Receiving Paddle webhook...");

            console.log("Receiving Paddle webhook...1");

            console.log("Receiving Paddle webhook...2");

            // Get the raw body as a string
            // const rawBody = request.rawBody?.toString();
            const rawBody = request.body?.toString();
            console.log("Raw body length:", rawBody ? rawBody.length : 'undefined');
            // Get the signature header
            const signature = request.headers['paddle-signature'];

            if (!signature || !rawBody) {
                return reply.code(400).send({ error: 'Missing signature or body' });
            }

            console.log("Paddle webhook received. Verifying...");

            // Authenticate and parse the webhook
            const event = await global.paddle_client.webhooks.unmarshal(
                rawBody,
                process.env.PADDLE_WEBHOOK_SECRET,
                signature
            );

            // console.log("Event received:", JSON.stringify(event));

            const { data, eventType, occurredAt } = event;

            // if (eventType === 'transaction.completed') {
            console.log("Paddle webhook verified. Processing event:", eventType);
            if (eventType === EventName.TransactionCompleted) {
                if (!data.customerId) {
                    // console.log("No customerId in event data:", JSON.stringify(data));
                    return reply.code(400).send({ error: 'No customerId in event data' });
                }

                // Find your user by Paddle customer ID
                const user = await users.findOne({ paddle_customer_id: data.customerId });

                if (user) {
                    // Add credits to the user's account
                    await users.updateOne(
                        { _id: user._id },
                        { $inc: { credits: 50 } } // or calculate based on amount
                    );

                    const metadata = {
                        occurredAt, // notification.occurredAt
                        transaction_id: data.id, // transaction.id
                        transaction_status: data.status, // transaction.status
                        customer_id: data.customerId, // transaction.customerId
                        items: data.items, // transaction.items
                        details_totals: data.details?.totals, // transaction.details.totals
                        payments_method_details: data.payments?.map(p => p.method_details), // transaction.payments[].method_details
                        // The following fields are for subscriptions, include if relevant to your use case
                        // subscription_id: data.subscriptionId, // subscription.id
                        // subscription_status: data.subscription?.status, // subscription.status
                        // subscription_items: data.subscription?.items, // subscription.items
                        // subscription_products: data.subscription?.items?.map(item => item.price.product_id), // subscription.items[].price.product_id
                        // collection_mode: data.subscription?.collection_mode, // subscription.collection_mode
                        // scheduled_change: data.subscription?.scheduled_change, // subscription.scheduled_change
                        // next_billed_at: data.subscription?.next_billed_at, // subscription.next_billed_at
                        // current_billing_period: data.subscription?.current_billing_period, // subscription.current_billing_period
                        // billing_details: data.subscription?.billing_details // subscription.billing_details
                    };

                    // Log the credit request
                    await creditRequests.create({
                        user_id: user._id,
                        transaction_id: data.id,
                        customer_id: data.customerId,
                        amount: parseFloat(data.payments ? data.payments[0].amount : 0),
                        status: data.status,
                        metadata: metadata
                    });
                }
                else {
                    console.log(`User with Paddle customer ID ${data.customer_id} not found.`);
                }
            }
        } catch (err) {
            console.log("Error in Paddle webhook handler:", err);
            fastify.log.error("Error in Paddle webhook handler:", err);
        } finally {
            // Respond quickly to Paddle
            reply.code(200).send();
        }
        // }
    });
};