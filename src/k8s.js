const { spawn } = require('child_process');
const { getAvailablePort } = require('./util');
const k8s = require('@kubernetes/client-node');
const fs = require('fs');
const path = require('path');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const namespace = 'default';
const DEFAULT_POD_NAME = 'my-nodejs-pod';
const DEFAULT_POD_PORT = 80;
let lastPodRequestTime = Date.now();
let watcherStarted = false;
const MAX_POOL_SIZE = 3;
const POOL_CHECK_INTERVAL = 10000; // 10 seconds
const podPool = [];


async function poolWatcher() { 
    setInterval(async () => {
        const now = Date.now();
        // If no new request in the last 10 seconds and pool is not empty
        if (podPool.length > 0 && now - lastPodRequestTime > POOL_CHECK_INTERVAL) {
            const { name: podName, port: podPort } = podPool.shift();
            try {
                await deletePod(podName);
                console.log(`Stopped and removed pod: ${podName} (port ${podPort})`);
            } catch (err) {
                console.error(`Error stopping pod ${podName}:`, err.message);
            }
        }
    }, POOL_CHECK_INTERVAL);
}

async function createOrUpdateConfigMap() {
    const scriptContent = fs.readFileSync(path.join(__dirname, 'anotherApp.js'), 'utf8');
    const configMapManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
            name: 'scripts',
            namespace
        },
        data: {
            'anotherApp.js': scriptContent,
            'package.json': JSON.stringify({
                name: 'my-app',
                dependencies: { express: '^4.18.2' }
            })
        }
    };
    try {
        // Try to read existing ConfigMap
        await k8sApi.readNamespacedConfigMap({ namespace, name: 'scripts' });
        // If it exists, update it
        await k8sApi.replaceNamespacedConfigMap({ namespace, name: 'scripts', body: configMapManifest });
        console.log('ConfigMap updated successfully');
    } catch (err) {
        if (err.response?.statusCode === 404) {
            // ConfigMap doesn't exist, create it
            await k8sApi.createNamespacedConfigMap({ namespace, body: configMapManifest });
            console.log('ConfigMap created successfully');
        } else {
            throw err;
        }
    }
}

async function getK8sPod() {
    lastPodRequestTime = Date.now();

    if (!watcherStarted) {
        watcherStarted = true;
        poolWatcher();
    }
    
    if (podPool.length < MAX_POOL_SIZE) {
        await createOrUpdateConfigMap();
        try {
            const port = await getAvailablePort();
            const podName =`my-nodejs-pod-${port}`;
            const result = await createPod(port, podName);
            podPool.push({ name: podName, port });
            console.log(`Started pod: ${podName} (port ${port})`);
            console.log(result);
        } catch (err) {
            if (podPool.length == 0) {
                console.log(err.message);
                return;
            }
        }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    const randomIndex = Math.floor(Math.random() * podPool.length);
    const { name: podName, port } = podPool[randomIndex];
    const podInfo = { name: podName, port };
    return podInfo;
}

async function createPod(port = 8080, podName = DEFAULT_POD_NAME) {
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
                    image: 'nginx:latest', // Replace with your nodejs image if needed
                    ports: [{ containerPort: DEFAULT_POD_PORT }],
                    volumeMounts: [
                        {
                            name: 'app-scripts',
                            mountPath: '/usr/src/app'
                        }
                    ]
                },
            ],
            volumes: [
                {
                    name: 'app-scripts',
                    configMap: {
                        name: 'scripts'
                    }
                }
            ],
        },
    };

    console.log(`Attempting to create Pod in namespace: ${namespace}`);
    try {
        // const res = await k8sApi.createNamespacedPod({namespace: namespace, body: podManifest});
        const res = await k8sApi.createNamespacedPod({ namespace: namespace, body: podManifest });

        // Wait for pod to be ready (status.phase === 'Running')
        let isReady = false;
        for (let i = 0; i < 30; i++) {
            const podStatus = await k8sApi.readNamespacedPod({ namespace: namespace, name: podName });
            // console.log(podStatus.status);
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

        // Port-forward DEFAULT_POD_PORT to the requested port
        const portForwardProcess = spawn('kubectl', [
            'port-forward',
            `pod/${podName}`,
            `${port}:80`,
            '-n',
            namespace
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

async function deletePod(podName = DEFAULT_POD_NAME) {
    try {
        // await k8sApi.deleteNamespacedPod({namespace: namespace, name: 'my-nodejs-pod'});
        await k8sApi.deleteNamespacedPod({ namespace, name: podName });
        return { status: 'stopped and removed', name: podName };
    } catch (err) {
        if (err.response && err.response.statusCode === 404) {
            return { status: 'pod not found', name: podName };
        }
        throw err;
    }
}

module.exports = { getK8sPod};