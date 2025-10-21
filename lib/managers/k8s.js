const { spawn } = require('child_process');
const { getAvailablePort } = require('../utils/port');
const fs = require('fs');
const path = require('path');

class K8sManager {
    constructor(options = {}) {
        this.k8s = null;
        this.kc = null;
        this.k8sApi = null;
        this.initialized = false;
        
        this.namespace = options.namespace || 'default';
        this.defaultPodName = options.defaultPodName || 'my-nodejs-pod';
        this.defaultPodPort = options.defaultPodPort || 9000;
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        this.podTimeout = options.podTimeout || 60000; // 60 seconds for pod to be ready
        this.shutdownTimeout = options.shutdownTimeout || 15000; // 15 seconds for pod deletion
        
        this.podPool = [];
        this.lastPodRequestTime = Date.now();
        this.watcherStarted = false;
        this.watcherInterval = null;
        this.isShuttingDown = false;
        this.portForwardProcesses = new Map(); // Track port-forward processes
        
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

    async initialize() {
        if (this.initialized) return;
        
        try {
            this.k8s = await import('@kubernetes/client-node');
            this.kc = new this.k8s.KubeConfig();
            this.kc.loadFromDefault();
            this.k8sApi = this.kc.makeApiClient(this.k8s.CoreV1Api);
            this.initialized = true;
        } catch (err) {
            throw new Error(`Failed to initialize Kubernetes client: ${err.message}`);
        }
    }

    async poolWatcher() {
        if (this.watcherInterval) {
            return; // Already started
        }
        
        this.watcherInterval = setInterval(async () => {
            const now = Date.now();
            // If no new request in the last 10 seconds and pool is not empty
            if (this.podPool.length > 0 && now - this.lastPodRequestTime > this.poolCheckInterval) {
                const { name: podName, port: podPort } = this.podPool.shift();
                try {
                    await this.terminatePod({ name: podName, port: podPort });
                    console.log(`Stopped and removed pod: ${podName} (port ${podPort})`);
                } catch (err) {
                    console.error(`Error stopping pod ${podName}:`, err.message);
                }
            }
        }, this.poolCheckInterval);
    }

    async createOrUpdateConfigMap(scriptDirPath, scriptFiles = ['index.js']) {
        console.log(`Creating ConfigMap from scripts in: ${scriptDirPath}`);
        console.log(`Script files: ${scriptFiles.join(', ')}`);
        
        const configMapData = {};
        
        // Add all script files to ConfigMap
        for (const scriptFile of scriptFiles) {
            const scriptPath = path.join(scriptDirPath, scriptFile);
            console.log(`Checking script file: ${scriptPath}`);
            if (fs.existsSync(scriptPath)) {
                configMapData[scriptFile] = fs.readFileSync(scriptPath, 'utf8');
                console.log(`Added ${scriptFile} to ConfigMap`);
            } else {
                console.warn(`Script file not found: ${scriptPath}`);
            }
        }
        
        // Add package.json
        configMapData['package.json'] = JSON.stringify({
            name: 'my-app',
            dependencies: { express: '^4.18.2' }
        });
        console.log('Added package.json to ConfigMap');

        const configMapManifest = {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
                name: 'scripts',
                namespace: this.namespace
            },
            data: configMapData
        };

        console.log(`ConfigMap data keys: ${Object.keys(configMapData).join(', ')}`);

        try {
            // Try to read existing ConfigMap
            console.log(`Checking if ConfigMap 'scripts' exists in namespace '${this.namespace}'`);
            await this.k8sApi.readNamespacedConfigMap({ namespace: this.namespace, name: 'scripts' });
            // If it exists, update it
            console.log('ConfigMap exists, updating...');
            await this.k8sApi.replaceNamespacedConfigMap({ 
                namespace: this.namespace, 
                name: 'scripts', 
                body: configMapManifest 
            });
            console.log('ConfigMap updated successfully');
        } catch (err) {
            // console.log('ConfigMap does not exist or error reading it:', err.message);
            console.log('>>>>>ConfigMap does not exist or error reading it:', err.code);
            // if (err.response?.statusCode === 404) {
            if (err.code === 404) {
                // ConfigMap doesn't exist, create it
                console.log('ConfigMap not found, creating new one...');
                try {
                    await this.k8sApi.createNamespacedConfigMap({ 
                        namespace: this.namespace, 
                        body: configMapManifest 
                    });
                    console.log('ConfigMap created successfully');
                } catch (createErr) {
                    console.error('Failed to create ConfigMap:', createErr.message);
                    throw createErr;
                }
            } else {
                console.error('Error reading ConfigMap:', err.message);
                console.error('Error reading ConfigMap:', JSON.stringify(err));
                throw err;
            }
        }
    }

