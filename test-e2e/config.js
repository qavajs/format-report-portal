module.exports = {
    default: {
        paths: ['test-e2e/features/**/*.feature'],
        require: ['./test-e2e/step_definitions/custom_steps.js'],
        format: ['./index.js:test-e2e/report/rp.out'],
        formatOptions: {
            rpConfig: require('./token.json')
        },
        publishQuiet: true,
    }
}
