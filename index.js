const { Formatter, Status } = require('@cucumber/cucumber');
const RPClient = require('@reportportal/client-javascript');
class RPFormatter extends Formatter {
    launchId = null;

    constructor(options) {
        super(options);
        options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));
        this.rpConfig = options.parsedArgvOptions.rpConfig;
        this.rpClient = new RPClient(this.rpConfig);
        this.promiseQ = [];
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
            mode: this.rpConfig.mode
        });

        this.launchId = launchObj.tempId;
        this.features = {};
        this.promiseQ.push(launchObj.promise);
        await launchObj.promise;
    }

    async finishLaunch() {
        await Promise.allSettled(this.promiseQ);
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
            this.promiseQ.push(featureItem.promise);
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
        this.promiseQ.push(testItem.promise);
        await testItem.promise;

        //send steps
        const steps = this.getStepResults(testCase)
        for (const step of steps) {
            const nestedTestItem = this.rpClient.startTestItem({
                description: 'test description',
                name: this.getStepText(step, steps),
                startTime: this.rpClient.helpers.now(),
                type: 'STEP',
                hasStats: false
            }, this.launchId, testItem.tempId);
            this.promiseQ.push(nestedTestItem.promise);
            await nestedTestItem.promise;
            if (step.result.message) {
                const log = await this.rpClient.sendLog(nestedTestItem.tempId, {
                    level: 'ERROR',
                    message: this.getMessage(step),
                    time: this.rpClient.helpers.now()
                });
                this.promiseQ.push(log.promise);
                await log.promise;
            }
            if (step.attachment) {
                for (const attachment of step.attachment) {
                    const attachmentData = {
                        name: 'attachment',
                        type: attachment.mediaType,
                        content: this.prepareContent(attachment),
                    };
                    const log = await this.rpClient.sendLog(nestedTestItem.tempId, {
                        level: 'INFO',
                        message: 'Attachment',
                        time: this.rpClient.helpers.now()
                    }, attachmentData);
                    this.promiseQ.push(log.promise);
                    await log.promise;
                }
            }
            const nestedItemFinish = this.rpClient.finishTestItem(nestedTestItem.tempId, {
                status: this.getStatus(step),
                endTime: this.rpClient.helpers.now()
            });
            this.promiseQ.push(nestedItemFinish.promise);
            await nestedItemFinish.promise;
        }

        //finish test item
        const status = Object.values(testCase.stepResults).some(step => step.status !== Status.PASSED)
            ? Status.FAILED.toLowerCase()
            : Status.PASSED.toLowerCase()
        const testItemFinish = this.rpClient.finishTestItem(testItem.tempId, {
            status
        });
        this.promiseQ.push(testItemFinish.promise);
        await testItemFinish.promise;
    }

    getStepResults(testCase) {
        return testCase.testCase.testSteps.map(step => ({
            result: testCase.stepResults[step.id],
            pickle: testCase.pickle.steps.find(pickle => pickle.id === step.pickleStepId),
            attachment: testCase.stepAttachments[step.id]
        }))
    }

    getStepText(step, steps) {
        if (!step.pickle) return this.hookKeyword(step, steps);
        const messageParts = [step.pickle.text];
        if (step.pickle.argument) {
            if (step.pickle.argument.dataTable) messageParts.push(
                this.formatTable(step.pickle.argument.dataTable)
            )
            if (step.pickle.argument.docString) messageParts.push(this.formatDocString(step.pickle.argument.docString))
        }

        return messageParts.join('\n')
    }

    hookKeyword(step, steps) {
        const stepsBefore = steps.slice(0, steps.findIndex((element) => element === step));
        return stepsBefore.every(element => element.pickle === undefined) ? 'Before' : 'After'
    }
    getMessage(step) {
        return step.result.message
    }

    getStatus(step) {
        if (step.result.status !== Status.PASSED) {
            return Status.FAILED.toLowerCase()
        }
        return Status.PASSED.toLowerCase()
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

    prepareContent(attachment) {
        return ['text/plain', 'application/json'].includes(attachment.mediaType)
            ? Buffer.from(attachment.body).toString('base64')
            : attachment.body
    }

}

module.exports = RPFormatter
