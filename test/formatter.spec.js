const RPFormatter = require('../index');
const RPClient = require('@reportportal/client-javascript');
jest.mock('@reportportal/client-javascript');

const options = {
    colorFns: jest.fn(),
    cwd: '',
    eventBroadcaster: {
        on: jest.fn(),
    },
    eventDataCollector: {},
    log: jest.fn(),
    parsedArgvOptions: {},
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
    const formatter = new RPFormatter(options);
    const fnCall = options.eventBroadcaster.on.mock.calls[0]
    expect(fnCall[0]).toEqual('envelope');
    expect(fnCall[1]).toBeInstanceOf(Function);
});
