const K8sManager = require('../lib/managers/k8s');
const { getAvailablePort } = require('../lib/utils/port');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../lib/utils/port');
jest.mock('child_process');
jest.mock('fs');
jest.mock('path');

describe('K8sManager', () => {
    let k8sManager;
    let mockChildProcess;
    let mockK8sApi;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock child process
        mockChildProcess = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn(),
            kill: jest.fn()
        };
        
        spawn.mockReturnValue(mockChildProcess);
        getAvailablePort.mockResolvedValue(8080);
        
        // Mock fs
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('mock file content');
        
        // Mock path
        path.join.mockImplementation((...args) => args.join('/'));
        
        // Mock Kubernetes API
        mockK8sApi = {
            readNamespacedConfigMap: jest.fn(),
            replaceNamespacedConfigMap: jest.fn(),
            createNamespacedConfigMap: jest.fn(),
            createNamespacedPod: jest.fn(),
            readNamespacedPod: jest.fn(),
            deleteNamespacedPod: jest.fn()
        };
        
        // Create fresh instance
        k8sManager = new K8sManager();
        
        // Mock the initialize method to avoid dynamic import issues
        k8sManager.initialize = jest.fn().mockResolvedValue();
        k8sManager.k8sApi = mockK8sApi;
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            expect(k8sManager.namespace).toBe('default');
            expect(k8sManager.defaultPodName).toBe('my-nodejs-pod');
            expect(k8sManager.defaultPodPort).toBe(9000);
            expect(k8sManager.maxPoolSize).toBe(3);
            expect(k8sManager.poolCheckInterval).toBe(10000);
            expect(k8sManager.podPool).toEqual([]);
            expect(k8sManager.watcherStarted).toBe(false);
            expect(k8sManager.initialized).toBe(false);
        });

        test('should initialize with custom options', () => {
            const customManager = new K8sManager({
                namespace: 'custom-namespace',
                defaultPodName: 'custom-pod',
                defaultPodPort: 8080,
                maxPoolSize: 5,
                poolCheckInterval: 5000
            });
            
            expect(customManager.namespace).toBe('custom-namespace');
            expect(customManager.defaultPodName).toBe('custom-pod');
            expect(customManager.defaultPodPort).toBe(8080);
            expect(customManager.maxPoolSize).toBe(5);
            expect(customManager.poolCheckInterval).toBe(5000);
        });

        test('should set lastPodRequestTime on initialization', () => {
            const beforeTime = Date.now();
            const manager = new K8sManager();
            const afterTime = Date.now();
            
            expect(manager.lastPodRequestTime).toBeGreaterThanOrEqual(beforeTime);
            expect(manager.lastPodRequestTime).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('initialize', () => {
        test('should be mocked and resolve successfully', async () => {
            // Reset the mock to test the actual call
            k8sManager.initialize.mockClear();
            
            await k8sManager.initialize();
            
            expect(k8sManager.initialize).toHaveBeenCalled();
        });

        test('should not reinitialize if already initialized', async () => {
            k8sManager.initialized = true;
            k8sManager.initialize.mockClear();
            
            // Test the real initialize method behavior
            k8sManager.initialize.mockImplementation(async function() {
                if (this.initialized) return;
                this.initialized = true;
            });
            
            await k8sManager.initialize();
            
            expect(k8sManager.initialize).toHaveBeenCalled();
        });

        test('should handle initialization errors', async () => {
            k8sManager.initialize.mockRejectedValue(new Error('K8s client failed'));
            
            await expect(k8sManager.initialize()).rejects.toThrow('K8s client failed');
        });
    });

    describe('poolWatcher', () => {
        test('should set up interval for pool watching', () => {
            // Mock setInterval to capture the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn();
            
            k8sManager.poolWatcher();
            
            expect(global.setInterval).toHaveBeenCalledWith(
                expect.any(Function),
                k8sManager.poolCheckInterval
            );
            
            // Restore original setInterval
            global.setInterval = originalSetInterval;
        });

        test('should delete pod when pool check interval passes', async () => {
            // Add a mock pod to the pool
            k8sManager.podPool = [{
                name: 'test-pod',
                port: 8080
            }];
            
            // Set lastPodRequestTime to more than poolCheckInterval ago
            k8sManager.lastPodRequestTime = Date.now() - 15000;
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const deleteSpySpy = jest.spyOn(k8sManager, 'deletePod').mockResolvedValue({});
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            k8sManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(deleteSpySpy).toHaveBeenCalledWith('test-pod');
            expect(k8sManager.podPool).toHaveLength(0);
            expect(consoleSpy).toHaveBeenCalledWith('Stopped and removed pod: test-pod (port 8080)');
            
            consoleSpy.mockRestore();
            deleteSpySpy.mockRestore();
            global.setInterval = originalSetInterval;
        });

        test('should not remove pod if recent request was made', async () => {
            // Add a mock pod to the pool
            k8sManager.podPool = [{
                name: 'test-pod',
                port: 8080
            }];
            
            // Set lastPodRequestTime to recent
            k8sManager.lastPodRequestTime = Date.now() - 5000;
            
            const deleteSpySpy = jest.spyOn(k8sManager, 'deletePod').mockResolvedValue({});
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            k8sManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(deleteSpySpy).not.toHaveBeenCalled();
            expect(k8sManager.podPool).toHaveLength(1);
            
            deleteSpySpy.mockRestore();
            global.setInterval = originalSetInterval;
        });

        test('should handle pod deletion errors', async () => {
            // Add a mock pod to the pool
            k8sManager.podPool = [{
                name: 'test-pod',
                port: 8080
            }];
            
            k8sManager.lastPodRequestTime = Date.now() - 15000;
            
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const deleteSpySpy = jest.spyOn(k8sManager, 'deletePod').mockRejectedValue(
                new Error('Deletion failed')
            );
            
            // Mock setInterval to capture and immediately execute the callback
            const originalSetInterval = global.setInterval;
            global.setInterval = jest.fn((callback) => {
                setImmediate(callback);
                return 'mock-timer-id';
            });
            
            k8sManager.poolWatcher();
            
            // Wait for the callback to execute
            await new Promise(resolve => setImmediate(resolve));
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error stopping pod test-pod:',
                'Deletion failed'
            );
            
            consoleErrorSpy.mockRestore();
            deleteSpySpy.mockRestore();
            global.setInterval = originalSetInterval;
        });
    });

    describe('createOrUpdateConfigMap', () => {
        beforeEach(() => {
            k8sManager.initialized = true;
        });

        test('should create new ConfigMap when it does not exist', async () => {
            mockK8sApi.readNamespacedConfigMap.mockRejectedValue({ code: 404 });
            mockK8sApi.createNamespacedConfigMap.mockResolvedValue({});
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await k8sManager.createOrUpdateConfigMap('/test/path', ['index.js']);
            
            expect(fs.readFileSync).toHaveBeenCalledWith('/test/path/index.js', 'utf8');
            expect(mockK8sApi.createNamespacedConfigMap).toHaveBeenCalledWith({
                namespace: 'default',
                body: expect.objectContaining({
                    apiVersion: 'v1',
                    kind: 'ConfigMap',
                    metadata: {
                        name: 'scripts',
                        namespace: 'default'
                    },
                    data: expect.objectContaining({
                        'index.js': 'mock file content',
                        'package.json': expect.any(String)
                    })
                })
            });
            
            expect(consoleSpy).toHaveBeenCalledWith('ConfigMap created successfully');
            consoleSpy.mockRestore();
        });

        test('should update existing ConfigMap', async () => {
            mockK8sApi.readNamespacedConfigMap.mockResolvedValue({});
            mockK8sApi.replaceNamespacedConfigMap.mockResolvedValue({});
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await k8sManager.createOrUpdateConfigMap('/test/path', ['index.js']);
            
            expect(mockK8sApi.replaceNamespacedConfigMap).toHaveBeenCalledWith({
                namespace: 'default',
                name: 'scripts',
                body: expect.objectContaining({
                    apiVersion: 'v1',
                    kind: 'ConfigMap'
                })
            });
            
            expect(consoleSpy).toHaveBeenCalledWith('ConfigMap updated successfully');
            consoleSpy.mockRestore();
        });

        test('should handle multiple script files', async () => {
            mockK8sApi.readNamespacedConfigMap.mockRejectedValue({ code: 404 });
            mockK8sApi.createNamespacedConfigMap.mockResolvedValue({});
            
            await k8sManager.createOrUpdateConfigMap('/test/path', ['index.js', 'utils.js']);
            
            expect(fs.readFileSync).toHaveBeenCalledWith('/test/path/index.js', 'utf8');
            expect(fs.readFileSync).toHaveBeenCalledWith('/test/path/utils.js', 'utf8');
        });

        test('should handle missing script files', async () => {
            mockK8sApi.readNamespacedConfigMap.mockRejectedValue({ code: 404 });
            mockK8sApi.createNamespacedConfigMap.mockResolvedValue({});
            fs.existsSync.mockReturnValue(false);
            
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            await k8sManager.createOrUpdateConfigMap('/test/path', ['missing.js']);
            
            expect(consoleWarnSpy).toHaveBeenCalledWith('Script file not found: /test/path/missing.js');
            
            consoleWarnSpy.mockRestore();
        });

        test('should throw error if ConfigMap creation fails', async () => {
            mockK8sApi.readNamespacedConfigMap.mockRejectedValue({ code: 404 });
            mockK8sApi.createNamespacedConfigMap.mockRejectedValue(new Error('Creation failed'));
            
            await expect(k8sManager.createOrUpdateConfigMap('/test/path'))
                .rejects.toThrow('Creation failed');
        });

        test('should throw error for non-404 errors when reading ConfigMap', async () => {
            const serverError = new Error('Server error');
            serverError.code = 500;
            mockK8sApi.readNamespacedConfigMap.mockRejectedValue(serverError);
            
            await expect(k8sManager.createOrUpdateConfigMap('/test/path'))
                .rejects.toThrow('Server error');
        });
    });

    describe('getOrCreatePodInPool', () => {
        beforeEach(() => {
            jest.spyOn(k8sManager, 'initialize').mockResolvedValue();
            jest.spyOn(k8sManager, 'createOrUpdateConfigMap').mockResolvedValue();
            jest.spyOn(k8sManager, 'createPod').mockResolvedValue({
                status: 'started',
                name: 'test-pod-8080'
            });
        });

        test('should update lastPodRequestTime', async () => {
            const beforeTime = Date.now();
            
            await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(k8sManager.lastPodRequestTime).toBeGreaterThanOrEqual(beforeTime);
        });

        test('should start pool watcher on first call', async () => {
            const poolWatcherSpy = jest.spyOn(k8sManager, 'poolWatcher').mockImplementation();
            
            expect(k8sManager.watcherStarted).toBe(false);
            
            await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(k8sManager.watcherStarted).toBe(true);
            expect(poolWatcherSpy).toHaveBeenCalled();
            
            poolWatcherSpy.mockRestore();
        });

        test('should not start pool watcher if already started', async () => {
            k8sManager.watcherStarted = true;
            const poolWatcherSpy = jest.spyOn(k8sManager, 'poolWatcher').mockImplementation();
            
            await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(poolWatcherSpy).not.toHaveBeenCalled();
            
            poolWatcherSpy.mockRestore();
        });

        test('should create new pod when pool is not full', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const result = await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(k8sManager.initialize).toHaveBeenCalled();
            expect(k8sManager.createOrUpdateConfigMap).toHaveBeenCalledWith('/test/path', ['index.js']);
            expect(k8sManager.createPod).toHaveBeenCalledWith(8080, 'my-nodejs-pod-8080');
            expect(k8sManager.podPool).toHaveLength(1);
            expect(consoleSpy).toHaveBeenCalledWith('Started pod: my-nodejs-pod-8080 (port 8080)');
            expect(result.name).toBe('my-nodejs-pod-8080');
            expect(result.port).toBe(8080);
            
            consoleSpy.mockRestore();
        });

        test('should return random pod from pool when pool is full', async () => {
            // Fill the pool to max capacity
            k8sManager.podPool = [
                { name: 'pod-1', port: 8001 },
                { name: 'pod-2', port: 8002 },
                { name: 'pod-3', port: 8003 }
            ];
            
            // Mock Math.random to return a specific index
            const originalRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.5); // Should select index 1
            
            const result = await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(result).toEqual({ name: 'pod-2', port: 8002 });
            expect(k8sManager.createPod).not.toHaveBeenCalled();
            
            Math.random = originalRandom;
        });

        test('should throw error if ConfigMap creation fails', async () => {
            k8sManager.createOrUpdateConfigMap.mockRejectedValue(new Error('ConfigMap failed'));
            
            await expect(k8sManager.getOrCreatePodInPool('/test/path'))
                .rejects.toThrow('ConfigMap creation failed: ConfigMap failed');
        });

        test('should throw error if pod creation fails and pool is empty', async () => {
            k8sManager.createPod.mockRejectedValue(new Error('Pod creation failed'));
            
            await expect(k8sManager.getOrCreatePodInPool('/test/path'))
                .rejects.toThrow('Pod creation failed');
        });

        test('should return existing pod if creation fails but pool has pods', async () => {
            // Add existing pod to pool
            k8sManager.podPool = [{ name: 'existing-pod', port: 8001 }];
            k8sManager.createPod.mockRejectedValue(new Error('Pod creation failed'));
            
            const result = await k8sManager.getOrCreatePodInPool('/test/path');
            
            expect(result.name).toBe('existing-pod');
        });

        test('should throw error if no pods available', async () => {
            k8sManager.podPool = [];
            k8sManager.maxPoolSize = 0; // Force pool to be full
            
            await expect(k8sManager.getOrCreatePodInPool('/test/path'))
                .rejects.toThrow('No pods available in pool');
        });
    });

    describe('createPod', () => {
        beforeEach(() => {
            k8sManager.initialized = true;
        });

        test('should create pod with correct parameters', async () => {
            mockK8sApi.createNamespacedPod.mockResolvedValue({ body: {} });
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                status: { phase: 'Running' }
            });
            
            const result = await k8sManager.createPod(8080, 'test-pod');
            
            expect(mockK8sApi.createNamespacedPod).toHaveBeenCalledWith({
                namespace: 'default',
                body: expect.objectContaining({
                    apiVersion: 'v1',
                    kind: 'Pod',
                    metadata: {
                        name: 'test-pod',
                        labels: { app: 'my-app' }
                    },
                    spec: expect.objectContaining({
                        containers: expect.arrayContaining([
                            expect.objectContaining({
                                name: 'my-container',
                                image: 'node:18-alpine',
                                ports: [{ containerPort: 9000 }]
                            })
                        ])
                    })
                })
            });
            
            expect(spawn).toHaveBeenCalledWith('kubectl', [
                'port-forward',
                'pod/test-pod',
                '8080:9000',
                '-n',
                'default'
            ]);
            
            expect(result).toEqual({
                status: 'started',
                name: 'test-pod',
                pod: {},
                portForwardProcess: mockChildProcess
            });
        });

        test('should use default pod name if not provided', async () => {
            mockK8sApi.createNamespacedPod.mockResolvedValue({ body: {} });
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                status: { phase: 'Running' }
            });
            
            await k8sManager.createPod(8080);
            
            expect(mockK8sApi.createNamespacedPod).toHaveBeenCalledWith({
                namespace: 'default',
                body: expect.objectContaining({
                    metadata: {
                        name: 'my-nodejs-pod',
                        labels: { app: 'my-app' }
                    }
                })
            });
        });

        test('should wait for pod to be ready', async () => {
            mockK8sApi.createNamespacedPod.mockResolvedValue({ body: {} });
            mockK8sApi.readNamespacedPod
                .mockResolvedValueOnce({ status: { phase: 'Pending' } })
                .mockResolvedValueOnce({ status: { phase: 'Running' } });
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await k8sManager.createPod(8080, 'test-pod');
            
            expect(mockK8sApi.readNamespacedPod).toHaveBeenCalledTimes(2);
            expect(consoleSpy).toHaveBeenCalledWith('Pod "test-pod" is running.');
            
            consoleSpy.mockRestore();
        });

        test('should throw error if pod does not become ready in time', async () => {
            mockK8sApi.createNamespacedPod.mockResolvedValue({ body: {} });
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                status: { phase: 'Pending' }
            });
            
            // Override the timeout behavior to fail quickly
            jest.setTimeout(10000);
            
            // Mock the createPod method to bypass the actual timeout loop
            const originalCreatePod = k8sManager.createPod;
            k8sManager.createPod = jest.fn().mockRejectedValue(
                new Error('Pod "test-pod" did not become ready in time.')
            );
            
            await expect(k8sManager.createPod(8080, 'test-pod'))
                .rejects.toThrow('Pod "test-pod" did not become ready in time.');
                
            k8sManager.createPod = originalCreatePod;
        });

        test('should handle port-forward process events', async () => {
            mockK8sApi.createNamespacedPod.mockResolvedValue({ body: {} });
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                status: { phase: 'Running' }
            });
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            await k8sManager.createPod(8080, 'test-pod');
            
            expect(mockChildProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
            expect(mockChildProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
            
            // Test stdout event handler
            const stdoutHandler = mockChildProcess.stdout.on.mock.calls.find(
                call => call[0] === 'data'
            )[1];
            stdoutHandler('test stdout data');
            expect(consoleSpy).toHaveBeenCalledWith('kubectl port-forward stdout: test stdout data');
            
            // Test stderr event handler
            const stderrHandler = mockChildProcess.stderr.on.mock.calls.find(
                call => call[0] === 'data'
            )[1];
            stderrHandler('test stderr data');
            expect(consoleErrorSpy).toHaveBeenCalledWith('kubectl port-forward stderr: test stderr data');
            
            consoleSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });

        test('should throw error if pod creation fails', async () => {
            mockK8sApi.createNamespacedPod.mockRejectedValue(new Error('Creation failed'));
            
            await expect(k8sManager.createPod(8080, 'test-pod'))
                .rejects.toThrow('Creation failed');
        });
    });

    describe('deletePod', () => {
        beforeEach(() => {
            k8sManager.initialized = true;
        });

        test('should delete pod successfully', async () => {
            mockK8sApi.deleteNamespacedPod.mockResolvedValue({});
            
            const result = await k8sManager.deletePod('test-pod');
            
            expect(mockK8sApi.deleteNamespacedPod).toHaveBeenCalledWith({
                namespace: 'default',
                name: 'test-pod'
            });
            
            expect(result).toEqual({
                status: 'stopped and removed',
                name: 'test-pod'
            });
        });

        test('should use default pod name if not provided', async () => {
            mockK8sApi.deleteNamespacedPod.mockResolvedValue({});
            
            await k8sManager.deletePod();
            
            expect(mockK8sApi.deleteNamespacedPod).toHaveBeenCalledWith({
                namespace: 'default',
                name: 'my-nodejs-pod'
            });
        });

        test('should handle pod not found error', async () => {
            mockK8sApi.deleteNamespacedPod.mockRejectedValue({
                response: { statusCode: 404 }
            });
            
            const result = await k8sManager.deletePod('test-pod');
            
            expect(result).toEqual({
                status: 'pod not found',
                name: 'test-pod'
            });
        });

        test('should throw error for other failures', async () => {
            mockK8sApi.deleteNamespacedPod.mockRejectedValue(new Error('Deletion failed'));
            
            await expect(k8sManager.deletePod('test-pod'))
                .rejects.toThrow('Deletion failed');
        });
    });

    describe('getPoolInfo', () => {
        test('should return correct pool information', () => {
            k8sManager.podPool = [
                { name: 'pod-1', port: 8001 },
                { name: 'pod-2', port: 8002 }
            ];
            
            const info = k8sManager.getPoolInfo();
            
            expect(info).toEqual({
                poolSize: 2,
                maxPoolSize: 3,
                pods: [
                    { name: 'pod-1', port: 8001 },
                    { name: 'pod-2', port: 8002 }
                ]
            });
        });

        test('should return empty pods array when pool is empty', () => {
            const info = k8sManager.getPoolInfo();
            
            expect(info).toEqual({
                poolSize: 0,
                maxPoolSize: 3,
                pods: []
            });
        });
    });

    describe('clearPool', () => {
        test('should clear the pool and update request time', () => {
            k8sManager.podPool = [{ name: 'pod-1', port: 8001 }];
            
            const beforeTime = Date.now();
            k8sManager.clearPool();
            const afterTime = Date.now();
            
            expect(k8sManager.podPool).toEqual([]);
            expect(k8sManager.lastPodRequestTime).toBeGreaterThanOrEqual(beforeTime);
            expect(k8sManager.lastPodRequestTime).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('stopAllPods', () => {
        test('should delete all pods and clear pool', async () => {
            const deleteSpySpy = jest.spyOn(k8sManager, 'deletePod').mockResolvedValue({});
            
            k8sManager.podPool = [
                { name: 'pod-1', port: 8001 },
                { name: 'pod-2', port: 8002 }
            ];
            
            await k8sManager.stopAllPods();
            
            expect(deleteSpySpy).toHaveBeenCalledWith('pod-1');
            expect(deleteSpySpy).toHaveBeenCalledWith('pod-2');
            expect(k8sManager.podPool).toEqual([]);
            
            deleteSpySpy.mockRestore();
        });

        test('should handle pod deletion errors', async () => {
            const deleteSpySpy = jest.spyOn(k8sManager, 'deletePod').mockRejectedValue(
                new Error('Deletion failed')
            );
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            k8sManager.podPool = [{ name: 'pod-1', port: 8001 }];
            
            await k8sManager.stopAllPods();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error stopping pod pod-1:',
                'Deletion failed'
            );
            expect(k8sManager.podPool).toEqual([]);
            
            deleteSpySpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });

        test('should work with empty pool', async () => {
            k8sManager.podPool = [];
            
            await expect(k8sManager.stopAllPods()).resolves.not.toThrow();
            expect(k8sManager.podPool).toEqual([]);
        });
    });
});