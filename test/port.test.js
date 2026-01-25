const net = require('net');
const { getAvailablePort, waitForPort, waitForHttp } = require('../lib/utils/port');
const http = require('http');

describe('Port Utils', () => {
    test('should return a valid port number', async () => {
        const port = await getAvailablePort();
        expect(typeof port).toBe('number');
        expect(port).toBeGreaterThan(0);
        expect(port).toBeLessThan(65536);
    });

    test('should return a port that is actually free', async () => {
        const port = await getAvailablePort();

        // Try to start a server on that port to verify it's free
        const server = net.createServer();

        await new Promise((resolve, reject) => {
            server.listen(port, () => {
                server.close(() => resolve());
            });
            server.on('error', (err) => {
                reject(new Error(`Port ${port} was not free: ${err.message}`));
            });
        });
    });

    test('should handle errors gracefully', async () => {
        // Mock net.createServer to throw an error
        const originalCreateServer = net.createServer;
        const mockError = new Error('Network error');

        net.createServer = jest.fn(() => ({
            listen: jest.fn(),
            on: jest.fn((event, callback) => {
                if (event === 'error') {
                    callback(mockError);
                }
            })
        }));

        await expect(getAvailablePort()).rejects.toThrow('Network error');

        // Restore mock
        net.createServer = originalCreateServer;
    });
});

describe('waitForPort', () => {
    test('should resolve when port connects', async () => {
        const mockSocket = {
            setTimeout: jest.fn(),
            on: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        };

        const eventHandlers = {};
        mockSocket.on.mockImplementation((event, handler) => {
            eventHandlers[event] = handler;
        });

        const originalSocket = net.Socket;
        net.Socket = jest.fn(() => mockSocket);

        const promise = waitForPort(3000);

        expect(eventHandlers['connect']).toBeDefined();
        eventHandlers['connect']();

        await expect(promise).resolves.toBeUndefined();

        expect(mockSocket.connect).toHaveBeenCalledWith(3000, 'localhost');
        expect(mockSocket.destroy).toHaveBeenCalled();

        net.Socket = originalSocket;
    });

    test('should retry on timeout and fail after max timeout', async () => {
        jest.useFakeTimers();
        const originalDateNow = Date.now;
        let currentTime = 1000;
        Date.now = jest.fn(() => currentTime);

        const mockSocket = {
            setTimeout: jest.fn(),
            on: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        };

        const eventHandlers = {};
        mockSocket.on.mockImplementation((event, handler) => {
            eventHandlers[event] = handler;
        });

        const originalSocket = net.Socket;
        net.Socket = jest.fn(() => mockSocket);

        const promise = waitForPort(3000, 'localhost', 190);

        // Initial attempt
        expect(eventHandlers['timeout']).toBeDefined();
        eventHandlers['timeout']();

        // Retry loop
        // Needs 200ms of advancement to pass timeout (100ms retry delay + execution time)
        // With timeout 190ms, it should fail after ~200ms

        currentTime += 200;
        jest.advanceTimersByTime(200);
        // By now the next check should have run and registered new listeners
        if (eventHandlers['timeout']) eventHandlers['timeout']();

        await expect(promise).rejects.toThrow('Timeout waiting for port 3000 on localhost');

        net.Socket = originalSocket;
        Date.now = originalDateNow;
        jest.useRealTimers();
    });

    test('should retry on error and fail after max timeout', async () => {
        jest.useFakeTimers();
        const originalDateNow = Date.now;
        let currentTime = 1000;
        Date.now = jest.fn(() => currentTime);

        const mockSocket = {
            setTimeout: jest.fn(),
            on: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        };

        const eventHandlers = {};
        mockSocket.on.mockImplementation((event, handler) => {
            eventHandlers[event] = handler;
        });

        const originalSocket = net.Socket;
        net.Socket = jest.fn(() => mockSocket);

        const promise = waitForPort(3000, 'localhost', 500);

        // Initial attempt
        expect(eventHandlers['error']).toBeDefined();
        eventHandlers['error'](new Error('Connection refused'));

        // Advance and fail repeatedly
        for (let i = 0; i < 6; i++) {
            currentTime += 100;
            jest.advanceTimersByTime(100);
            if (eventHandlers['error']) eventHandlers['error'](new Error('Connection refused'));
        }

        await expect(promise).rejects.toThrow('Timeout waiting for port 3000 on localhost');

        net.Socket = originalSocket;
        Date.now = originalDateNow;
        jest.useRealTimers();
    });
});

describe('waitForHttp', () => {
    test('should resolve when HTTP request succeeds', async () => {
        const mockReq = {
            on: jest.fn(),
            end: jest.fn(),
        };
        const mockRes = {
            resume: jest.fn(),
        };

        const originalGet = http.get;
        http.get = jest.fn((url, cb) => {
            cb(mockRes);
            return mockReq;
        });

        await expect(waitForHttp(3000)).resolves.toBeUndefined();

        expect(http.get).toHaveBeenCalledWith('http://localhost:3000/', expect.any(Function));
        expect(mockRes.resume).toHaveBeenCalled();

        http.get = originalGet;
    });

    test('should retry on error and fail after timeout', async () => {
        jest.useFakeTimers();
        const originalDateNow = Date.now;
        let currentTime = 1000;
        Date.now = jest.fn(() => currentTime);

        const mockReq = {
            on: jest.fn(),
            end: jest.fn(),
        };

        const eventHandlers = {};
        mockReq.on.mockImplementation((event, handler) => {
            eventHandlers[event] = handler;
        });

        const originalGet = http.get;
        http.get = jest.fn(() => mockReq);

        const promise = waitForHttp(3000, '/', 150);

        expect(eventHandlers['error']).toBeDefined();
        eventHandlers['error'](new Error('ECONNREFUSED'));

        // Advance and fail
        currentTime += 200;
        jest.advanceTimersByTime(200);
        if (eventHandlers['error']) eventHandlers['error'](new Error('ECONNREFUSED'));

        await expect(promise).rejects.toThrow('Timeout waiting for HTTP service on port 3000: ECONNREFUSED');

        http.get = originalGet;
        Date.now = originalDateNow;
        jest.useRealTimers();
    });
});
