const { verifyToken } = require('../utils/jwt');
const User = require('../models/user');

async function authenticate(request, reply) {
    try {
        const auth = request.headers.authorization;
        if (!auth) return reply.status(401).send({ message: 'Missing Authorization header' });
        const token = auth.replace(/^Bearer\s+/i, '');
        const payload = verifyToken(token);
        const user = await User.findById(payload.sub);
        if (!user) return reply.status(401).send({ message: 'User not found' });
        request.user = user; // attach user to request
    } catch (err) {
        return reply.status(401).send({ message: 'Invalid or expired token' });
    }
}

async function authenticateTest(request, reply) {
    try {
        const auth = request.headers.authorization;
        if (!auth) return reply.status(401).send({ message: 'Missing Authorization header' });
        const testKey = process.env.TEST_API_KEY || 'a806bb79-4d62-49ab-b7f1-564dfe6843e72dc8c040-91f7-414e-877f-4e3796a08f43';
        if(auth !== testKey) {
            return reply.status(401).send({ message: 'Invalid test API key' });
        }
    } catch (err) {
        return reply.status(401).send({ message: 'Invalid test API key' });
    }
}


module.exports = {authenticate, authenticateTest};