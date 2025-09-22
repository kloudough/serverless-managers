const { Worker, workerData } = require('worker_threads');
const { getAvailablePort } = require('./util');

const workerPool = [];
const MAX_POOL_SIZE = 3;
let lastWorkerRequestTime = Date.now();
let watcherStarted = false;
const POOL_CHECK_INTERVAL = 10000; // 10 seconds

async function poolWatcher() {
    setInterval(async () => {
        const now = Date.now();
        // If no new request in the last 10 seconds and pool is not empty
        if (workerPool.length > 0 && now - lastWorkerRequestTime > POOL_CHECK_INTERVAL) {
            const { name: workerName, worker } = workerPool.shift();
            try {
                await worker.terminate();
                console.log(`Stopped and removed worker: ${workerName}`);
            } catch (err) {
                console.error(`Error stopping worker ${workerName}:`, err.message);
            }
        }
    }, POOL_CHECK_INTERVAL);
}

// Create or get a worker from the pool
async function getOrCreateWorkerInPool(scriptPath) {
    lastWorkerRequestTime = Date.now();

    if (!watcherStarted) {
        watcherStarted = true;
        poolWatcher();
    }

    // If pool is not full, create a new worker
    if (workerPool.length < MAX_POOL_SIZE) {
        let port = await getAvailablePort();
        const workerName = `worker-${port}`;
        const worker = new Worker(scriptPath, { workerData: { port, name: workerName } });
        
        return new Promise((resolve, reject) => {
            worker.on('online', () => {
                const workerInfo = { name: workerName, port, worker };
                workerPool.push(workerInfo);
                console.log(`Started worker: ${workerName} (port ${port})`);
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
                const index = workerPool.findIndex(w => w.name === workerName);
                if (index !== -1) {
                    workerPool.splice(index, 1);
                }
            });
        });
    }
    
    // If pool has workers, return a random one
    if (workerPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * workerPool.length);
        return workerPool[randomIndex];
    }
}

// Remove and stop a worker from the pool (FIFO)
async function removeAndStopWorkerFromPool() {
    if (workerPool.length > 0) {
        const { name: workerName, worker } = workerPool.shift();
        await worker.terminate();
        console.log(`Stopped and removed worker: ${workerName}`);
    }
}

function getWorkerPool() {
    return workerPool;
}

module.exports = { 
    getOrCreateWorkerInPool,
    removeAndStopWorkerFromPool,
    getWorkerPool
};