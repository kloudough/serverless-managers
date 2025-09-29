const { spawn } = require('child_process');
const { getAvailablePort } = require('../utils/port');
const fs = require('fs');
const path = require('path');

class K8sManager {
    constructor(options = {}) {
        this.k8s = null;
        this.kc = null;
        this.k8sApi = null;
        this.k8s = null;
        this.kc = null;
        this.k8sApi = null;
        this.initialized = false;
        
        this.namespace = options.namespace || 'default';
        this.defaultPodName = options.defaultPodName || 'my-nodejs-pod';
        this.defaultPodPort = options.defaultPodPort || 9000;
        this.maxPoolSize = options.maxPoolSize || 3;
        this.poolCheckInterval = options.poolCheckInterval || 10000; // 10 seconds
        
        this.podPool = [];
        this.lastPodRequestTime = Date.now();
        this.watcherStarted = false;
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
        setInterval(async () => {
            const now = Date.now();
            // If no new request in the last 10 seconds and pool is not empty
            if (this.podPool.length > 0 && now - this.lastPodRequestTime > this.poolCheckInterval) {
                const { name: podName, port: podPort } = this.podPool.shift();
                try {
                    await this.deletePod(podName);
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
                const podName = `${this.defaultPodName}-${port}`;
                const result = await this.createPod(port, podName);
                this.podPool.push({ name: podName, port });
                console.log(`Started pod: ${podName} (port ${port})`);
                console.log(result);
            } catch (err) {
                if (this.podPool.length == 0) {
                    console.log(err.message);
                    throw err;
                }
            }
        }

        if (this.podPool.length === 0) {
            throw new Error('No pods available in pool');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        const randomIndex = Math.floor(Math.random() * this.podPool.length);
        const { name: podName, port } = this.podPool[randomIndex];
        return { name: podName, port };
    }

    async createPod(port = 8080, podName = null) {
        await this.initialize();
        
        podName = podName || this.defaultPodName;
        
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

            return { status: 'started', name: podName, pod: res.body, portForwardProcess };
        } catch (err) {
            throw err;
        }
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
            pods: this.podPool.map(p => ({ name: p.name, port: p.port }))
        };
    }

    clearPool() {
        this.podPool = [];
        this.lastPodRequestTime = Date.now();
    }

    async stopAllPods() {
        const promises = this.podPool.map(async ({ name }) => {
            try {
                await this.deletePod(name);
            } catch (err) {
                console.error(`Error stopping pod ${name}:`, err.message);
            }
        });
        
        await Promise.all(promises);
        this.clearPool();
    }
}

module.exports = K8sManager;