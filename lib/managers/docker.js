const Docker = require('dockerode');
const { getAvailablePort } = require('../utils/port');

class DockerManager {
    constructor(options = {}) {
        this.docker = new Docker();
        this.defaultContainerName = options.defaultContainerName || 'my-nodejs-express';
        this.defaultImageName = options.defaultImageName || 'my-nodejs-express';
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        this.containerTimeout = options.containerTimeout || 30000; // 30 seconds
        this.shutdownTimeout = options.shutdownTimeout || 10000; // 10 seconds for Docker operations
        
        this.containerPool = [];
        this.lastDockerRequestTime = Date.now();
        this.watcherStarted = false;
        this.watcherInterval = null;
        this.isShuttingDown = false;
        
        // Graceful shutdown handling
        this.setupShutdownHandlers();
    }

    setupShutdownHandlers() {
        const shutdownHandler = () => {
            this.shutdown().catch(console.error);
        };
        
        process.once('SIGINT', shutdownHandler);
        process.once('SIGTERM', shutdownHandler);
        process.once('beforeExit', shutdownHandler);
    }

    async poolWatcher() {
        if (this.watcherInterval) {
            return; // Already started
        }
        
        this.watcherInterval = setInterval(async () => {
            if (this.isShuttingDown) {
                return;
            }
            
            const now = Date.now();
            // If no new request in the last interval and pool is not empty
            if (this.containerPool.length > 0 && now - this.lastDockerRequestTime > this.poolCheckInterval) {
                const containerToRemove = this.containerPool.shift();
                if (containerToRemove) {
                    await this.terminateContainer(containerToRemove);
                }
            }
        }, this.poolCheckInterval);
    }

