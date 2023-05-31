async function retry(fn, retries = 1, ignoreErrors = false) {
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
    if (!ignoreErrors) {
        throw lastError;
    }
}

module.exports = {
    retry
}
