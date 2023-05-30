import RPClient from '@reportportal/client-javascript';
import {retry} from './utils';
import {Status} from '@cucumber/cucumber';
import {ITestCaseAttempt} from '@cucumber/cucumber/lib/formatter/helpers/event_data_collector';

export type Config = {
    enable: boolean,
    debug: boolean,
    token: string,
    endpoint: string,
    description: string,
    tags: string[],
    project: string,
    launch: string,
    mode: 'DEFAULT'|'DEBUG',
    retry: number
}
export default class Client {

    config: Config = {
        enable: true,
        debug: false,
        token: '',
        endpoint: '',
        description: '',
        tags: [],
        project: '',
        launch: '',
        mode: 'DEFAULT',
        retry: 1
    }
    launchId: string = '';
    rpClient: RPClient;
    promiseQ: Promise<any>[];
    features: { [feature: string]: string } = {};
    RP_ATTRIBUTE_PREFIX = /^rp_attribute:\s*/;
    retry = retry.bind(this);
    constructor(config: Config) {
        this.config = { ...this.config, ...config }
        this.rpClient = new RPClient(this.config);
        this.promiseQ = [];
    }

    async startLaunch() {
        const mode = this.config.mode
            ? this.config.mode
            : this.config.debug ? 'DEBUG' : 'DEFAULT';
        const launchObj = this.rpClient.startLaunch({
            name: this.config.launch,
            startTime: this.rpClient.helpers.now(),
            description: this.config.description,
            attributes: this.config.tags,
            mode: this.config.mode
        });
        this.launchId = launchObj.tempId;
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

    async finishTest(testCase: ITestCaseAttempt) {
        if (!testCase.gherkinDocument.feature) throw new Error('feature is undefined');
        const featureName = testCase.gherkinDocument.feature.name;
        if (!this.features[featureName]) {
            await this.retry(async () => {
                const featureItem = this.rpClient.startTestItem({
                    description:
                        //@ts-ignore
                        this.formatTags(testCase.gherkinDocument.feature.tags) +
                        '\n' +
                        testCase.gherkinDocument.feature?.description,
                    name: featureName,
                    startTime: this.rpClient.helpers.now(),
                    type: 'SUITE'
                }, this.launchId);
                this.features[featureName] = featureItem.tempId;
                this.promiseQ.push(featureItem.promise);
                await featureItem.promise;
            }, this.config.retry);
        }

        const featureTempId = this.features[featureName];
        let startTime: number = this.rpClient.helpers.now();
        let endTime: number = startTime;
        const steps = this.getStepResults(testCase);
        const attributes = steps.reduce((attachments: any, step) => {
            const attrs = step.attachment
                .filter((attachment: any) => this.isAttribute(attachment))
                .map(attachment => attachment.body.replace(this.RP_ATTRIBUTE_PREFIX, ''));
            return [...new Set([...attachments, ...attrs])]
        }, []);
        // Start test
        const testItem = await this.retry(async () => {
            const testItem = this.rpClient.startTestItem({
                //@ts-ignore
                description: this.formatTags(testCase.pickle.tags),
                name: testCase.pickle.name,
                startTime,
                type: 'STEP',
                attributes
            }, this.launchId, featureTempId);
            this.promiseQ.push(testItem.promise);
            await testItem.promise;
            return testItem;
        }, this.config.retry);

        //send steps
        for (const step of steps) {
            const duration = step.result.duration;
            endTime = startTime + (duration.seconds * 1_000) + Math.floor(duration.nanos / 1_000_000);

            const nestedTestItem = await this.retry(async () => {
                const nestedTestItem = this.rpClient.startTestItem({
                    description: 'test description',
                    name: this.getStepText(step, steps),
                    startTime,
                    type: 'STEP',
                    hasStats: false
                }, this.launchId, testItem.tempId);
                this.promiseQ.push(nestedTestItem.promise);
                await nestedTestItem.promise;
                return nestedTestItem;
            }, this.config.retry);

            if (step.result.message) {
                await this.retry(async () => {
                    const log = await this.rpClient.sendLog(nestedTestItem.tempId, {
                        level: 'ERROR',
                        message: this.getMessage(step),
                        time: startTime
                    });
                    this.promiseQ.push(log.promise);
                    await log.promise;
                }, this.config.retry);
            }
            if (step.attachment) {
                for (const attachment of step.attachment) {
                    await this.retry(async () => {
                        await this.sendAttachment(attachment, nestedTestItem, startTime);
                    }, this.config.retry);
                }
            }
            await this.retry(async () => {
                const nestedItemFinish = this.rpClient.finishTestItem(nestedTestItem.tempId, {
                    status: this.getStatus(step),
                    endTime
                });
                this.promiseQ.push(nestedItemFinish.promise);
                await nestedItemFinish.promise;
                startTime = endTime;
            }, this.config.retry);
        }

        //finish test item
        const status = (Object.values(testCase.stepResults).some(step => step.status !== Status.PASSED)
            ? Status.FAILED.toLowerCase()
            : Status.PASSED.toLowerCase()) as 'PASSED'|'FAILED';
        const testItemFinish = this.rpClient.finishTestItem(testItem.tempId, {
            status,
            endTime
        });
        this.promiseQ.push(testItemFinish.promise);
        await testItemFinish.promise;
    }

    getStepResults(testCase: ITestCaseAttempt) {
        return testCase.testCase.testSteps.map(step => ({
            result: testCase.stepResults[step.id],
            pickle: testCase.pickle.steps.find(pickle => pickle.id === step.pickleStepId),
            attachment: testCase.stepAttachments[step.id] ?? []
        }))
    }

    getStepText(step: any, steps: any[]) {
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

    hookKeyword(step: any, steps: any) {
        const stepsBefore = steps.slice(0, steps.findIndex((element: string) => element === step));
        return stepsBefore.every((element: any) => element.pickle === undefined) ? 'Before' : 'After'
    }
    getMessage(step: any) {
        return step.result.message
    }

    getStatus(step: any): 'PASSED'|'FAILED' {
        switch (step.result.status) {
            case Status.PASSED: return Status.PASSED.toLowerCase() as 'PASSED';
            case Status.SKIPPED: return Status.SKIPPED.toLowerCase() as 'FAILED';
            default: return Status.FAILED.toLowerCase() as 'FAILED';
        }
    }

    formatTable(dataTable: any) {
        const TR = '<tr>';
        const TRE = '</tr>';
        const TD = '<td>';
        const TDE = '</td>';
        const formatRow = (row: any) => TR + row.cells.map((cell: any) => TD + cell.value + TDE).join('') + TRE;
        return '<table><tbody>' + dataTable.rows.map(formatRow).join('') + '</tbody></table>'
    }

    formatDocString(docString: any) {
        return '<pre><code>' + docString.content + '</code></pre>'
    }

    formatTags(tags: any[]) {
        return tags.map(tag => '<code>' + tag.name + '</code>').join('')
    }

    prepareContent(attachment: any) {
        return ['text/plain', 'application/json'].includes(attachment.mediaType)
            ? Buffer.from(attachment.body).toString('base64')
            : attachment.body
    }

    async sendAttachment(attachment: any, testItem: any, startTime: any) {
        let log;
        if (attachment.mediaType === 'text/x.cucumber.log+plain' && this.RP_ATTRIBUTE_PREFIX.test(attachment.body)) return;
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

    isAttribute(attachment: any) {
        return attachment.mediaType === 'text/x.cucumber.log+plain' && this.RP_ATTRIBUTE_PREFIX.test(attachment.body)
    }

}
