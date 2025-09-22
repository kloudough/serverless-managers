const express = require('express');
const http = require('http');
// const { DockerManager, K8sManager, ProcessManager, WorkerManager } = require('../lib');
const { DockerManager, ProcessManager ,WorkerManager } = require('../lib');
const greet = require('./scripts/greet');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize managers
const dockerManager = new DockerManager();
// const k8sManager = new K8sManager();
const processManager = new ProcessManager();
const workerManager = new WorkerManager();

app.get('/', (req, res) => {
    res.send(greet('World'));
});

app.get('/docker', async (req, res) => {
    try {
        const scriptFiles = ['index.js', 'greet.js'];
        const { name: containerName, port } = await dockerManager.getOrCreateContainerInPool(`${__dirname}/scripts`, scriptFiles);
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

app.get('/process', async (req, res) => {
    try {
        let processs = await processManager.getOrCreateProcessInPool(`${__dirname}/scripts/index.js`);
        const { port, name: processName } = processs;
        http.get(`http://localhost:${port}/`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                res.json({childResponse: data, processName, port });
            });
        }).on('error', (err) => {
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/worker', async (req, res) => {
    try {
        let worker = await workerManager.getOrCreateWorkerInPool(`${__dirname}/scripts/index.js`);
        const { port, name: workerName } = worker;
        await new Promise(resolve => setTimeout(resolve, 1000));
        http.get(`http://localhost:${port}/`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                res.json({ workerResponse: data, workerName, port });
            });
        }).on('error', (err) => {
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