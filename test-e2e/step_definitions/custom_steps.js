const { Given, When, Before, After } = require('@cucumber/cucumber');

Before(() => {});
Given('background', () => {});
When('passed step', () => {});
When('failed step', () => { throw new Error('failed step') });
When('pending step', () => 'pending');
When('ambiguous step', () => {});
When('ambiguous step', () => {});
When('data table step', (dataTable) => {});
When('multiline step', (multiline) => {});

When('text attachment', function () {
    this.attach('multiline\ntext\ncontent', 'text/plain');
});

When('png base64 attachment', function () {
    this.attach(require('../attachments/pngBase64.js'), 'base64:image/png');
});

When('png full-size base64 attachment', function () {
    this.attach(require('../attachments/pngFullSizeBase64.js'), 'base64:image/png');
});

When('json attachment', function () {
    this.attach(JSON.stringify({
        property: 'value',
        nestedObject: {
            nestedObjectProperty: 'value2'
        },
        arrayProperty: [
            'val1',
            'val2',
            'val3'
        ]
    }), 'application/json');
});

When('html base64 attachment', function () {
    this.attach(require('../attachments/htmlBase64.js'), 'base64:text/html');
});

When('multiple attachments', function () {
    this.attach(require('../attachments/pngBase64.js'), 'base64:image/png');
    this.attach(require('../attachments/pngFullSizeBase64.js'), 'base64:image/png');
});

When('unsupported base64 attachment', function () {
    this.attach(require('../attachments/unsupportedBase64'), 'base64:application/zip');
});

When('passed step with log', function () {
    this.log('some information in passed step')
});
When('failed step with log', function () {
    this.log('some information in failed step')
    throw new Error('failed step')
});

After(() => {});