    async getOrCreatePodInPool(scriptDirPath, scriptFiles = ['index.js']) {
        await this.initialize();
        
        if (this.isShuttingDown) {
            throw new Error('K8sManager is shutting down');
        }

        if (!scriptDirPath) {
            throw new Error('Script directory path is required');
        }
        
        this.lastPodRequestTime = Date.now();

        if (!this.watcherStarted) {
            this.watcherStarted = true;
            this.poolWatcher();
        }
        
        if (this.podPool.length < this.maxPoolSize) {        
            try {
                await this.createOrUpdateConfigMap(scriptDirPath, scriptFiles);
            } catch (configMapErr) {
                console.error('Failed to create/update ConfigMap:', configMapErr.message);
                throw new Error(`ConfigMap creation failed: ${configMapErr.message}`);
            }
            
            try {
                const port = await getAvailablePort();
                const podName = `${this.defaultPodName}-${port}-${Date.now()}`;
                await this.createPod(port, podName);
                this.podPool.push({ 
                    name: podName, 
                    port,
                    createdAt: Date.now(),
                    lastUsed: Date.now()
                });
                console.log(`Started pod: ${podName} (port ${port})`);
            } catch (err) {
                if (this.podPool.length === 0) {
                    console.warn('Pod creation failed and pool is empty:', err.message);
                    throw err;
                }
                console.warn('Pod creation failed, using existing pod from pool:', err.message);
            }
        }

        if (this.podPool.length === 0) {
            throw new Error('No pods available in pool');
        }

        // Round-robin selection with liveness check
        const podIndex = Math.floor(Date.now() / 1000) % this.podPool.length;
        const selectedPod = this.podPool[podIndex];
        
        // Verify pod is still running
        try {
            const podStatus = await this.k8sApi.readNamespacedPod({
                namespace: this.namespace,
                name: selectedPod.name
            });
            
            if (podStatus.status && podStatus.status.phase === 'Running') {
                selectedPod.lastUsed = Date.now();
                return { name: selectedPod.name, port: selectedPod.port };
            } else {
                console.warn(`Pod ${selectedPod.name} is not running (${podStatus.status?.phase}), removing from pool`);
                this.removePodFromPool(selectedPod.name);
                
                // Recursively try again with remaining pods
                if (this.podPool.length > 0) {
                    return this.getOrCreatePodInPool(scriptDirPath, scriptFiles);
                }
                throw new Error('No healthy pods available in pool');
            }
        } catch (err) {
            console.warn(`Failed to check pod status for ${selectedPod.name}:`, err.message);
            // Remove dead pod and try again
            this.removePodFromPool(selectedPod.name);
            if (this.podPool.length > 0) {
                return this.getOrCreatePodInPool(scriptDirPath, scriptFiles);
            }
            throw new Error('No pods available in pool after health check');
        }
    }

