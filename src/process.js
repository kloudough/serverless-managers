const { spawn } = require('child_process');
const { getAvailablePort } = require('./util');

let nodeAppProcess = null;
const processPool = [];
const MAX_POOL_SIZE = 3;
let lastProcessRequestTime = Date.now();
let watcherStarted = false;
const POOL_CHECK_INTERVAL = 10000; // 10 seconds

async function poolWatcher() {
    setInterval(async () => {
        const now = Date.now();
        // If no new request in the last 10 seconds and pool is not empty
        if (processPool.length > 0 && now - lastProcessRequestTime > POOL_CHECK_INTERVAL) {
            const { name: processName, process } = processPool.shift();
            try {
                process.kill();
                console.log(`Stopped and removed process: ${processName}`);
            } catch (err) {
                console.error(`Error stopping process ${processName}:`, err.message);
            }
        }
    }, POOL_CHECK_INTERVAL);
}

// Create or get a process from the pool
async function getOrCreateProcessInPool(scriptPath) {
    lastProcessRequestTime = Date.now();

    if (!watcherStarted) {
        watcherStarted = true;
        poolWatcher();
    }

    // If pool is not full, create a new process
    if (processPool.length < MAX_POOL_SIZE) {
        let port = await getAvailablePort();
        const processName = `process-${port}`;
        
        return new Promise((resolve, reject) => {
            const childProcess = spawn('node', [scriptPath, port]);

            childProcess.stdout.on('data', (data) => {
                console.log(`${processName} stdout: ${data}`);
                // Resolve when first stdout is received (indicates app started)
                const processInfo = { name: processName, port, process: childProcess };
                processPool.push(processInfo);
                console.log(`Started process: ${processName} (port ${port})`);
                resolve(processInfo);
            });

            childProcess.stderr.on('data', (data) => {
                console.error(`${processName} stderr: ${data}`);
            });

            childProcess.on('close', (code) => {
                console.log(`${processName} exited with code ${code}`);
                // Remove from pool when process exits
                const index = processPool.findIndex(p => p.name === processName);
                if (index !== -1) {
                    processPool.splice(index, 1);
                }
            });

            childProcess.on('error', (err) => {
                console.error(`${processName} error: ${err}`);
                reject(err);
            });
        });
    }
    
    // If pool has processes, return a random one
    if (processPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * processPool.length);
        return processPool[randomIndex];
    }

    // If pool is full, return null
    return null;
}

// Remove and stop a process from the pool (FIFO)
async function removeAndStopProcessFromPool() {
    if (processPool.length > 0) {
        const { name: processName, process } = processPool.shift();
        process.kill();
        console.log(`Stopped and removed process: ${processName}`);
    }
}

function getProcessPool() {
    return processPool;
}

module.exports = { 
    getOrCreateProcessInPool,
    removeAndStopProcessFromPool,
    getProcessPool
};