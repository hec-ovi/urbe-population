export type TestbedErrorCode = 'E_MOUNT_UNAVAILABLE' | 'E_CANVAS_UNAVAILABLE' | 'E_STARTUP';

export class TestbedError extends Error {
  readonly name = 'TestbedError';

  constructor(readonly code: TestbedErrorCode, message: string) {
    super(message);
  }
}