    async createPod(port = 8080, podName = null) {
        await this.initialize();
        
        podName = podName || this.defaultPodName;
        
        return new Promise(async (resolve, reject) => {
            let isResolved = false;
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error(`Pod creation timeout after ${this.podTimeout}ms`));
                }
            }, this.podTimeout);
            
            try {
                const result = await this._createPodInternal(port, podName);
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    resolve(result);
                }
            } catch (err) {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    reject(err);
                }
            }
        });
    }

    async _createPodInternal(port, podName) {
        const podManifest = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                labels: {
                    app: 'my-app',
                },
            },
            spec: {
                containers: [
                    {
                        name: 'my-container',
                        image: 'node:18-alpine',
                        ports: [{ containerPort: this.defaultPodPort }],
                        workingDir: '/app',
                        volumeMounts: [
                            {
                                name: 'app-scripts',
                                mountPath: '/scripts',
                                readOnly: true
                            }
                        ],
                        command: ['sh', '-c'],
                        args: [
                            'cp -L -r /scripts/* /app/ && npm install --omit=dev --no-audit --no-fund && exec node index.js'
                        ],
                        env: [
                            {
                                name: 'PORT',
                                value: String(this.defaultPodPort)
                            },
                            {
                                name: 'NODE_ENV',
                                value: 'production'
                            }
                        ]
                    },
                ],
                volumes: [
                    {
                        name: 'app-scripts',
                        configMap: {
                            name: 'scripts',
                            defaultMode: 0o755
                        }
                    }
                ],
            },
        };

        console.log(`Attempting to create Pod in namespace: ${this.namespace}`);
        try {
            const res = await this.k8sApi.createNamespacedPod({ 
                namespace: this.namespace, 
                body: podManifest 
            });

            // Wait for pod to be ready (status.phase === 'Running')
            let isReady = false;
            for (let i = 0; i < 30; i++) {
                const podStatus = await this.k8sApi.readNamespacedPod({ 
                    namespace: this.namespace, 
                    name: podName 
                });
                if (podStatus.status && podStatus.status.phase === 'Running') {
                    isReady = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!isReady) {
                throw new Error(`Pod "${podName}" did not become ready in time.`);
            }
            console.log(`Pod "${podName}" is running.`);

            // Port-forward defaultPodPort to the requested port
            const portForwardProcess = spawn('kubectl', [
                'port-forward',
                `pod/${podName}`,
                `${port}:${this.defaultPodPort}`,
                '-n',
                this.namespace
            ]);

            // Optionally, handle port-forward process events
            portForwardProcess.stdout.on('data', data => {
                console.log(`kubectl port-forward stdout: ${data}`);
            });
            portForwardProcess.stderr.on('data', data => {
                console.error(`kubectl port-forward stderr: ${data}`);
            });

            // Track port-forward process for cleanup
            this.portForwardProcesses.set(podName, portForwardProcess);

            return { status: 'started', name: podName, pod: res.body, portForwardProcess };
        } catch (err) {
            throw err;
        }
    }

    async terminatePod(podInfo) {
        const { name: podName } = podInfo;
        
        try {
            // Kill port-forward process if exists
            const portForwardProcess = this.portForwardProcesses.get(podName);
            if (portForwardProcess && !portForwardProcess.killed) {
                portForwardProcess.kill('SIGTERM');
                this.portForwardProcesses.delete(podName);
            }

            // Delete pod with timeout
            await Promise.race([
                this.deletePod(podName),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Pod termination timeout')), this.shutdownTimeout)
                )
            ]);
        } catch (err) {
            console.warn(`Failed to gracefully terminate pod ${podName}, attempting force delete:`, err.message);
            
            // Force delete pod
            try {
                await this.k8sApi.deleteNamespacedPod({
                    namespace: this.namespace,
                    name: podName,
                    body: {
                        gracePeriodSeconds: 0
                    }
                });
            } catch (forceErr) {
                console.error(`Force delete also failed for pod ${podName}:`, forceErr.message);
                throw forceErr;
            }
        }
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }
        
        console.log('K8sManager shutting down...');
        this.isShuttingDown = true;
        
        // Stop pool watcher
        if (this.watcherInterval) {
            clearInterval(this.watcherInterval);
            this.watcherInterval = null;
        }
        
        // Terminate all pods
        await this.stopAllPods();
        
        console.log('K8sManager shutdown complete');
    }

    async healthCheck() {
        const deadPods = [];
        
        for (let i = this.podPool.length - 1; i >= 0; i--) {
            const podInfo = this.podPool[i];
            try {
                const podStatus = await this.k8sApi.readNamespacedPod({
                    namespace: this.namespace,
                    name: podInfo.name
                });
                
                if (!podStatus.status || podStatus.status.phase !== 'Running') {
                    deadPods.push(this.podPool.splice(i, 1)[0]);
                }
            } catch (err) {
                // Pod doesn't exist or can't be read
                deadPods.push(this.podPool.splice(i, 1)[0]);
            }
        }
        
        return {
            totalPods: this.podPool.length,
            deadPodsRemoved: deadPods.length,
            healthy: this.podPool.length > 0 || !this.isShuttingDown
        };
    }

    removePodFromPool(podName) {
        const index = this.podPool.findIndex(p => p.name === podName);
        if (index !== -1) {
            const removed = this.podPool.splice(index, 1)[0];
            console.log(`Removed pod ${podName} from pool`);
            
            // Clean up port-forward process
            const portForwardProcess = this.portForwardProcesses.get(podName);
            if (portForwardProcess && !portForwardProcess.killed) {
                portForwardProcess.kill('SIGTERM');
                this.portForwardProcesses.delete(podName);
            }
            
            return removed;
        }
        return null;
    }

    async deletePod(podName = null) {
        await this.initialize();
        
        podName = podName || this.defaultPodName;
        
        try {
            await this.k8sApi.deleteNamespacedPod({ 
                namespace: this.namespace, 
                name: podName 
            });
            return { status: 'stopped and removed', name: podName };
        } catch (err) {
            if (err.response && err.response.statusCode === 404) {
                return { status: 'pod not found', name: podName };
            }
            throw err;
        }
    }

    getPoolInfo() {
        return {
            poolSize: this.podPool.length,
            maxPoolSize: this.maxPoolSize,
            isShuttingDown: this.isShuttingDown,
            watcherStarted: this.watcherStarted,
            pods: this.podPool.map(p => ({ 
                name: p.name, 
                port: p.port,
                createdAt: p.createdAt,
                lastUsed: p.lastUsed
            }))
        };
    }

    clearPool() {
        this.podPool = [];
        this.lastPodRequestTime = Date.now();
    }

    async stopAllPods() {
        if (this.podPool.length === 0) {
            console.log('No pods to stop');
            return;
        }

        const promises = this.podPool.map(async (podInfo) => {
            try {
                await this.terminatePod(podInfo);
            } catch (err) {
                console.error(`Error stopping pod ${podInfo.name}:`, err.message);
            }
        });
        
        await Promise.allSettled(promises);
        this.clearPool();
    }
}

module.exports = K8sManager;