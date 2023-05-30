declare module '@reportportal/client-javascript' {
    export type RPItem = {
        promise: Promise<any>,
        tempId: string
    }
    export type StartLaunchOptions = {
        startTime: number,
        name: string,
        mode?: 'DEFAULT'|'DEBUG',
        description?: string,
        attributes?: {key?: string, value: string}[] | string[],
        id?: string
    }
    export type FinishLaunchOptions = {
        endTime?: number;
        status?: ''|'PASSED'|'FAILED'|'STOPPED'|'SKIPPED'|'INTERRUPTED'|'CANCELLED'
    }
    export type StartTestItemOptions = {
        startTime?: number,
        name?: string,
        type?: 'SUITE'|'STORY'|'TEST'|'SCENARIO'|'STEP'|'BEFORE_CLASS'|'BEFORE_GROUPS'|'BEFORE_METHOD'|'BEFORE_SUITE'|'BEFORE_TEST'|'AFTER_CLASS'|'AFTER_GROUPS'|'AFTER_METHOD'|'AFTER_SUITE'|'AFTER_TEST',
        description?: string,
        attributes?: {key?: string, value: string}[] | string[],
        hasStats?: boolean
    }
    export type FinishTestItemOptions = {
        endTime?: number;
        status?: ''|'PASSED'|'FAILED'|'STOPPED'|'SKIPPED'|'INTERRUPTED'|'CANCELLED',
        issue?: string
    }
    export type SendLogOptions = {
        time?: number;
        level?: 'TRACE'|'DEBUG'|'INFO'|'WARN'|'ERROR'|'',
        message?: string
    }
    export type File = {
        name?: string,
        type?: string,
        content?: string
    }
    export default class RPClient {
        constructor(options: any);
        startLaunch(options: StartLaunchOptions): RPItem;
        finishLaunch(id: string, options: FinishLaunchOptions): RPItem;
        startTestItem(options: StartTestItemOptions, launchId: string, parentId?: string): RPItem;
        finishTestItem(id: string, options: FinishTestItemOptions): RPItem;
        sendLog(parentId: string, options: SendLogOptions, file?: File): RPItem;
        helpers: {
            now(): number;
        }
    }
}
