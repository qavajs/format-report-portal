const RPFormatter = require('../index');
const RPClient = require('@reportportal/client-javascript');
const { EventEmitter } = require('node:events');
jest.mock('@reportportal/client-javascript', () => {
    return class RPMock {
        startLaunch() {
            return {
                tempId: 42,
                promise: Promise.resolve()
            }
        }
        helpers = {
            now() { return Date.now() }
        }
    }
});

const options = {
    colorFns: jest.fn(),
    cwd: '',
    eventBroadcaster: new EventEmitter(),
    eventDataCollector: {},
    log: jest.fn(),
    parsedArgvOptions: {
        rpConfig: {}
    },
    snippetBuilder: {},
    stream: {},
    cleanup: jest.fn(),
    supportCodeLibrary: {}
}

test('properties set in constructor', () => {
    const formatter = new RPFormatter(options);
    expect(formatter.rpConfig).toEqual(options.parsedArgvOptions.rpConfig);
    expect(formatter.rpClient).toBeInstanceOf(RPClient);
    expect(formatter.promiseQ).toStrictEqual([]);
    expect(formatter.stepDefinitions).toStrictEqual({});
});

test('subscribes on events in constructor', () => {
    const fnCall= jest.spyOn(options.eventBroadcaster, 'on').mock;
    const formatter = new RPFormatter(options);
    expect(fnCall.calls[0][0]).toEqual('envelope');
    expect(fnCall.calls[0][1]).toBeInstanceOf(Function);
});

test('attributes is cleaned up before sending', async () => {
    jest.useFakeTimers();
    options.parsedArgvOptions.rpConfig = {
        description: 'Test',
        tags: ['Test', null, undefined, ''],
        project: 'test_project',
        launch: 'test launch',
    };
    const formatter = new RPFormatter(options);
    formatter.rpClient.helpers = { now() { return Date.now() } };
    const startLaunch= jest.spyOn(formatter.rpClient, 'startLaunch').mock;
    options.eventBroadcaster.emit('envelope', { testRunStarted: {} });
    const [ callOptions ] = startLaunch.calls.pop();
    expect(callOptions.attributes).toEqual(['Test']);
});

