## @qavajs/format-report-portal
This package is formatter for EPAM report portal

### Install
`npm install @qavajs/format-report-portal`

### Configuration

add formatter to config.js
```javascript
module.exports = {
    default: {
        format: [
            ['@qavajs/format-report-portal', 'report/rp.out']
        ],
        formatOptions: {
            rpConfig: {
                enable: true,
                debug: false,
                apiKey: 'your token',
                endpoint: 'https://your-rp-instance/api/v1',
                description: 'Description',
                tags: ['Tag'],
                project: 'your project',
                launch: 'your launch name',
                mode: 'DEFAULT',
                retry: 1, // number of retries to send result to report portal (default - 1)
                ignoreErrors: false, // ignore RP errors (default: false)
                showLaunchURL: true // log report portal launch link
            },
        }
    }
}
```
Option `enable` is set to `true` even if it is not defined explicitly in rpConfig section.

### Test Level Attributes
Test level attributes can be added via cucumber logs e.g. in Before hook
```javascript
const { Before } = require('@cucumber/cucumber');

Before(function () {
    this.log('log from before'); //just log
    this.log(`rp_attribute: fixed:42`); //static attribute
    this.log(`rp_attribute: random:${Date.now()}`); //dynamic attribute
});
```
### Run Unit Tests
add token.json file with rp token and other config
run
`npm run test`

### Run E2E Tests
add token.json file with rp token and other config
run
`npm run test-e2e`