    async terminateContainer(containerInfo) {
        const { name: containerName, port: containerPort } = containerInfo;
        try {
            await Promise.race([
                this.stopContainer(containerName),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Container termination timeout')), this.shutdownTimeout)
                )
            ]);
            console.log(`Stopped and removed container: ${containerName} (port ${containerPort})`);
        } catch (err) {
            console.error(`Error stopping container ${containerName}:`, err.message);
            // Force remove if graceful stop fails
            try {
                const container = this.docker.getContainer(containerName);
                await container.remove({ force: true });
                console.log(`Force removed container: ${containerName}`);
            } catch (forceErr) {
                console.error(`Error force removing container ${containerName}:`, forceErr.message);
            }
        }
    }

    async getOrCreateContainerInPool(scriptDirPath, scriptFiles = ['index.js']) {
        if (this.isShuttingDown) {
            throw new Error('DockerManager is shutting down');
        }

        if (!scriptDirPath) {
            throw new Error('Script directory path is required');
        }

        this.lastDockerRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            await this.poolWatcher();
        }

        // Try to create a new container if pool is not full
        if (this.containerPool.length < this.maxPoolSize) {
            try {
                const port = await getAvailablePort();
                const containerName = `${this.defaultContainerName}-${port}-${Date.now()}`;
                const result = await this.createContainer(port, containerName, scriptDirPath, scriptFiles);
                
                // Double-check pool size in case it changed during async operation
                if (this.containerPool.length < this.maxPoolSize) {
                    const containerInfo = { 
                        name: containerName, 
                        port,
                        id: result.id,
                        createdAt: Date.now(),
                        lastUsed: Date.now()
                    };
                    this.containerPool.push(containerInfo);
                    console.log(`Started container: ${containerName} (port ${port})`);
                    return containerInfo;
                } else {
                    // Pool filled up while we were creating, terminate this container
                    await this.terminateContainer({ name: containerName, port });
                }
            } catch (err) {
                console.warn(`Failed to create new container: ${err.message}`);
                // Continue to try existing containers
            }
        }

        // Return existing container from pool
        if (this.containerPool.length > 0) {
            // Use round-robin instead of random for better load distribution
            const containerIndex = Math.floor(Date.now() / 1000) % this.containerPool.length;
            const selectedContainer = this.containerPool[containerIndex];
            
            // Verify container is still alive
            if (selectedContainer) {
                try {
                    const container = this.docker.getContainer(selectedContainer.name);
                    const info = await container.inspect();
                    if (info.State.Running) {
                        selectedContainer.lastUsed = Date.now();
                        return selectedContainer;
                    } else {
                        // Remove dead container and try again
                        this.containerPool.splice(containerIndex, 1);
                        if (this.containerPool.length > 0) {
                            return this.containerPool[0];
                        }
                    }
                } catch (err) {
                    // Container doesn't exist, remove from pool
                    this.containerPool.splice(containerIndex, 1);
                    if (this.containerPool.length > 0) {
                        return this.containerPool[0];
                    }
                }
            }
        }

        throw new Error('No containers available in pool');
    }

    async createContainer(port = 8080, containerName = null, scriptDir, scriptFiles = ['index.js']) {
        return new Promise(async (resolve, reject) => {
            let isResolved = false;
            
            // Set timeout for container creation
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error(`Container creation timeout after ${this.containerTimeout}ms`));
                }
            }, this.containerTimeout);

            try {
                containerName = containerName || this.defaultContainerName;
                console.log(`Creating container "${containerName}" on port ${port}`);
                
                if (!scriptDir) {
                    clearTimeout(timeoutId);
                    return reject(new Error('scriptDir is required to bind the script into the container'));
                }
                
                scriptFiles = Array.isArray(scriptFiles) ? scriptFiles : [scriptFiles];
                
                if (!scriptFiles || scriptFiles.length === 0) {
                    clearTimeout(timeoutId);
                    return reject(new Error('At least one script file must be specified'));
                }
                
                const binds = scriptFiles.map(file => `${scriptDir}/${file}:/usr/src/app/${file}`);
                
                // Create and start the container
                const container = await this.docker.createContainer({
                    Image: this.defaultImageName,
                    name: containerName,
                    ExposedPorts: { '9000/tcp': {} },
                    HostConfig: {
                        PortBindings: { '9000/tcp': [{ HostPort: String(port) }] },
                        Binds: binds
                    },
                    WorkingDir: '/usr/src/app',
                    Cmd: ['node', 'index.js', '9000']
                });
                
                await container.start();
                
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    resolve({ id: container.id, status: 'started', name: containerName });
                }
            } catch (err) {
                clearTimeout(timeoutId);
                if (!isResolved) {
                    isResolved = true;
                    reject(err);
                }
            }
        });
    }

    removeContainerFromPool(containerName) {
        const index = this.containerPool.findIndex(c => c.name === containerName);
        if (index !== -1) {
            const removed = this.containerPool.splice(index, 1)[0];
            console.log(`Removed container ${containerName} from pool`);
            return removed;
        }
        return null;
    }

    async stopContainer(containerName = null) {
        containerName = containerName || this.defaultContainerName;
        
        try {
            const container = this.docker.getContainer(containerName);
            try {
                await container.stop();
            } catch (err) {
                // Ignore error if container is already stopped (HTTP code 304)
                if (err.statusCode !== 304) throw err;
            }
            await container.remove();
            return { status: 'stopped and removed', name: containerName };
        } catch (err) {
            if (err.statusCode === 404) {
                return { status: 'container not found', name: containerName };
            }
            throw err;
        }
    }

    getPoolInfo() {
        return {
            poolSize: this.containerPool.length,
            maxPoolSize: this.maxPoolSize,
            isShuttingDown: this.isShuttingDown,
            watcherStarted: this.watcherStarted,
            containers: this.containerPool.map(c => ({ 
                name: c.name, 
                port: c.port,
                id: c.id,
                createdAt: c.createdAt,
                lastUsed: c.lastUsed
            }))
        };
    }

    clearPool() {
        this.containerPool = [];
        this.lastDockerRequestTime = Date.now();
    }

    async stopAllContainers() {
        if (this.containerPool.length === 0) {
            return;
        }

        console.log(`Stopping ${this.containerPool.length} containers...`);
        
        const terminatePromises = this.containerPool.map(containerInfo => 
            this.terminateContainer(containerInfo)
        );
        
        try {
            await Promise.allSettled(terminatePromises);
        } catch (err) {
            console.error('Error during container termination:', err);
        }
        
        this.clearPool();
        console.log('All containers stopped');
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        console.log('DockerManager shutting down...');
        this.isShuttingDown = true;

        // Stop the pool watcher
        if (this.watcherInterval) {
            clearInterval(this.watcherInterval);
            this.watcherInterval = null;
        }

        // Stop all containers
        await this.stopAllContainers();

        // Remove process event listeners
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('beforeExit');

        console.log('DockerManager shutdown complete');
    }

    // Health check method
    async healthCheck() {
        const deadContainers = [];
        
        for (let i = this.containerPool.length - 1; i >= 0; i--) {
            const containerInfo = this.containerPool[i];
            try {
                const container = this.docker.getContainer(containerInfo.name);
                const info = await container.inspect();
                if (!info.State.Running) {
                    deadContainers.push(this.containerPool.splice(i, 1)[0]);
                }
            } catch (err) {
                // Container doesn't exist
                deadContainers.push(this.containerPool.splice(i, 1)[0]);
            }
        }

        if (deadContainers.length > 0) {
            console.log(`Removed ${deadContainers.length} dead containers from pool`);
        }

        return {
            totalContainers: this.containerPool.length,
            deadContainersRemoved: deadContainers.length,
            healthy: this.containerPool.length > 0 || !this.isShuttingDown
        };
    }
}

module.exports = DockerManager;