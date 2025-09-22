const ProcessManager = require('../lib/managers/process');
const { getAvailablePort } = require('../lib/utils/port');
const { spawn } = require('child_process');

// Mock dependencies
jest.mock('child_process');
jest.mock('../lib/utils/port');

describe('ProcessManager', () => {
    let processManager;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock child process
        const mockChildProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn(),
            kill: jest.fn()
        };
        
        spawn.mockReturnValue(mockChildProcess);
        getAvailablePort.mockResolvedValue(9000);
        
        // Create fresh instance
        processManager = new ProcessManager();
    });

    afterEach(() => {
        // Clean up any timers
        jest.clearAllTimers();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            expect(processManager.maxPoolSize).toBe(3);
            expect(processManager.poolCheckInterval).toBe(10000);
            expect(processManager.processPool).toEqual([]);
            expect(processManager.watcherStarted).toBe(false);
        });

        test('should initialize with custom options', () => {
            const customManager = new ProcessManager({
                maxPoolSize: 5,
                poolCheckInterval: 5000
            });
            
            expect(customManager.maxPoolSize).toBe(5);
            expect(customManager.poolCheckInterval).toBe(5000);
        });
    });

    describe('createProcess', () => {
        test('should create a new process successfully', async () => {
            const scriptPath = './test-script.js';
            const port = 9000;
            const processName = 'test-process';

            // Simulate successful process start
            const createPromise = processManager.createProcess(scriptPath, port, processName);
            
            // Trigger stdout event to resolve promise
            const mockProcess = spawn.mock.results[0].value;
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
            stdoutCallback('Server started');

            const result = await createPromise;

            expect(spawn).toHaveBeenCalledWith('node', [scriptPath, port]);
            expect(result).toEqual({
                name: processName,
                port: port,
                process: mockProcess
            });
        });

        test('should handle process creation error', async () => {
            const scriptPath = './test-script.js';
            const port = 9000;
            const processName = 'test-process';

            const createPromise = processManager.createProcess(scriptPath, port, processName);
            
            // Trigger error event
            const mockProcess = spawn.mock.results[0].value;
            const errorCallback = mockProcess.on.mock.calls.find(call => call[0] === 'error')[1];
            errorCallback(new Error('Process failed to start'));

            await expect(createPromise).rejects.toThrow('Process failed to start');
        });

        test('should handle process close event', async () => {
            const scriptPath = './test-script.js';
            const port = 9000;
            const processName = 'test-process';

            const createPromise = processManager.createProcess(scriptPath, port, processName);
            
            // Get the mock process after spawn is called
            const mockProcess = spawn.mock.results[0].value;
            const processInfo = { name: processName, port, process: mockProcess };
            processManager.processPool.push(processInfo);
            
            // Trigger stdout to resolve creation
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
            stdoutCallback('Server started');
            
            await createPromise;

            // Trigger close event
            const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')[1];
            closeCallback(0);

            // Process should be removed from pool
            expect(processManager.processPool).toHaveLength(0);
        });
    });

    describe('getOrCreateProcessInPool', () => {
        test('should create new process when pool is empty', async () => {
            const scriptPath = './test-script.js';
            
            const getPromise = processManager.getOrCreateProcessInPool(scriptPath);
            
            // Wait for spawn to be called, then trigger stdout event to resolve process creation
            await new Promise(resolve => setTimeout(resolve, 0)); // Allow spawn to be called
            const mockProcess = spawn.mock.results[0].value;
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
            stdoutCallback('Server started');

            const result = await getPromise;

            expect(result.name).toBe('process-9000');
            expect(result.port).toBe(9000);
            expect(processManager.processPool).toHaveLength(1);
        });

        test('should return random process from pool when available', async () => {
            const scriptPath = './test-script.js';
            
            // Create mock process directly instead of using spawn.mock.results
            const mockProcess = {
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn(),
                kill: jest.fn()
            };
            
            // Add existing processes to pool
            const existingProcess1 = { name: 'process-8001', port: 8001, process: mockProcess };
            const existingProcess2 = { name: 'process-8002', port: 8002, process: mockProcess };
            const existingProcess3 = { name: 'process-8003', port: 8003, process: mockProcess };
            processManager.processPool = [existingProcess1, existingProcess2, existingProcess3];

            // Mock Math.random to return first item
            jest.spyOn(Math, 'random').mockReturnValue(0);

            const result = await processManager.getOrCreateProcessInPool(scriptPath);

            expect(result).toBe(existingProcess1);
            expect(spawn).not.toHaveBeenCalled();
            
            Math.random.mockRestore();
        });

        // test('should start watcher on first call', async () => {
        //     const scriptPath = './test-script.js';

        //     // Mock spawn to return a successful process
        //     const mockProcess = {
        //         pid: 12345,
        //         kill: jest.fn(),
        //         on: jest.fn((event, callback) => {
        //             if (event === 'spawn') {
        //                 // Simulate successful spawn
        //                 setTimeout(() => callback(), 0);
        //             }
        //         }),
        //         stdout: { on: jest.fn() },
        //         stderr: { on: jest.fn() }
        //     };

        //     spawn.mockReturnValue(mockProcess);

        //     // Mock getAvailablePort to return a port
        //     getAvailablePort.mockResolvedValue(8001);

        //     jest.spyOn(processManager, 'poolWatcher');

        //     const getPromise = processManager.getOrCreateProcessInPool(scriptPath);

        //     await getPromise;

        //     expect(processManager.poolWatcher).toHaveBeenCalled();
        //     expect(processManager.watcherStarted).toBe(true);
        // });

        // test('should throw error when no processes available', async () => {
        //     const scriptPath = './test-script.js';
            
        //     // Define mockProcess within this test
        //     const mockProcess = {
        //         pid: 12345,
        //         kill: jest.fn(),
        //         on: jest.fn(),
        //         stdout: { on: jest.fn() },
        //         stderr: { on: jest.fn() }
        //     };
            
        //     // Set pool to max size with mock processes
        //     processManager.processPool = new Array(3).fill({ name: 'test', port: 8000, process: mockProcess });
            
        //     // Mock process creation to fail
        //     spawn.mockImplementation(() => {
        //         const failedProcess = {
        //             stdout: { on: jest.fn() },
        //             stderr: { on: jest.fn() },
        //             on: jest.fn(),
        //             kill: jest.fn()
        //         };
                
        //         // Immediately trigger error
        //         setTimeout(() => {
        //             const errorCallback = failedProcess.on.mock.calls.find(call => call[0] === 'error')[1];
        //             if (errorCallback) errorCallback(new Error('Failed to create'));
        //         }, 0);
                
        //         return failedProcess;
        //     });
    
        //     await expect(processManager.getOrCreateProcessInPool(scriptPath))
        //         .rejects.toThrow('No processes available in pool');
        // });
    });

    describe('getPoolInfo', () => {
        test('should return pool information', () => {
            // Create a mock process object
            const mockProcess = {
                pid: 12345,
                kill: jest.fn(),
                on: jest.fn(),
                // Add other process properties as needed
            };

            const process1 = { name: 'process-8001', port: 8001, process: mockProcess };
            const process2 = { name: 'process-8002', port: 8002, process: mockProcess };
            processManager.processPool = [process1, process2];

            const info = processManager.getPoolInfo();

            expect(info).toEqual({
                poolSize: 2,
                maxPoolSize: 3,
                processes: [
                    { name: 'process-8001', port: 8001 },
                    { name: 'process-8002', port: 8002 }
                ]
            });
        });
    });

    describe('clearPool', () => {
        test('should clear the process pool', () => {
            // Create a mock process object
            const mockProcess = {
                pid: 12345,
                kill: jest.fn(),
                on: jest.fn(),
            };

            // Add processes to the pool
            const process1 = { name: 'process-8001', port: 8001, process: mockProcess };
            const process2 = { name: 'process-8002', port: 8002, process: mockProcess };
            processManager.processPool = [process1, process2];

            // Clear the pool
            processManager.clearPool();

            // Verify pool is empty
            expect(processManager.processPool).toEqual([]);
        });
    });

    describe('stopAllProcesses', () => {
        test('should stop all processes in pool', async () => {
            const mockProcess1 = { kill: jest.fn() };
            const mockProcess2 = { kill: jest.fn() };
            
            processManager.processPool = [
                { name: 'process-1', port: 8001, process: mockProcess1 },
                { name: 'process-2', port: 8002, process: mockProcess2 }
            ];

            await processManager.stopAllProcesses();

            expect(mockProcess1.kill).toHaveBeenCalled();
            expect(mockProcess2.kill).toHaveBeenCalled();
            expect(processManager.processPool).toEqual([]);
        });

        test('should handle errors when stopping processes', async () => {
            const mockProcess = { 
                kill: jest.fn().mockImplementation(() => {
                    throw new Error('Failed to kill');
                })
            };
            
            processManager.processPool = [
                { name: 'process-1', port: 8001, process: mockProcess }
            ];

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await processManager.stopAllProcesses();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Error stopping process process-1:', 
                'Failed to kill'
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('poolWatcher', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should remove process from pool after interval with no requests', () => {
            const mockProcess = { kill: jest.fn() };
            processManager.processPool = [
                { name: 'old-process', port: 8001, process: mockProcess }
            ];
            
            // Set last request time to more than 10 seconds ago
            processManager.lastProcessRequestTime = Date.now() - 11000;

            processManager.poolWatcher();

            // Fast-forward time
            jest.advanceTimersByTime(10000);

            expect(mockProcess.kill).toHaveBeenCalled();
            expect(processManager.processPool).toHaveLength(0);
        });

        test('should not remove process if recent request exists', () => {
            const mockProcess = { kill: jest.fn() };
            processManager.processPool = [
                { name: 'recent-process', port: 8001, process: mockProcess }
            ];
            
            // Set recent request time
            processManager.lastProcessRequestTime = Date.now();

            processManager.poolWatcher();

            // Fast-forward time
            jest.advanceTimersByTime(10000);

            expect(mockProcess.kill).not.toHaveBeenCalled();
            expect(processManager.processPool).toHaveLength(1);
        });
    });
});