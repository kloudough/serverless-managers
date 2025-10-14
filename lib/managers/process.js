const { spawn } = require('child_process');
const { getAvailablePort } = require('../utils/port');

class ProcessManager {
    constructor(options = {}) {
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        this.processTimeout = options.processTimeout || 30000; // 30 seconds
        this.shutdownTimeout = options.shutdownTimeout || 5000; // 5 seconds
        
        this.processPool = [];
        this.lastProcessRequestTime = Date.now();
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
            if (this.processPool.length > 0 && now - this.lastProcessRequestTime > this.poolCheckInterval) {
                const processToRemove = this.processPool.shift();
                if (processToRemove) {
                    await this.terminateProcess(processToRemove);
                }
            }
        }, this.poolCheckInterval);
    }

    async terminateProcess(processInfo) {
        const { name: processName, process: childProcess } = processInfo;
        try {
            await Promise.race([
                new Promise((resolve) => {
                    childProcess.once('exit', resolve);
                    childProcess.kill();
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Process termination timeout')), this.shutdownTimeout)
                )
            ]);
            console.log(`Stopped and removed process: ${processName}`);
        } catch (err) {
            console.error(`Error stopping process ${processName}:`, err.message);
            // Force kill if graceful termination fails
            try {
                childProcess.kill('SIGKILL');
            } catch (killErr) {
                console.error(`Error force killing process ${processName}:`, killErr.message);
            }
        }
    }

    async getOrCreateProcessInPool(scriptPath) {
        if (this.isShuttingDown) {
            throw new Error('ProcessManager is shutting down');
        }

        if (!scriptPath) {
            throw new Error('Script path is required');
        }

        this.lastProcessRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            await this.poolWatcher();
        }

        // Try to create a new process if pool is not full
        if (this.processPool.length < this.maxPoolSize) {
            try {
                const port = await getAvailablePort();
                const processName = `process-${port}-${Date.now()}`;
                const processInfo = await this.createProcess(scriptPath, port, processName);
                
                // Double-check pool size in case it changed during async operation
                if (this.processPool.length < this.maxPoolSize) {
                    this.processPool.push(processInfo);
                    console.log(`Started process: ${processName} (port ${port})`);
                    return processInfo;
                } else {
                    // Pool filled up while we were creating, terminate this process
                    await this.terminateProcess(processInfo);
                }
            } catch (err) {
                console.warn(`Failed to create new process: ${err.message}`);
                // Continue to try existing processes
            }
        }
        
        // Return existing process from pool
        if (this.processPool.length > 0) {
            // Use round-robin instead of random for better load distribution
            const processIndex = Math.floor(Date.now() / 1000) % this.processPool.length;
            const selectedProcess = this.processPool[processIndex];
            
            // Verify process is still alive
            if (selectedProcess && selectedProcess.process && !selectedProcess.process.killed) {
                return selectedProcess;
            } else {
                // Remove dead process and try again
                this.processPool.splice(processIndex, 1);
                if (this.processPool.length > 0) {
                    return this.processPool[0];
                }
            }
        }

        throw new Error('No processes available in pool');
    }

    createProcess(scriptPath, port, processName) {
        return new Promise((resolve, reject) => {
            let isResolved = false;
            
            // Set timeout for process creation
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error(`Process creation timeout after ${this.processTimeout}ms`));
                }
            }, this.processTimeout);

            try {
                const childProcess = spawn('node', [scriptPath, port]);
                
                const cleanup = () => {
                    clearTimeout(timeoutId);
                };

                childProcess.stdout.once('data', (data) => {
                    console.log(`${processName} stdout: ${data}`);
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        // Resolve when first stdout is received (indicates app started)
                        const processInfo = { 
                            name: processName, 
                            port, 
                            process: childProcess,
                            createdAt: Date.now(),
                            lastUsed: Date.now()
                        };
                        resolve(processInfo);
                    }
                });

                childProcess.stderr.on('data', (data) => {
                    console.error(`${processName} stderr: ${data}`);
                });

                childProcess.on('close', (code) => {
                    console.log(`${processName} exited with code ${code}`);
                    cleanup();
                    this.removeProcessFromPool(processName);
                });

                childProcess.on('error', (err) => {
                    console.error(`${processName} error:`, err);
                    if (!isResolved) {
                        isResolved = true;
                        cleanup();
                        reject(err);
                    } else {
                        // Process error after creation, remove from pool
                        this.removeProcessFromPool(processName);
                    }
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

    removeProcessFromPool(processName) {
        const index = this.processPool.findIndex(p => p.name === processName);
        if (index !== -1) {
            const removed = this.processPool.splice(index, 1)[0];
            console.log(`Removed process ${processName} from pool`);
            return removed;
        }
        return null;
    }

    getPoolInfo() {
        return {
            poolSize: this.processPool.length,
            maxPoolSize: this.maxPoolSize,
            isShuttingDown: this.isShuttingDown,
            watcherStarted: this.watcherStarted,
            processes: this.processPool.map(p => ({ 
                name: p.name, 
                port: p.port,
                createdAt: p.createdAt,
                lastUsed: p.lastUsed,
                alive: p.process && !p.process.killed
            }))
        };
    }

    clearPool() {
        this.processPool = [];
        this.lastProcessRequestTime = Date.now();
    }

    async stopAllProcesses() {
        if (this.processPool.length === 0) {
            return;
        }

        console.log(`Stopping ${this.processPool.length} processes...`);
        
        const terminatePromises = this.processPool.map(processInfo => 
            this.terminateProcess(processInfo)
        );
        
        try {
            await Promise.allSettled(terminatePromises);
        } catch (err) {
            console.error('Error during process termination:', err);
        }
        
        this.clearPool();
        console.log('All processes stopped');
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        console.log('ProcessManager shutting down...');
        this.isShuttingDown = true;

        // Stop the pool watcher
        if (this.watcherInterval) {
            clearInterval(this.watcherInterval);
            this.watcherInterval = null;
        }

        // Stop all processes
        await this.stopAllProcesses();

        // Remove process event listeners
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('beforeExit');

        console.log('ProcessManager shutdown complete');
    }

    // Health check method
    async healthCheck() {
        const deadProcesses = [];
        
        for (let i = this.processPool.length - 1; i >= 0; i--) {
            const processInfo = this.processPool[i];
            if (!processInfo.process || processInfo.process.killed) {
                deadProcesses.push(this.processPool.splice(i, 1)[0]);
            }
        }

        if (deadProcesses.length > 0) {
            console.log(`Removed ${deadProcesses.length} dead processes from pool`);
        }

        return {
            totalProcesses: this.processPool.length,
            deadProcessesRemoved: deadProcesses.length,
            healthy: this.processPool.length > 0 || !this.isShuttingDown
        };
    }
}

module.exports = ProcessManager;