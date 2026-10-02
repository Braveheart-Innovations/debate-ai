/**
 * Typed harness for testing Firebase Functions v2 callables (functions/src)
 * from the root Jest. The mocked `onCall` hands each handler back as-is, so a
 * test invokes handlers directly with only the request fields they read —
 * the real `CallableRequest` also demands a full Express `rawRequest`.
 *
 *   const mockOnCall = createOnCallMock<TestRequest>();
 *   jest.mock('firebase-functions/v2/https', () => ({
 *     onCall: mockOnCall,
 *     HttpsError: MockHttpsError,
 *   }), { virtual: true });
 *   const { myCallable } = require('../../functions/src/x') as typeof import('../../functions/src/x');
 *   // Capture at load: `jest.clearAllMocks()` wipes `mock.results`.
 *   const invoke = createInvoker(registeredHandlersOf(mockOnCall));
 *   await invoke(myCallable, { data: {...}, auth: {...} });
 */

export type CallableOptions = { secrets?: Array<{ name: string }> };
export type CallableHandler<Req> = (request: Req) => Promise<unknown>;

/** Mock for `onCall(options?, handler)` that returns the handler itself. */
export const createOnCallMock = <Req>() =>
  jest.fn(
    (optionsOrHandler: CallableOptions | CallableHandler<Req>, maybeHandler?: CallableHandler<Req>) =>
      typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler
  );

export type OnCallMock<Req> = ReturnType<typeof createOnCallMock<Req>>;

/** Stand-in for `HttpsError`: carries the callable error `code`. */
export class MockHttpsError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'HttpsError';
  }
}

/** Handlers registered so far; call right after loading the functions module. */
export const registeredHandlersOf = <Req>(onCall: OnCallMock<Req>): CallableHandler<Req>[] =>
  onCall.mock.results.flatMap((result) => (result.type === 'return' && result.value ? [result.value] : []));

/** Runs the handler a mocked `onCall` registered for `callable`. */
export const createInvoker =
  <Req>(handlers: CallableHandler<Req>[]) =>
  (callable: object, request: Req): Promise<unknown> => {
    const handler = handlers.find((candidate) => candidate === callable);
    if (!handler) {
      throw new Error('invoke: callable was not registered through onCall');
    }
    return handler(request);
  };
