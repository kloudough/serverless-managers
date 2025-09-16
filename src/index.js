const express = require('express');
const greet = require('./greet');
const { getAvailablePort } = require('./util');
const http = require('http');
const { getK8sPod } = require('./k8s');
const { getDockerContainer } = require('./docker');
const { getOrCreateProcessInPool } = require('./process');
const { startNodeWorker, stopNodeWorker, getOrCreateWorkerInPool } = require('./worker');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(greet('World'));
});

app.get('/k8s', async (req, res) => {
    try {
        const { name: podName, port } = await getK8sPod();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const hostname = `http://localhost:${port}/`;
        console.log(`Sending request to pod at: ${hostname}`);
        http.get(hostname, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', async () => {
                res.json({ podResponse: data, port, podName });
            });
        }).on('error', async (err) => {
            await deletePod(podName);
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

let inFlightDockerRequests = 0;

app.get('/docker', async (req, res) => {
    try {
        const { name: containerName, port } = await getDockerContainer();
        inFlightDockerRequests++;
        http.get(`http://localhost:${port}/`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', async () => {
                inFlightDockerRequests--;
                res.json({ containerResponse: data, port, containerName, inFlightDockerRequests });
            });
        }).on('error', async (err) => {
            inFlightDockerRequests--;
            res.status(500).json({ error: err.message, inFlightDockerRequests });
        });
    } catch (err) {
        inFlightDockerRequests--;
        res.status(500).json({ error: err.message, inFlightDockerRequests });
    }
});

app.get('/process', async (req, res) => {
    try {
        let processs = await getOrCreateProcessInPool('./src/anotherApp.js');
        await new Promise(resolve => setTimeout(resolve, 500));
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
        const worker = await getOrCreateWorkerInPool('./src/anotherApp.js');
        if (!worker) {
            return res.status(500).json({ error: 'Failed to create worker' });
        }
        const { port: workerPort, name: workerName } = worker
        await new Promise(resolve => setTimeout(resolve, 1000));
        http.get(`http://localhost:${workerPort}/`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                res.json({ 
                    status: 'Worker response received', 
                    childResponse: data, 
                    workerName, 
                    port: workerPort 
                });
            });
        }).on('error', (err) => {
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});