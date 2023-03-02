const { Formatter, Status } = require('@cucumber/cucumber');
const RPClient = require('@reportportal/client-javascript');
class RPFormatter extends Formatter {
    launchId = null;

    constructor(options) {
        super(options);
        const rpEnable = options.parsedArgvOptions.rpConfig.enable;
        if (rpEnable !== undefined && !rpEnable) return undefined;
        options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));
        this.rpConfig = options.parsedArgvOptions.rpConfig;
        this.rpClient = new RPClient(this.rpConfig);
    }

    async processEnvelope(envelope) {
        if (envelope.testRunStarted) {
            await this.startLaunch();
        }
        else if (envelope.testRunFinished) {
            await this.finishLaunch();
        }
        else if (envelope.testCaseFinished) {
            await this.finishTest(envelope);
        }
    }

    async startLaunch() {
        const launchObj = this.rpClient.startLaunch({
            name: this.rpConfig.launch,
            startTime: this.rpClient.helpers.now(),
            description: this.rpConfig.description,
            attributes: this.rpConfig.tags,
            mode: this.rpConfig.mode,
            debug: this.rpConfig.debug
        });

        this.launchId = launchObj.tempId;
        this.features = {};
        await launchObj.promise;
    }

    async finishLaunch() {
        for (const featureName in this.features) {
            await this.rpClient.finishTestItem(this.features[featureName], { status: 'PASSED' }).promise;
        }
        await this.rpClient.finishLaunch(this.launchId, {
            endTime: this.rpClient.helpers.now()
        }).promise;
    }

    async finishTest(envelope) {
        if (envelope.testCaseFinished.willBeRetried) return;
        const testCase = this.eventDataCollector.getTestCaseAttempt(envelope.testCaseFinished.testCaseStartedId);
        const featureName = testCase.gherkinDocument.feature.name;
        if (!this.features[featureName]) {
            const featureItem = this.rpClient.startTestItem({
                description:
                    this.formatTags(testCase.gherkinDocument.feature.tags) +
                    '\n' +
                    testCase.gherkinDocument.feature.description,
                name: featureName,
                startTime: this.rpClient.helpers.now(),
                type: 'SUITE'
            }, this.launchId);
            this.features[featureName] = featureItem.tempId;
            await featureItem.promise;
        }

        const featureTempId = this.features[featureName]
        // Start test item
        const testItem = this.rpClient.startTestItem({
            description: this.formatTags(testCase.pickle.tags),
            name: testCase.pickle.name,
            startTime: this.rpClient.helpers.now(),
            type: 'STEP'
        }, this.launchId, featureTempId);
        await testItem.promise;

        //send steps
        const steps = this.getStepResults(testCase)
        for (const step of steps) {
            const attachment = step.attachment && step.attachment[0]
                ? {
                    name: 'attachment',
                    type: step.attachment[0].mediaType,
                    content: step.attachment[0].mediaType === 'text/plain'
                        ? Buffer.from(step.attachment[0].body).toString('base64')
                        : step.attachment[0].body,
                }
                : undefined;
            await this.rpClient.sendLog(testItem.tempId, {
                level: step.result.status === Status.PASSED
                    ? 'INFO'
                    : 'ERROR',
                message: this.getMessage(step),
                time: this.rpClient.helpers.now()
            }, attachment).promise
        }

        //finish test item
        const status = Object.values(testCase.stepResults).some(step => step.status !== Status.PASSED)
            ? Status.FAILED.toLowerCase()
            : Status.PASSED.toLowerCase()
        await this.rpClient.finishTestItem(testItem.tempId, {
            status
        }).promise;
    }

    getStepResults(testCase) {
        return testCase.testCase.testSteps.map(step => ({
            result: testCase.stepResults[step.id],
            pickle: testCase.pickle.steps.find(pickle => pickle.id === step.pickleStepId),
            attachment: testCase.stepAttachments[step.id]
        }))
    }

    getMessage(step) {
        if (!step.pickle) return 'Hook';
        const messageParts = [step.pickle.text];
        if (step.pickle.argument) {
            if (step.pickle.argument.dataTable) messageParts.push(
                this.formatTable(step.pickle.argument.dataTable)
            )
            if (step.pickle.argument.docString) messageParts.push(this.formatDocString(step.pickle.argument.docString))
        }
        if (step.result.status === Status.FAILED) messageParts.push(step.result.message)

        return messageParts.join('\n')
    }

    formatTable(dataTable) {
        const TR = '<tr>';
        const TRE = '</tr>';
        const TD = '<td>';
        const TDE = '</td>';
        const formatRow = row => TR + row.cells.map(cell => TD + cell.value + TDE).join('') + TRE;
        return '<table><tbody>' + dataTable.rows.map(formatRow).join('') + '</tbody></table>'
    }

    formatDocString(docString) {
        return '<pre><code>' + docString.content + '</code></pre>'
    }

    formatTags(tags) {
        return tags.map(tag => '<code>' + tag.name + '</code>').join('')
    }
}

module.exports = RPFormatter
