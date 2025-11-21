const fastify = require('fastify')({ logger: true });
const fastifyStatic = require("@fastify/static");
const fastifyMultipart = require('fastify-multipart');
const fs = require('fs');
const path = require('path');
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

require('dotenv').config();

const mongoose = require('mongoose');
const cors = require('@fastify/cors');

const authRoutes = require('./routes/auth');
const protectedRoutes = require('./routes/protected');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/apply_smart';

const OpenAI = require("openai");
const openaiClient = new OpenAI({
    apiKey: process.env.OPEN_AI_API_KEY,
});

global['openai_client'] = openaiClient;

const paddleEnv = {
    paddle_sandbox: Environment.sandbox,
    paddle_production: Environment.production,
}

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
    environment: paddleEnv[process.env.paddle_env],
});
global['paddle_client'] = paddle;

async function start() {
    try {

        // Register a custom content type parser for application/json to get the raw body
        // fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
        //     console.log("\n\nreq.url, ", req.url);
        //     if (req.url === '/api/paddlee/webhooks') {
        //         // Keep the raw stream (don't parse)
        //         console.log("\n\nHIT URL\n\n");
                
        //         done(null, body);
        //     } else {
        //         // Let other routes use default JSON/form parsing
        //         this.defaultJsonParser(req, body, done);
        //     }
        // });

        // await fastify.register(require('fastify-raw-body'), {
        //     field: 'rawBody', // change the default request.rawBody property name
        //     global: false, // add the rawBody to every request. **Default true**
        //     // encoding: 'utf8', // set it to false to set rawBody as a Buffer **Default utf8**
        //     encoding: false, // set it to false to set rawBody as a Buffer **Default utf8**
        //     runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
        //     routes: [], // array of routes, **`global`** will be ignored, wildcard routes not supported
        //     jsonContentTypes: [], // array of content-types to handle as JSON. **Default ['application/json']**
        // });

        // CORS - adjust origin to your frontend origin in production
        await fastify.register(cors, { origin: true });
        await fastify.register(fastifyMultipart);

        // Connect to MongoDB
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        fastify.log.info('Connected to MongoDB');

        fastify.register(fastifyStatic, {
            root: path.join(__dirname, 'public'),
            prefix: '/',
        });

        fastify.get('/', async (request, reply) => {
            return reply.sendFile('landing.html');
        });

        fastify.get('/home', async (request, reply) => {
            return reply.sendFile('index.html');
        });

        fastify.get('/login', async (request, reply) => {
            return reply.sendFile('login.html');
        });

        fastify.get('/email/verification', async (request, reply) => {
            return reply.sendFile('login.html');
        });

        fastify.get('/verification', async (request, reply) => {
            return reply.sendFile('verification.html');
        });

        fastify.get('/terms-and-conditions', async (request, reply) => {
            return reply.sendFile('term.html');
        });

        fastify.get('/privacy-policy', async (request, reply) => {
            return reply.sendFile('privacy.html');
        });

        fastify.get('/refund-policy', async (request, reply) => {
            return reply.sendFile('refund.html');
        });

        // fastify.get('/checkout', async (request, reply) => {
        //     reply.header('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 https://sandbox-buy.paddle.com https://buy.paddle.com");
        //     reply.header('X-Frame-Options', 'ALLOW-FROM https://buy.paddle.com');
        //     return reply.sendFile('checkout.html');
        // });

        // Register routes
        fastify.register(authRoutes, { prefix: '/api' });
        fastify.register(protectedRoutes, { prefix: '/api' });

        //create direcotry if not exists
        const uploadPath = path.join(path.join(__dirname, '..'), 'tmp_exports');
        const resumePath = path.join(path.join(__dirname, '..'), 'user_resumes');
        for (const dirPath of [uploadPath, resumePath]) {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath);
            }
        }

        // Start server
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        fastify.log.info(`Server listening on ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();

setInterval(() => {
  fetch('https://ziplai.com/?test_call_uuid=79151dde-332f-4403-959d-412e9303bdc6');
}, 780000);

