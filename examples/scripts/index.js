const express = require('express');
const greet = require('./greet');
const { parentPort, workerData } = require('worker_threads');

const PORT =
    (workerData && workerData.port) ||
    process.argv[2] ||
    process.env.PORT ||
    9000;

const app = express();
app.get('/', (req, res) => {
    res.send(greet('World from anotherApp.js!'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});