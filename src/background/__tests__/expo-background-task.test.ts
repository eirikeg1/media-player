/**
 * The platform adapter's registration rules. The task body itself is covered in
 * `background-task.test.ts`; this is about what reaches the OS scheduler.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { TASK_NAME, expoBackgroundScheduler } from '../expo-background-task';

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  getStatusAsync: jest.fn(async () => 2),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  getRegisteredTasksAsync: jest.fn(async () => []),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ details: { isConnectionExpensive: false } })) },
}));

const LEGACY_TASK_NAME = 'sports-background-refresh';

const registerTask = jest.mocked(BackgroundTask.registerTaskAsync);
const unregisterTask = jest.mocked(BackgroundTask.unregisterTaskAsync);
const isTaskRegistered = jest.mocked(TaskManager.isTaskRegisteredAsync);
const getRegisteredTasks = jest.mocked(TaskManager.getRegisteredTasksAsync);

/** What the OS reports as registered, by task name and interval. */
function registered(tasks: Record<string, number>): void {
  isTaskRegistered.mockImplementation(async (name) => name in tasks);
  getRegisteredTasks.mockResolvedValue(
    Object.entries(tasks).map(([taskName, minimumInterval]) => ({
      taskName,
      taskType: 'background-task',
      options: { minimumInterval },
    })) as Awaited<ReturnType<typeof TaskManager.getRegisteredTasksAsync>>,
  );
}

beforeEach(() => {
  registerTask.mockClear();
  unregisterTask.mockClear();
  registered({});
});

describe('expoBackgroundScheduler.register', () => {
  it('registers the task when the OS has none', async () => {
    await expoBackgroundScheduler.register(180);

    expect(unregisterTask).not.toHaveBeenCalled();
    expect(registerTask).toHaveBeenCalledWith(TASK_NAME, { minimumInterval: 180 });
  });

  it('leaves an unchanged registration alone, so the next wake is not pushed back', async () => {
    registered({ [TASK_NAME]: 180 });

    await expoBackgroundScheduler.register(180);

    expect(unregisterTask).not.toHaveBeenCalled();
    expect(registerTask).not.toHaveBeenCalled();
  });

  it('takes the task down and puts it back when the interval changed', async () => {
    // Registering over an existing name only stores the options on Android;
    // the worker would keep waking at the old cadence until a restart.
    registered({ [TASK_NAME]: 720 });

    await expoBackgroundScheduler.register(30);

    expect(unregisterTask.mock.calls).toEqual([[TASK_NAME]]);
    expect(registerTask).toHaveBeenCalledWith(TASK_NAME, { minimumInterval: 30 });
    expect(unregisterTask.mock.invocationCallOrder[0]).toBeLessThan(
      registerTask.mock.invocationCallOrder[0],
    );
  });

  it('retires the registration an older build left under the sports name', async () => {
    registered({ [LEGACY_TASK_NAME]: 720 });

    await expoBackgroundScheduler.register(180);

    expect(unregisterTask).toHaveBeenCalledWith(LEGACY_TASK_NAME);
    expect(registerTask).toHaveBeenCalledWith(TASK_NAME, { minimumInterval: 180 });
  });
});

describe('expoBackgroundScheduler.unregister', () => {
  it('removes both names, and only the ones the OS actually has', async () => {
    registered({ [TASK_NAME]: 180 });

    await expoBackgroundScheduler.unregister();

    expect(unregisterTask.mock.calls).toEqual([[TASK_NAME]]);
  });
});
