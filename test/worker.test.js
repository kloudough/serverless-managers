const WorkerManager = require('../lib/managers/worker');
const { getAvailablePort } = require('../lib/utils/port');
const { Worker } = require('worker_threads');

// Mock dependencies
jest.mock('worker_threads');
jest.mock('../lib/utils/port');

describe('WorkerManager', () => {
    let workerManager;
    let mockWorker;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock Worker class
        mockWorker = {
            on: jest.fn(),
            terminate: jest.fn().mockResolvedValue(undefined)
        };
        
        Worker.mockImplementation(() => mockWorker);
        getAvailablePort.mockResolvedValue(8080);
        
        // Create fresh instance
        workerManager = new WorkerManager();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            expect(workerManager.maxPoolSize).toBe(3);
            expect(workerManager.poolCheckInterval).toBe(10000);
            expect(workerManager.workerPool).toEqual([]);
            expect(workerManager.watcherStarted).toBe(false);
        });

        test('should initialize with custom options', () => {
            const customManager = new WorkerManager({
                maxPoolSize: 5,
                poolCheckInterval: 5000
            });
            
            expect(customManager.maxPoolSize).toBe(5);
            expect(customManager.poolCheckInterval).toBe(5000);
        });

        test('should set lastWorkerRequestTime on initialization', () => {
            const beforeTime = Date.now();
            const manager = new WorkerManager();
            const afterTime = Date.now();
            
            expect(manager.lastWorkerRequestTime).toBeGreaterThanOrEqual(beforeTime);
            expect(manager.lastWorkerRequestTime).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('poolWatcher', () => {
        test('should set up interval for pool watching', () => {
            // Mock setInterval to capture the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn();
            
            workerManager.poolWatcher();
            
            expect(global.setInterval).toHaveBeenCalledWith(
                expect.any(Function),
                workerManager.poolCheckInterval
            );
            
            // Restore original setInterval
            global.setInterval = originalSetInterval;
        });

        test('should terminate and remove worker when pool check interval passes', async () => {
            // Add a mock worker to the pool
            workerManager.workerPool = [{
                name: 'test-worker',
                port: 8080,
                worker: mockWorker
            }];
            
            // Set lastWorkerRequestTime to more than poolCheckInterval ago
            workerManager.lastWorkerRequestTime = Date.now() - 15000;
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                // Execute the callback immediately for testing
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            workerManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(mockWorker.terminate).toHaveBeenCalled();
            expect(workerManager.workerPool).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith('Stopped and removed worker: test-worker');
            
            consoleSpy.mockRestore();
            global.setInterval = originalSetInterval;
        });

        test('should not remove worker if recent request was made', async () => {
            // Add a mock worker to the pool
            workerManager.workerPool = [{
                name: 'test-worker',
                port: 8080,
                worker: mockWorker
            }];
            
            // Set lastWorkerRequestTime to recent
            workerManager.lastWorkerRequestTime = Date.now() - 5000;
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            workerManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(mockWorker.terminate).not.toHaveBeenCalled();
            expect(workerManager.workerPool).toHaveLength(1);
            
            global.setInterval = originalSetInterval;
        });

        test('should handle worker termination errors', async () => {
            // Add a mock worker to the pool
            workerManager.workerPool = [{
                name: 'test-worker',
                port: 8080,
                worker: mockWorker
            }];
            
            mockWorker.terminate.mockRejectedValue(new Error('Termination failed'));
            workerManager.lastWorkerRequestTime = Date.now() - 15000;
            
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            workerManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error stopping worker test-worker:',
                'Termination failed'
            );
            
            consoleErrorSpy.mockRestore();
            global.setInterval = originalSetInterval;
        });

        test('should not do anything if pool is empty', async () => {
            workerManager.workerPool = [];
            workerManager.lastWorkerRequestTime = Date.now() - 15000;
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            workerManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(mockWorker.terminate).not.toHaveBeenCalled();
            
            global.setInterval = originalSetInterval;
        });
    });

    describe('getOrCreateWorkerInPool', () => {
        test('should update lastWorkerRequestTime', async () => {
            const beforeTime = Date.now();
            
            // Mock successful worker creation
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    setImmediate(() => callback());
                }
            });
            
            await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(workerManager.lastWorkerRequestTime).toBeGreaterThanOrEqual(beforeTime);
        });

        test('should start pool watcher on first call', async () => {
            const poolWatcherSpy = jest.spyOn(workerManager, 'poolWatcher').mockImplementation();
            
            // Mock successful worker creation
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    setImmediate(() => callback());
                }
            });
            
            expect(workerManager.watcherStarted).toBe(false);
            
            await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(workerManager.watcherStarted).toBe(true);
            expect(poolWatcherSpy).toHaveBeenCalled();
            
            poolWatcherSpy.mockRestore();
        });

        test('should not start pool watcher if already started', async () => {
            workerManager.watcherStarted = true;
            const poolWatcherSpy = jest.spyOn(workerManager, 'poolWatcher').mockImplementation();
            
            // Mock successful worker creation
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    setImmediate(() => callback());
                }
            });
            
            await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(poolWatcherSpy).not.toHaveBeenCalled();
            
            poolWatcherSpy.mockRestore();
        });

        test('should create new worker when pool is not full', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            // Mock successful worker creation
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    setImmediate(() => callback());
                }
            });
            
            const result = await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(Worker).toHaveBeenCalledWith('./test-script.js', {
                workerData: { port: 8080, name: 'worker-8080' }
            });
            expect(result.name).toBe('worker-8080');
            expect(result.port).toBe(8080);
            expect(result.worker).toBe(mockWorker);
            expect(workerManager.workerPool).toHaveLength(1);
            expect(consoleSpy).toHaveBeenCalledWith('Started worker: worker-8080 (port 8080)');
            
            consoleSpy.mockRestore();
        });

        test('should return random worker from pool when pool is full', async () => {
            // Fill the pool to max capacity
            workerManager.workerPool = [
                { name: 'worker-1', port: 8001, worker: {} },
                { name: 'worker-2', port: 8002, worker: {} },
                { name: 'worker-3', port: 8003, worker: {} }
            ];
            
            // Mock Math.random to return a specific index
            const originalRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.5); // Should select index 1
            
            const result = await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(result).toBe(workerManager.workerPool[1]);
            expect(Worker).not.toHaveBeenCalled();
            
            Math.random = originalRandom;
        });

        test('should throw error if worker creation fails and pool is empty', async () => {
            // Mock worker creation failure
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Worker creation failed')));
                }
            });
            
            await expect(workerManager.getOrCreateWorkerInPool('./test-script.js'))
                .rejects.toThrow('Worker creation failed');
        });

        test('should return existing worker if creation fails but pool has workers', async () => {
            // Add existing worker to pool
            workerManager.workerPool = [
                { name: 'existing-worker', port: 8001, worker: {} }
            ];
            
            // Mock worker creation failure
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Worker creation failed')));
                }
            });
            
            const result = await workerManager.getOrCreateWorkerInPool('./test-script.js');
            
            expect(result.name).toBe('existing-worker');
        });

        test('should throw error if no workers available', async () => {
            // Force pool to be full by setting maxPoolSize to 0
            workerManager.maxPoolSize = 0;
            
            await expect(workerManager.getOrCreateWorkerInPool('./test-script.js'))
                .rejects.toThrow('No workers available in pool');
        });
    });

    describe('createWorker', () => {
        test('should create worker with correct parameters', () => {
            workerManager.createWorker('./test-script.js', 8080, 'test-worker');
            
            expect(Worker).toHaveBeenCalledWith('./test-script.js', {
                workerData: { port: 8080, name: 'test-worker' }
            });
        });

        test('should resolve when worker comes online', async () => {
            // Mock worker online event
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    setImmediate(() => callback());
                }
            });
            
            const result = await workerManager.createWorker('./test-script.js', 8080, 'test-worker');
            
            expect(result).toEqual({
                name: 'test-worker',
                port: 8080,
                worker: mockWorker
            });
        });

        test('should reject when worker has error', async () => {
            // Mock worker error event
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Worker error')));
                }
            });
            
            await expect(workerManager.createWorker('./test-script.js', 8080, 'test-worker'))
                .rejects.toThrow('Worker error');
        });

        test('should handle worker messages', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            // Mock worker events - store callbacks to trigger them in order
            let onlineCallback, messageCallback;
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    onlineCallback = callback;
                } else if (event === 'message') {
                    messageCallback = callback;
                }
            });
            
            const createWorkerPromise = workerManager.createWorker('./test-script.js', 8080, 'test-worker');
            
            // Trigger online first
            setImmediate(() => onlineCallback());
            
            await createWorkerPromise;
            
            // Then trigger message
            setImmediate(() => messageCallback('Test message'));
            
            // Wait for message to be processed
            await new Promise(resolve => setImmediate(resolve));
            
            expect(consoleSpy).toHaveBeenCalledWith('worker test-worker message: Test message');
            
            consoleSpy.mockRestore();
        });

        test('should handle worker errors after creation', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // Mock worker events - store callbacks
            let onlineCallback, errorCallback;
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    onlineCallback = callback;
                } else if (event === 'error') {
                    errorCallback = callback;
                }
            });
            
            const createWorkerPromise = workerManager.createWorker('./test-script.js', 8080, 'test-worker');
            
            // Trigger online first
            setImmediate(() => onlineCallback());
            
            await createWorkerPromise;
            
            // Then trigger error
            setImmediate(() => errorCallback(new Error('Runtime error')));
            
            // Wait for error to be processed
            await new Promise(resolve => setImmediate(resolve));
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'worker test-worker error: Error: Runtime error'
            );
            
            consoleErrorSpy.mockRestore();
        });

        test('should remove worker from pool when it exits', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            // Add worker to pool first
            workerManager.workerPool = [
                { name: 'test-worker', port: 8080, worker: mockWorker }
            ];
            
            // Mock worker events - store callbacks
            let onlineCallback, exitCallback;
            mockWorker.on.mockImplementation((event, callback) => {
                if (event === 'online') {
                    onlineCallback = callback;
                } else if (event === 'exit') {
                    exitCallback = callback;
                }
            });
            
            const createWorkerPromise = workerManager.createWorker('./test-script.js', 8080, 'test-worker');
            
            // Trigger online first
            setImmediate(() => onlineCallback());
            
            await createWorkerPromise;
            
            // Then trigger exit
            setImmediate(() => exitCallback(0));
            
            // Wait for exit to be processed
            await new Promise(resolve => setImmediate(resolve));
            
            expect(consoleSpy).toHaveBeenCalledWith('worker test-worker exited with code 0');
            expect(workerManager.workerPool).toHaveLength(0);
            
            consoleSpy.mockRestore();
        });
    });

    describe('getPoolInfo', () => {
        test('should return correct pool information', () => {
            workerManager.workerPool = [
                { name: 'worker-1', port: 8001, worker: {} },
                { name: 'worker-2', port: 8002, worker: {} }
            ];
            
            const info = workerManager.getPoolInfo();
            
            expect(info).toEqual({
                poolSize: 2,
                maxPoolSize: 3,
                workers: [
                    { name: 'worker-1', port: 8001 },
                    { name: 'worker-2', port: 8002 }
                ]
            });
        });

        test('should return empty workers array when pool is empty', () => {
            const info = workerManager.getPoolInfo();
            
            expect(info).toEqual({
                poolSize: 0,
                maxPoolSize: 3,
                workers: []
            });
        });
    });

    describe('clearPool', () => {
        test('should clear the pool and update request time', () => {
            workerManager.workerPool = [
                { name: 'worker-1', port: 8001, worker: {} }
            ];
            
            const beforeTime = Date.now();
            workerManager.clearPool();
            const afterTime = Date.now();
            
            expect(workerManager.workerPool).toEqual([]);
            expect(workerManager.lastWorkerRequestTime).toBeGreaterThanOrEqual(beforeTime);
            expect(workerManager.lastWorkerRequestTime).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('stopAllWorkers', () => {
        test('should terminate all workers and clear pool', async () => {
            const mockWorker1 = { terminate: jest.fn().mockResolvedValue(undefined) };
            const mockWorker2 = { terminate: jest.fn().mockResolvedValue(undefined) };
            
            workerManager.workerPool = [
                { name: 'worker-1', port: 8001, worker: mockWorker1 },
                { name: 'worker-2', port: 8002, worker: mockWorker2 }
            ];
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await workerManager.stopAllWorkers();
            
            expect(mockWorker1.terminate).toHaveBeenCalled();
            expect(mockWorker2.terminate).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Stopped worker: worker-1');
            expect(consoleSpy).toHaveBeenCalledWith('Stopped worker: worker-2');
            expect(workerManager.workerPool).toEqual([]);
            
            consoleSpy.mockRestore();
        });

        test('should handle worker termination errors', async () => {
            const mockWorker1 = { 
                terminate: jest.fn().mockRejectedValue(new Error('Termination failed')) 
            };
            
            workerManager.workerPool = [
                { name: 'worker-1', port: 8001, worker: mockWorker1 }
            ];
            
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            await workerManager.stopAllWorkers();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error stopping worker worker-1:',
                'Termination failed'
            );
            expect(workerManager.workerPool).toEqual([]);
            
            consoleErrorSpy.mockRestore();
        });

        test('should work with empty pool', async () => {
            workerManager.workerPool = [];
            
            await expect(workerManager.stopAllWorkers()).resolves.not.toThrow();
            expect(workerManager.workerPool).toEqual([]);
        });
    });
});