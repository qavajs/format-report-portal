module.exports = {
    default: {
        paths: ['test-e2e/features/**/*.feature'],
        require: ['./test-e2e/step_definitions/custom_steps.js'],
        format: ['./index.js:test-e2e/report/rp.out'],
        memory: [],
        formatOptions: {
            rpConfig: require('./token.json')
        },
        retry: 1,
        publishQuiet: true,
    }
}
