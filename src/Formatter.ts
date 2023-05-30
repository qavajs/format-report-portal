import Client, {Config} from './Client';
import { Formatter, Status, IFormatterOptions } from '@cucumber/cucumber';
import { retry } from './utils';

class RPFormatter extends Formatter {

    client: Client;

    constructor(options: IFormatterOptions) {
        super(options);
        const rpEnable = options.parsedArgvOptions.rpConfig.enable;
        this.client = new Client(options.parsedArgvOptions.rpConfig);
        if (rpEnable !== undefined && !rpEnable) return;
        options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));
    }

    async processEnvelope(envelope: any) {
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
        await this.client.startLaunch();
    }

    async finishLaunch() {
        await this.client.finishLaunch();
    }

    async finishTest(envelope: any) {
        if (envelope.testCaseFinished.willBeRetried) return;
        const testCase = this.eventDataCollector.getTestCaseAttempt(envelope.testCaseFinished.testCaseStartedId);
        await this.client.finishTest(testCase);
    }


}

module.exports = RPFormatter
