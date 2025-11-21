const fp = require('fastify-plugin');
// const fastifyStatic = require("@fastify/static");
// const path = require('path');

module.exports = fp(async function (fastify, opts) {
    // Serve index.html for the root route
    fastify.get('/', async (request, reply) => {
        return reply.sendFile('index.html');
    });

    // Serve login.html for the /login route
    fastify.get('/login', async (request, reply) => {
        return reply.sendFile('login.html');
    });

});