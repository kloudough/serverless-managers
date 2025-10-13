const { Worker } = require('worker_threads');
const { getAvailablePort } = require('../utils/port');

class WorkerManager {
    constructor(options = {}) {
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        this.workerTimeout = options.workerTimeout || 30000; // 30 seconds
        this.shutdownTimeout = options.shutdownTimeout || 5000; // 5 seconds
        
        this.workerPool = [];
        this.lastWorkerRequestTime = Date.now();
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
            if (this.workerPool.length > 0 && now - this.lastWorkerRequestTime > this.poolCheckInterval) {
                const workerToRemove = this.workerPool.shift();
                if (workerToRemove) {
                    await this.terminateWorker(workerToRemove);
                }
            }
        }, this.poolCheckInterval);
    }

    async terminateWorker(workerInfo) {
        const { name: workerName, worker } = workerInfo;
        try {
            await Promise.race([
                worker.terminate(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Worker termination timeout')), this.shutdownTimeout)
                )
            ]);
            console.log(`Stopped and removed worker: ${workerName}`);
        } catch (err) {
            console.error(`Error stopping worker ${workerName}:`, err.message);
            // Force kill if graceful termination fails
            try {
                worker.kill?.();
            } catch (killErr) {
                console.error(`Error force killing worker ${workerName}:`, killErr.message);
            }
        }
    }

    async getOrCreateWorkerInPool(scriptPath) {
        if (this.isShuttingDown) {
            throw new Error('WorkerManager is shutting down');
        }

        if (!scriptPath) {
            throw new Error('Script path is required');
        }

        //add checrk if the script path exists
        const fs = require('fs');
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script path does not exist: ${scriptPath}`);
        }

        this.lastWorkerRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            await this.poolWatcher();
        }

        // Try to create a new worker if pool is not full
        if (this.workerPool.length < this.maxPoolSize) {
            try {
                const port = await getAvailablePort();
                const workerName = `worker-${port}-${Date.now()}`;
                const workerInfo = await this.createWorker(scriptPath, port, workerName);
                
                // Double-check pool size in case it changed during async operation
                if (this.workerPool.length < this.maxPoolSize) {
                    this.workerPool.push(workerInfo);
                    console.log(`Started worker: ${workerName} (port ${port})`);
                    return workerInfo;
                } else {
                    // Pool filled up while we were creating, terminate this worker
                    await this.terminateWorker(workerInfo);
                }
            } catch (err) {
                console.warn(`Failed to create new worker: ${err.message}`);
                // Continue to try existing workers
            }
        }
        
        // Return existing worker from pool
        if (this.workerPool.length > 0) {
            // Use round-robin instead of random for better load distribution
            const workerIndex = Math.floor(Date.now() / 1000) % this.workerPool.length;
            const selectedWorker = this.workerPool[workerIndex];
            
            // Verify worker is still alive
            if (selectedWorker && selectedWorker.worker && selectedWorker.worker.threadId !== null) {
                return selectedWorker;
            } else {
                // Remove dead worker and try again
                this.workerPool.splice(workerIndex, 1);
                if (this.workerPool.length > 0) {
                    return this.workerPool[0];
                }
            }
        }

        throw new Error('No workers available in pool');
    }

    createWorker(scriptPath, port, workerName) {
        return new Promise((resolve, reject) => {
            let isResolved = false;
            
            // Set timeout for worker creation
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error(`Worker creation timeout after ${this.workerTimeout}ms`));
                }
            }, this.workerTimeout);

            try {
                const worker = new Worker(scriptPath, { 
                    workerData: { port, name: workerName },
                    // Add resource limits for better stability
                    resourceLimits: {
                        maxOldGenerationSizeMb: 100,
                        maxYoungGenerationSizeMb: 50
                    }
                });
                
                const cleanup = () => {
                    clearTimeout(timeoutId);
                };

                worker.on('online', () => {
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        const workerInfo = { 
                            name: workerName, 
                            port, 
                            worker, 
                            createdAt: Date.now(),
                            lastUsed: Date.now()
                        };
                        resolve(workerInfo);
                    }
                });

                worker.on('message', (msg) => {
                    console.log(`worker ${workerName} message:`, msg);
                });

                worker.on('error', (err) => {
                    console.error(`worker ${workerName} error:`, err);
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(err);
                    } else {
                        // Worker error after creation, remove from pool
                        this.removeWorkerFromPool(workerName);
                    }
                });

                worker.on('exit', (code) => {
                    console.log(`worker ${workerName} exited with code ${code}`);
                    cleanup();
                    this.removeWorkerFromPool(workerName);
                });

            } catch (err) {
                clearTimeout(timeoutId);
                if (!isResolved) {
                    isResolved = true;
                    reject(err);
                }
            }
        });
    }

    removeWorkerFromPool(workerName) {
        const index = this.workerPool.findIndex(w => w.name === workerName);
        if (index !== -1) {
            const removed = this.workerPool.splice(index, 1)[0];
            console.log(`Removed worker ${workerName} from pool`);
            return removed;
        }
        return null;
    }

    getPoolInfo() {
        return {
            poolSize: this.workerPool.length,
            maxPoolSize: this.maxPoolSize,
            isShuttingDown: this.isShuttingDown,
            watcherStarted: this.watcherStarted,
            workers: this.workerPool.map(w => ({ 
                name: w.name, 
                port: w.port,
                createdAt: w.createdAt,
                lastUsed: w.lastUsed,
                alive: w.worker && w.worker.threadId !== null
            }))
        };
    }

    clearPool() {
        this.workerPool = [];
        this.lastWorkerRequestTime = Date.now();
    }

    async stopAllWorkers() {
        if (this.workerPool.length === 0) {
            return;
        }

        console.log(`Stopping ${this.workerPool.length} workers...`);
        
        const terminatePromises = this.workerPool.map(workerInfo => 
            this.terminateWorker(workerInfo)
        );
        
        try {
            await Promise.allSettled(terminatePromises);
        } catch (err) {
            console.error('Error during worker termination:', err);
        }
        
        this.clearPool();
        console.log('All workers stopped');
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        console.log('WorkerManager shutting down...');
        this.isShuttingDown = true;

        // Stop the pool watcher
        if (this.watcherInterval) {
            clearInterval(this.watcherInterval);
            this.watcherInterval = null;
        }

        // Stop all workers
        await this.stopAllWorkers();

        // Remove process event listeners
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('beforeExit');

        console.log('WorkerManager shutdown complete');
    }

    // Health check method
    async healthCheck() {
        const deadWorkers = [];
        
        for (let i = this.workerPool.length - 1; i >= 0; i--) {
            const workerInfo = this.workerPool[i];
            if (!workerInfo.worker || workerInfo.worker.threadId === null) {
                deadWorkers.push(this.workerPool.splice(i, 1)[0]);
            }
        }

        if (deadWorkers.length > 0) {
            console.log(`Removed ${deadWorkers.length} dead workers from pool`);
        }

        return {
            totalWorkers: this.workerPool.length,
            deadWorkersRemoved: deadWorkers.length,
            healthy: this.workerPool.length > 0 || !this.isShuttingDown
        };
    }
}

module.exports = WorkerManager;