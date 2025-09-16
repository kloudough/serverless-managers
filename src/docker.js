const Docker = require('dockerode');
const { getAvailablePort } = require('./util');
const docker = new Docker();

const DEFAULT_CONTAINER_NAME = 'my-nodejs-express';
const DEFAULT_IMAGE_NAME = 'my-nodejs-express';

const containerPool = [];
let lastDockerRequestTime = Date.now();
let watcherStarted = false;
const MAX_POOL_SIZE = 3;
const POOL_CHECK_INTERVAL = 10000; // 10 seconds

async function poolWatcher() {
    setInterval(async () => {
        const now = Date.now();
        // If no new request in the last 10 seconds and pool is not empty
        if (containerPool.length > 0 && now - lastDockerRequestTime > POOL_CHECK_INTERVAL) {
            const { name: containerName, port: containerPort } = containerPool.shift();
            try {
                await stopContainer(containerName);
                console.log(`Stopped and removed container: ${containerName} (port ${containerPort})`);
            } catch (err) {
                console.error(`Error stopping container ${containerName}:`, err.message);
            }
        }
    }, POOL_CHECK_INTERVAL);
}

async function getDockerContainer() {
    lastDockerRequestTime = Date.now();

    if (!watcherStarted) {
        watcherStarted = true;
        poolWatcher();
    }

    if (containerPool.length < MAX_POOL_SIZE) {
        const port = await getAvailablePort();
        const containerName = `my-nodejs-express-${port}`;
        try {
            const result = await createContainer(port, containerName);
            containerPool.push({ name: containerName, port });
            console.log(`Started container: ${containerName} (port ${port})`);
            console.log(result);
        } catch (err) {
            if (containerPool.length == 0) {
                console.log(err.message);
                return;
            }
        }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    const randomIndex = Math.floor(Math.random() * containerPool.length);
    const { name: containerName, port } = containerPool[randomIndex];
    const containerInfo = { name: containerName, port };
    return containerInfo;
}

async function createContainer(port = 8080, containerName = DEFAULT_CONTAINER_NAME) {
    console.log(`Creating container "${containerName}" on port ${port}`);
    try {
        // Create and start the container running anotherApp.js
        const container = await docker.createContainer({
            Image: DEFAULT_IMAGE_NAME,
            name: containerName,
            ExposedPorts: { '9000/tcp': {} },
            HostConfig: {
                PortBindings: { '9000/tcp': [{ HostPort: String(port) }] },
                Binds: [
                    `${__dirname}/anotherApp.js:/usr/src/app/anotherApp.js`,
                    `${__dirname}/greet.js:/usr/src/app/greet.js`
                ]
            },
            WorkingDir: '/usr/src/app',
            Cmd: ['node', 'anotherApp.js', '9000']
        });
        await container.start();
        return { id: container.id, status: 'started', name: containerName };
    } catch (err) {
        throw err;
    }
}

async function stopContainer(containerName = DEFAULT_CONTAINER_NAME) {
    try {
        const container = docker.getContainer(containerName);
        await container.stop();
        await container.remove();
        return { status: 'stopped and removed', name: containerName };
    } catch (err) {
        throw err;
    }
}

module.exports = { getDockerContainer };