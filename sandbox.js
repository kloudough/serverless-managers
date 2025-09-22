    // console.log(`Ensuring Pod "${podName}" does not already exist in namespace: ${namespace}`);
    // try {
    //     await k8sApi.deleteNamespacedPod({ namespace, name: podName });
    //     console.log(`Deleted existing Pod "${podName}"`);
    // } catch (err) {
    //     // Ignore error if pod does not exist
    //     if (!(err.response && err.response.statusCode === 404)) {
    //         throw err;
    //     }
    // }

    // // Wait for pod to be fully deleted
    // for (let i = 0; i < 30; i++) {
    //     try {
    //         await k8sApi.readNamespacedPod({ namespace, name: podName });
    //         await new Promise(res => setTimeout(res, 500));
    //     } catch (err) {
    //         if (err.response && err.response.statusCode === 404) {
    //             break;
    //         }
    //     }
    // }