const common = {
    paths: ['test/features/*.feature'],
    require: [
        'test/step_definitions/custom_steps.ts'
    ],
    format: [
        'json:test/report.json',
        './formatter/formatter:test/report.html',
    ],
    formatOptions: {
        htmlConfig: {
            metadata: {
                'OS': 'macos',
                'OS Version': '13.1'
            }
        }
    },
    publishQuiet: true
}

export default common;
