const { spawn } = require('child_process');
const { getAvailablePort } = require('../utils/port');

class ProcessManager {
    constructor(options = {}) {
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        
        this.processPool = [];
        this.lastProcessRequestTime = Date.now();
        this.watcherStarted = false;
    }

    async poolWatcher() {
        setInterval(async () => {
            const now = Date.now();
            // If no new request in the last 10 seconds and pool is not empty
            if (this.processPool.length > 0 && now - this.lastProcessRequestTime > this.poolCheckInterval) {
                const { name: processName, process } = this.processPool.shift();
                try {
                    process.kill();
                    console.log(`Stopped and removed process: ${processName}`);
                } catch (err) {
                    console.error(`Error stopping process ${processName}:`, err.message);
                }
            }
        }, this.poolCheckInterval);
    }

    async getOrCreateProcessInPool(scriptPath) {
        this.lastProcessRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            this.poolWatcher();
        }

        // If pool is not full, create a new process
        if (this.processPool.length < this.maxPoolSize) {
            let port = await getAvailablePort();
            const processName = `process-${port}`;
            
            try {
                const processInfo = await this.createProcess(scriptPath, port, processName);
                this.processPool.push(processInfo);
                console.log(`Started process: ${processName} (port ${port})`);
                return processInfo;
            } catch (err) {
                if (this.processPool.length === 0) {
                    throw err;
                }
            }
        }
        
        // If pool has processes, return a random one
        if (this.processPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.processPool.length);
            return this.processPool[randomIndex];
        }

        throw new Error('No processes available in pool');
    }

    createProcess(scriptPath, port, processName) {
        return new Promise((resolve, reject) => {
            const childProcess = spawn('node', [scriptPath, port]);

            childProcess.stdout.on('data', (data) => {
                console.log(`${processName} stdout: ${data}`);
                // Resolve when first stdout is received (indicates app started)
                const processInfo = { name: processName, port, process: childProcess };
                resolve(processInfo);
            });

            childProcess.stderr.on('data', (data) => {
                console.error(`${processName} stderr: ${data}`);
            });

            childProcess.on('close', (code) => {
                console.log(`${processName} exited with code ${code}`);
                // Remove from pool when process exits
                const index = this.processPool.findIndex(p => p.name === processName);
                if (index !== -1) {
                    this.processPool.splice(index, 1);
                }
            });

            childProcess.on('error', (err) => {
                console.error(`${processName} error: ${err}`);
                reject(err);
            });
        });
    }

    getPoolInfo() {
        return {
            poolSize: this.processPool.length,
            maxPoolSize: this.maxPoolSize,
            processes: this.processPool.map(p => ({ name: p.name, port: p.port }))
        };
    }

    clearPool() {
        this.processPool = [];
        this.lastProcessRequestTime = Date.now();
    }

    async stopAllProcesses() {
        const promises = this.processPool.map(async ({ name, process }) => {
            try {
                process.kill();
                console.log(`Stopped process: ${name}`);
            } catch (err) {
                console.error(`Error stopping process ${name}:`, err.message);
            }
        });
        
        await Promise.all(promises);
        this.clearPool();
    }
}

module.exports = ProcessManager;