const net = require('net');

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

function waitForPort(port, host = 'localhost', timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
            const socket = new net.Socket();
            socket.setTimeout(200); // Short timeout for connection attempt

            socket.on('connect', () => {
                socket.destroy();
                resolve();
            });

            socket.on('timeout', () => {
                socket.destroy();
                retry();
            });

            socket.on('error', (err) => {
                socket.destroy();
                retry();
            });

            socket.connect(port, host);
        };

        const retry = () => {
            if (Date.now() - startTime >= timeout) {
                reject(new Error(`Timeout waiting for port ${port} on ${host}`));
            } else {
                setTimeout(check, 100);
            }
        };

        check();
    });
}

const http = require('http');

function waitForHttp(port, path = '/', timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            const req = http.get(`http://localhost:${port}${path}`, (res) => {
                res.resume(); // Consume response data to free up memory
                resolve();
            });

            req.on('error', (err) => {
                retry(err);
            });

            req.end();
        };

        const retry = (lastError) => {
            if (Date.now() - startTime >= timeout) {
                reject(new Error(`Timeout waiting for HTTP service on port ${port}: ${lastError ? lastError.message : 'Unknown error'}`));
            } else {
                setTimeout(check, 200);
            }
        };

        check();
    });
}

module.exports = { getAvailablePort, waitForPort, waitForHttp };