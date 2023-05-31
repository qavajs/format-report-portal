const { Formatter, Status } = require('@cucumber/cucumber');
const RPClient = require('@reportportal/client-javascript');

const RP_ATTRIBUTE_PREFIX = /^rp_attribute:\s*/;
const isAttribute = (attachment) => attachment.mediaType === 'text/x.cucumber.log+plain' && RP_ATTRIBUTE_PREFIX.test(attachment.body)

class RPFormatter extends Formatter {
    launchId = null;

    constructor(options) {
        super(options);
        const rpEnable = options.parsedArgvOptions.rpConfig.enable;
        if (rpEnable !== undefined && !rpEnable) return undefined;
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
            mode: this.rpConfig.mode,
            debug: this.rpConfig.debug
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

        const featureTempId = this.features[featureName];
        let startTime = this.rpClient.helpers.now();
        let endTime;
        const steps = this.getStepResults(testCase);
        const attributes = steps
            .reduce((attachments, step) => {
                const attrs = step.attachment
                    .filter(isAttribute)
                    .map(attachment => attachment.body.replace(RP_ATTRIBUTE_PREFIX, ''));
                return [...new Set([...attachments, ...attrs])]
            }, [])
            .map(attachment => {
                const [key, value] = attachment.split(':');
                return key && value 
                    ? { key, value, system: false }
                    : { value: key, system: false }
            });

        // Start test
        const testItem = this.rpClient.startTestItem({
            description: this.formatTags(testCase.pickle.tags),
            name: testCase.pickle.name,
            startTime,
            type: 'STEP',
            attributes
        }, this.launchId, featureTempId);
        this.promiseQ.push(testItem.promise);
        await testItem.promise;

        //send steps
        for (const step of steps) {
            const duration = step.result.duration;
            endTime = startTime + (duration.seconds * 1_000) + Math.floor(duration.nanos / 1_000_000);
            const nestedTestItem = this.rpClient.startTestItem({
                description: 'test description',
                name: this.getStepText(step, steps),
                startTime,
                type: 'STEP',
                hasStats: false
            }, this.launchId, testItem.tempId);
            this.promiseQ.push(nestedTestItem.promise);
            await nestedTestItem.promise;
            if (step.result.message) {
                const log = await this.rpClient.sendLog(nestedTestItem.tempId, {
                    level: 'ERROR',
                    message: this.getMessage(step),
                    time: startTime
                });
                this.promiseQ.push(log.promise);
                await log.promise;
            }
            if (step.attachment) {
                for (const attachment of step.attachment) {
                    await this.sendAttachment(attachment, nestedTestItem, startTime);
                }
            }
            const nestedItemFinish = this.rpClient.finishTestItem(nestedTestItem.tempId, {
                status: this.getStatus(step),
                endTime
            });
            this.promiseQ.push(nestedItemFinish.promise);
            await nestedItemFinish.promise;
            startTime = endTime;
        }

        //finish test item
        const status = Object.values(testCase.stepResults).some(step => step.status !== Status.PASSED)
            ? Status.FAILED.toLowerCase()
            : Status.PASSED.toLowerCase()
        const testItemFinish = this.rpClient.finishTestItem(testItem.tempId, {
            status,
            endTime
        });
        this.promiseQ.push(testItemFinish.promise);
        await testItemFinish.promise;
    }

    getStepResults(testCase) {
        return testCase.testCase.testSteps.map(step => ({
            result: testCase.stepResults[step.id],
            pickle: testCase.pickle.steps.find(pickle => pickle.id === step.pickleStepId),
            attachment: testCase.stepAttachments[step.id] ?? []
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
        switch (step.result.status) {
            case Status.PASSED: return Status.PASSED.toLowerCase();
            case Status.SKIPPED: return Status.SKIPPED.toLowerCase();
            default: return Status.FAILED.toLowerCase()
        }
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

    async sendAttachment(attachment, testItem, startTime) {
        let log;
        if (attachment.mediaType === 'text/x.cucumber.log+plain' && RP_ATTRIBUTE_PREFIX.test(attachment.body)) return;
        if (attachment.mediaType === 'text/x.cucumber.log+plain') {
            log = await this.rpClient.sendLog(testItem.tempId, {
                level: 'INFO',
                message: attachment.body,
                time: startTime
            });
        } else {
            const attachmentData = {
                name: 'attachment',
                type: attachment.mediaType,
                content: this.prepareContent(attachment),
            };
            log = await this.rpClient.sendLog(testItem.tempId, {
                level: 'INFO',
                message: 'Attachment',
                time: startTime
            }, attachmentData);
        }
        this.promiseQ.push(log.promise);
        await log.promise;
    }
}

module.exports = RPFormatter
