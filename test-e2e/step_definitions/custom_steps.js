const { Given, When, Before, After } = require('@cucumber/cucumber');

Before(function() {
    this.log('log from before');
    this.log(`rp_attribute: random:${Date.now()}`);
    this.log(`rp_attribute: fixed:42`);
});
Before({name: 'named before'}, function() {});
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

When('named attachment', function () {
    this.attach(require('../attachments/pngBase64.js'), {
        mediaType: 'base64:image/png',
        fileName: 'lorem ipsum'
    });
});

When('passed step with log', function () {
    this.log('some information in passed step')
});

When('failed step with log', function () {
    this.log('some information in failed step')
    throw new Error('failed step')
});

When('long step', function () {
    this.log('this is long step')
    return new Promise(resolve => {
        setTimeout(resolve, 2000)
    })
});

When('step with response', function () {
    const response = {
        request: {
            method: 'POST',
            url: 'http://localhost:3000/#/feature/featurefc7c2610-bd2a-450d-b311-d5fafa543ef66',
            body: 'cXdlcnR5MTIz',
            headers: {
                header1: 'value',
                otherHeader1: 'value2',
                anotherHeader1: 'value3',
                'content-type': 'text/plain'
            }
        },
        response: {
            status: 200,
            body: 'cXdlcnR5MTIzcmVzcG9uc2U=',
            headers: {
                headerresponse: 'value1',
                'content-type': 'text/plain'
            }
        }
    }
    this.attach(JSON.stringify(response), 'text/x.response.json');
});

After({name: 'named after'}, function() {});

After(async () => {
    await new Promise(resolve => {
        setTimeout(resolve, 2000)
    });
});
