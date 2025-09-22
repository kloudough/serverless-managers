const DockerManager = require('../lib/managers/docker');
const { getAvailablePort } = require('../lib/utils/port');
const Docker = require('dockerode');

// Mock dependencies
jest.mock('dockerode');
jest.mock('../lib/utils/port');

describe('DockerManager', () => {
    let dockerManager;
    let mockDocker;
    let mockContainer;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockContainer = {
            id: 'mock-container-id',
            start: jest.fn().mockResolvedValue(undefined),
            stop: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined)
        };

        mockDocker = {
            createContainer: jest.fn().mockResolvedValue(mockContainer),
            getContainer: jest.fn().mockReturnValue(mockContainer)
        };

        Docker.mockImplementation(() => mockDocker);
        getAvailablePort.mockResolvedValue(3000);

        dockerManager = new DockerManager();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            const manager = new DockerManager();
            expect(manager.defaultContainerName).toBe('my-nodejs-express');
            expect(manager.defaultImageName).toBe('my-nodejs-express');
            expect(manager.maxPoolSize).toBe(3);
            expect(manager.poolCheckInterval).toBe(10000);
            expect(manager.containerPool).toEqual([]);
        });

        test('should initialize with custom options', () => {
            const options = {
                defaultContainerName: 'custom-container',
                defaultImageName: 'custom-image',
                maxPoolSize: 5,
                poolCheckInterval: 5000
            };
            const manager = new DockerManager(options);
            expect(manager.defaultContainerName).toBe('custom-container');
            expect(manager.defaultImageName).toBe('custom-image');
            expect(manager.maxPoolSize).toBe(5);
            expect(manager.poolCheckInterval).toBe(5000);
        });
    });

    describe('createContainer', () => {
        test('should create container successfully', async () => {
            const result = await dockerManager.createContainer(3000, 'test-container', '/path/to/script', ['index.js']);
            
            expect(mockDocker.createContainer).toHaveBeenCalledWith({
                Image: 'my-nodejs-express',
                name: 'test-container',
                ExposedPorts: { '9000/tcp': {} },
                HostConfig: {
                    PortBindings: { '9000/tcp': [{ HostPort: '3000' }] },
                    Binds: ['/path/to/script/index.js:/usr/src/app/index.js']
                },
                WorkingDir: '/usr/src/app',
                Cmd: ['node', 'index.js', '9000']
            });
            expect(mockContainer.start).toHaveBeenCalled();
            expect(result).toEqual({
                id: 'mock-container-id',
                status: 'started',
                name: 'test-container'
            });
        });

        test('should throw error when scriptDir is not provided', async () => {
            await expect(dockerManager.createContainer(3000, 'test-container'))
                .rejects.toThrow('scriptDir is required to bind the script into the container');
        });

        test('should throw error when scriptFiles is empty', async () => {
            await expect(dockerManager.createContainer(3000, 'test-container', '/path/to/script', []))
                .rejects.toThrow('At least one script file must be specified');
        });

        test('should handle multiple script files', async () => {
            await dockerManager.createContainer(3000, 'test-container', '/path/to/script', ['index.js', 'utils.js']);
            
            expect(mockDocker.createContainer).toHaveBeenCalledWith(
                expect.objectContaining({
                    HostConfig: expect.objectContaining({
                        Binds: [
                            '/path/to/script/index.js:/usr/src/app/index.js',
                            '/path/to/script/utils.js:/usr/src/app/utils.js'
                        ]
                    })
                })
            );
        });
    });

    describe('stopContainer', () => {
        test('should stop and remove container successfully', async () => {
            const result = await dockerManager.stopContainer('test-container');
            
            expect(mockDocker.getContainer).toHaveBeenCalledWith('test-container');
            expect(mockContainer.stop).toHaveBeenCalled();
            expect(mockContainer.remove).toHaveBeenCalled();
            expect(result).toEqual({
                status: 'stopped and removed',
                name: 'test-container'
            });
        });

        test('should handle container not found error', async () => {
            const error = new Error('Container not found');
            error.statusCode = 404;
            mockDocker.getContainer.mockImplementation(() => {
                throw error;
            });

            const result = await dockerManager.stopContainer('non-existent');
            expect(result).toEqual({
                status: 'container not found',
                name: 'non-existent'
            });
        });

        test('should ignore already stopped container error', async () => {
            const error = new Error('Container already stopped');
            error.statusCode = 304;
            mockContainer.stop.mockRejectedValue(error);

            const result = await dockerManager.stopContainer('test-container');
            expect(result).toEqual({
                status: 'stopped and removed',
                name: 'test-container'
            });
        });
    });

    describe('getOrCreateContainerInPool', () => {
        test('should create new container when pool is empty', async () => {
            const result = await dockerManager.getOrCreateContainerInPool('/path/to/script');
            
            expect(getAvailablePort).toHaveBeenCalled();
            expect(mockDocker.createContainer).toHaveBeenCalled();
            expect(dockerManager.containerPool).toHaveLength(1);
            expect(result).toEqual({
                name: 'my-nodejs-express-3000',
                port: 3000
            });
        });

        // test('should return existing container from pool', async () => {
        //     dockerManager.containerPool = [{ name: 'existing-container', port: 8080 }];
            
        //     const result = await dockerManager.getOrCreateContainerInPool('/path/to/script');
            
        //     expect(result.name).toBe('existing-container');
        //     expect(result.port).toBe(8080);
        // });

        // test('should throw error when no containers available', async () => {
        //     mockDocker.createContainer.mockRejectedValue(new Error('Creation failed'));
            
        //     await expect(dockerManager.getOrCreateContainerInPool('/path/to/script'))
        //         .rejects.toThrow('No containers available in pool');
        // });
    });

    describe('getPoolInfo', () => {
        test('should return pool information', () => {
            dockerManager.containerPool = [
                { name: 'container1', port: 3000 },
                { name: 'container2', port: 3001 }
            ];

            const info = dockerManager.getPoolInfo();
            expect(info).toEqual({
                poolSize: 2,
                maxPoolSize: 3,
                containers: [
                    { name: 'container1', port: 3000 },
                    { name: 'container2', port: 3001 }
                ]
            });
        });
    });

    describe('clearPool', () => {
        test('should clear container pool', () => {
            dockerManager.containerPool = [{ name: 'container1', port: 3000 }];
            dockerManager.clearPool();
            
            expect(dockerManager.containerPool).toEqual([]);
            expect(dockerManager.lastDockerRequestTime).toBeDefined();
        });
    });

    describe('stopAllContainers', () => {
        test('should stop all containers in pool', async () => {
            dockerManager.containerPool = [
                { name: 'container1', port: 3000 },
                { name: 'container2', port: 3001 }
            ];

            await dockerManager.stopAllContainers();

            expect(mockDocker.getContainer).toHaveBeenCalledTimes(2);
            expect(dockerManager.containerPool).toEqual([]);
        });

        test('should handle errors when stopping containers', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockContainer.stop.mockRejectedValue(new Error('Stop failed'));
            dockerManager.containerPool = [{ name: 'container1', port: 3000 }];

            await dockerManager.stopAllContainers();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Error stopping container container1:',
                'Stop failed'
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

        test('should start pool watcher', () => {
            const setIntervalSpy = jest.spyOn(global, 'setInterval');
            dockerManager.poolWatcher();
            
            expect(setIntervalSpy).toHaveBeenCalledWith(
                expect.any(Function),
                dockerManager.poolCheckInterval
            );
        });
    });
});