const express = require('express');
const http = require('http');
// const { DockerManager, K8sManager, ProcessManager, WorkerManager } = require('../lib');
const { DockerManager } = require('../lib');
const greet = require('./scripts/greet');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize managers
const dockerManager = new DockerManager();
// const k8sManager = new K8sManager();
// const processManager = new ProcessManager();
// const workerManager = new WorkerManager();

app.get('/', (req, res) => {
    res.send(greet('World'));
});

app.get('/docker', async (req, res) => {
    try {
        const { name: containerName, port } = await dockerManager.getOrCreateContainerInPool(`${__dirname}/scripts`, ['index.js', 'greet.js']);
        http.get(`http://localhost:${port}/`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', async () => {
                res.json({ containerResponse: data, port, containerName });
            });
        }).on('error', async (err) => {
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ... other endpoints

app.listen(PORT, () => {
    console.log(`Example server running on http://localhost:${PORT}`);
});