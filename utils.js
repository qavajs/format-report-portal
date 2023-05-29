async function retry(fn, retries = 1) {
    let currentTry = 0;
    let lastError;
    while (currentTry < retries) {
        try {
            const result = await fn();
            return result;
        } catch (err) {
            console.error(err);
            currentTry++;
            lastError = err;
        }
    }
    throw lastError;
}

module.exports = {
    retry
}
