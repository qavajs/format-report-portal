const { Formatter, Status } = require('@cucumber/cucumber');
const RPClient = require('@reportportal/client-javascript');
const { retry } = require('./utils');

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
        this.stepDefinitions = {};
    }

    async processEnvelope(envelope) {
        try {
            if (envelope.stepDefinition || envelope.hook) {
                return this.readStepDefinition(envelope);
            }
            if (envelope.testRunStarted) {
                const startLaunch = this.startLaunch();
                this.promiseQ.push(startLaunch);
                await startLaunch;
            }
            else if (envelope.testCaseFinished) {
                const finishTest = this.finishTest(envelope)
                this.promiseQ.push(finishTest);
                await finishTest;
            }
            else if (envelope.testRunFinished) {
                await this.finishLaunch();
            }
        } catch (err) {
            if (this.rpConfig.ignoreErrors) {
                console.error(err);
            } else {
                throw err;
            }
        }
    }

    readStepDefinition(stepDefinition) {
        const definition = stepDefinition.stepDefinition ?? stepDefinition.hook;
        this.stepDefinitions[definition.id] = definition;
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
        await Promise.allSettled(this.promiseQ);
        for (const featureName in this.features) {
            await this.rpClient.finishTestItem(this.features[featureName], { status: 'PASSED' }).promise;
        }
        await this.rpClient.finishLaunch(this.launchId, {
            endTime: this.rpClient.helpers.now()
        }).promise;
    }

    async finishTest(envelope) {
        const testCase = this.eventDataCollector.getTestCaseAttempt(envelope.testCaseFinished.testCaseStartedId);
        const featureName = testCase.gherkinDocument.feature.name;
        if (!this.features[featureName]) {
            await retry(async () => {
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
            }, this.rpConfig.retry);
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
        const retryTest = Boolean(testCase.attempt);
        const testItem = await retry(async () => {
            const testItem = this.rpClient.startTestItem({
                description: this.formatTags(testCase.pickle.tags),
                name: testCase.pickle.name,
                startTime,
                type: 'STEP',
                attributes,
                retry: retryTest
            }, this.launchId, featureTempId);
            await testItem.promise;
            return testItem;
        }, this.rpConfig.retry);

        //send steps
        for (const step of steps) {
            const duration = step.result.duration;
            endTime = startTime + (duration.seconds * 1_000) + Math.floor(duration.nanos / 1_000_000);

            const nestedTestItem = await retry(async () => {
                const nestedTestItem = this.rpClient.startTestItem({
                    description: 'test description',
                    name: this.getStepText(step, steps),
                    startTime,
                    type: 'STEP',
                    hasStats: false
                }, this.launchId, testItem.tempId);
                await nestedTestItem.promise;
                return nestedTestItem;
            }, this.rpConfig.retry);

            if (step.result.message) {
                await retry(async () => {
                    const log = await this.rpClient.sendLog(nestedTestItem.tempId, {
                        level: 'ERROR',
                        message: this.getMessage(step),
                        time: startTime
                    });
                    await log.promise;
                }, this.rpConfig.retry);
            }
            if (step.attachment) {
                for (const attachment of step.attachment) {
                    await retry(async () => {
                        await this.sendAttachment(attachment, nestedTestItem, startTime);
                    }, this.rpConfig.retry);
                }
            }
            await retry(async () => {
                const nestedItemFinish = this.rpClient.finishTestItem(nestedTestItem.tempId, {
                    status: this.getStatus(step),
                    endTime
                });
                await nestedItemFinish.promise;
                startTime = endTime;
            }, this.rpConfig.retry);
        }

        //finish test item
        const status = Object.values(testCase.stepResults).some(step => step.status !== Status.PASSED)
            ? Status.FAILED.toLowerCase()
            : Status.PASSED.toLowerCase()
        const testItemFinish = this.rpClient.finishTestItem(testItem.tempId, {
            status,
            endTime
        });
        await testItemFinish.promise;
    }

    getStepResults(testCase) {
        return testCase.testCase.testSteps.map(step => ({
            id: step.id,
            stepDefinitionId: step.pickleStepId ?? step.hookId,
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
        const hook = this.stepDefinitions[step.stepDefinitionId];
        if (hook?.name) return hook.name;
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
        await log.promise;
    }
}

module.exports = RPFormatter
