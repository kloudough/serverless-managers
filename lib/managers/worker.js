const { Worker } = require('worker_threads');
const { getAvailablePort } = require('../utils/port');

class WorkerManager {
    constructor(options = {}) {
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        
        this.workerPool = [];
        this.lastWorkerRequestTime = Date.now();
        this.watcherStarted = false;
    }

    async poolWatcher() {
        setInterval(async () => {
            const now = Date.now();
            // If no new request in the last 10 seconds and pool is not empty
            if (this.workerPool.length > 0 && now - this.lastWorkerRequestTime > this.poolCheckInterval) {
                const { name: workerName, worker } = this.workerPool.shift();
                try {
                    await worker.terminate();
                    console.log(`Stopped and removed worker: ${workerName}`);
                } catch (err) {
                    console.error(`Error stopping worker ${workerName}:`, err.message);
                }
            }
        }, this.poolCheckInterval);
    }

    async getOrCreateWorkerInPool(scriptPath) {
        this.lastWorkerRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            this.poolWatcher();
        }

        // If pool is not full, create a new worker
        if (this.workerPool.length < this.maxPoolSize) {
            let port = await getAvailablePort();
            const workerName = `worker-${port}`;
            
            try {
                const workerInfo = await this.createWorker(scriptPath, port, workerName);
                this.workerPool.push(workerInfo);
                console.log(`Started worker: ${workerName} (port ${port})`);
                return workerInfo;
            } catch (err) {
                if (this.workerPool.length === 0) {
                    throw err;
                }
            }
        }
        
        // If pool has workers, return a random one
        if (this.workerPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.workerPool.length);
            return this.workerPool[randomIndex];
        }

        throw new Error('No workers available in pool');
    }

    createWorker(scriptPath, port, workerName) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(scriptPath, { 
                workerData: { port, name: workerName } 
            });
            
            worker.on('online', () => {
                const workerInfo = { name: workerName, port, worker };
                resolve(workerInfo);
            });

            worker.on('message', (msg) => {
                console.log(`worker ${workerName} message: ${msg}`);
            });

            worker.on('error', (err) => {
                console.error(`worker ${workerName} error: ${err}`);
                reject(err);
            });

            worker.on('exit', (code) => {
                console.log(`worker ${workerName} exited with code ${code}`);
                // Remove from pool when worker exits
                const index = this.workerPool.findIndex(w => w.name === workerName);
                if (index !== -1) {
                    this.workerPool.splice(index, 1);
                }
            });
        });
    }

    getPoolInfo() {
        return {
            poolSize: this.workerPool.length,
            maxPoolSize: this.maxPoolSize,
            workers: this.workerPool.map(w => ({ name: w.name, port: w.port }))
        };
    }

    clearPool() {
        this.workerPool = [];
        this.lastWorkerRequestTime = Date.now();
    }

    async stopAllWorkers() {
        const promises = this.workerPool.map(async ({ name, worker }) => {
            try {
                await worker.terminate();
                console.log(`Stopped worker: ${name}`);
            } catch (err) {
                console.error(`Error stopping worker ${name}:`, err.message);
            }
        });
        
        await Promise.all(promises);
        this.clearPool();
    }
}

module.exports = WorkerManager;