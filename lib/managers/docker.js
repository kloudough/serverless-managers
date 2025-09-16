const Docker = require('dockerode');
const { getAvailablePort } = require('../utils/port');

class DockerManager {
    constructor(options = {}) {
        this.docker = new Docker();
        this.defaultContainerName = options.defaultContainerName || 'my-nodejs-express';
        this.defaultImageName = options.defaultImageName || 'my-nodejs-express';
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        
        this.containerPool = [];
        this.lastDockerRequestTime = Date.now();
        this.watcherStarted = false;
    }

    async poolWatcher() {
        setInterval(async () => {
            const now = Date.now();
            // If no new request in the last 10 seconds and pool is not empty
            if (this.containerPool.length > 0 && now - this.lastDockerRequestTime > this.poolCheckInterval) {
                const { name: containerName, port: containerPort } = this.containerPool.shift();
                try {
                    await this.stopContainer(containerName);
                    console.log(`Stopped and removed container: ${containerName} (port ${containerPort})`);
                } catch (err) {
                    console.error(`Error stopping container ${containerName}:`, err.message);
                }
            }
        }, this.poolCheckInterval);
    }

    async getOrCreateContainerInPool(scriptDirPath, scriptFiles = ['index.js']) {
        this.lastDockerRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            this.poolWatcher();
        }

        if (this.containerPool.length < this.maxPoolSize) {
            const port = await getAvailablePort();
            const containerName = `${this.defaultContainerName}-${port}`;
            try {
                const result = await this.createContainer(port, containerName, scriptDirPath, scriptFiles);
                this.containerPool.push({ name: containerName, port });
                console.log(`Started container: ${containerName} (port ${port})`);
                console.log(result);
            } catch (err) {
                if (this.containerPool.length == 0) {
                    console.log(err.message);
                    throw err;
                }
            }
        }

        if (this.containerPool.length === 0) {
            throw new Error('No containers available in pool');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        const randomIndex = Math.floor(Math.random() * this.containerPool.length);
        const { name: containerName, port } = this.containerPool[randomIndex];
        return { name: containerName, port };
    }

    async createContainer(port = 8080, containerName = null, scriptDir, scriptFiles = ['index.js']) {
        containerName = containerName || this.defaultContainerName;
        console.log(`Creating container "${containerName}" on port ${port}`);
        //scriptDir and scriptFiles are required to bind the script into the container
        if (!scriptDir) {
            throw new Error('scriptDir is required to bind the script into the container');
        }
        scriptFiles = Array.isArray(scriptFiles) ? scriptFiles : [scriptFiles];
        //scriptFiles are required to bind the script into the container
        if (!scriptFiles || scriptFiles.length === 0) {
            throw new Error('At least one script file must be specified');
        }
        const binds = scriptFiles.map(file => `${scriptDir}/${file}:/usr/src/app/${file}`);
        try {
            // Create and start the container running index.js
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
            return { id: container.id, status: 'started', name: containerName };
        } catch (err) {
            throw err;
        }
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
            containers: this.containerPool.map(c => ({ name: c.name, port: c.port }))
        };
    }

    clearPool() {
        this.containerPool = [];
        this.lastDockerRequestTime = Date.now();
    }

    async stopAllContainers() {
        const promises = this.containerPool.map(async ({ name }) => {
            try {
                await this.stopContainer(name);
            } catch (err) {
                console.error(`Error stopping container ${name}:`, err.message);
            }
        });
        
        await Promise.all(promises);
        this.clearPool();
    }
}

module.exports = DockerManager;