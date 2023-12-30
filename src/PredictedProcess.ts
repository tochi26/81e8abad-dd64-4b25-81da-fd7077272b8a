import { spawn, type ChildProcess } from 'child_process';

export class PredictedProcess {
  private _childProcess: ChildProcess | null = null;
  private _isRunning: boolean = false;

  public constructor(
    public readonly id: number,
    public readonly command: string,
  ) { }

  /**
   * Spawns and manages a child process to execute a given command, with handling for an optional AbortSignal.
   *
   * Expected behavior:
   * 1. No process should be initiated if a signal that has already been aborted is passed;
   *    instead, the function should reject immediately.
   * 2. The function should reject if the process terminates with an error or if the AbortSignal is triggered during execution.
   * 3. The function should resolve if the process terminates successfully.
   * 4. Regardless of the outcome (resolve or reject), the function should ensure cleanup of the child process and any linked event listeners.
   *
   * @example
   * ```ts
   * const signal = new AbortController().signal
   * const process = new PredictedProcess(1, 'sleep 5; echo "Hello, world!"')
   *
   * process.run(signal).then(() => {
   *   console.log('The process has exited successfully.')
   * }).catch(() => {
   *   console.log('The process has exited with an error.')
   * })
   *
   * signal.abort() // "Hello, world!" should not be printed.
   * ```
   */
  public async run(signal?: AbortSignal): Promise<void> {
    // Check if the signal has already been aborted
    if (signal && signal.aborted) {
      throw new Error('AbortSignal already aborted');
    }

    // Check if another instance of the process is already running
    if (this._isRunning) {
      throw new Error('Process is already running');
    }

    // Set the flag to indicate that the process is running
    this._isRunning = true;

    return new Promise<void>((resolve, reject) => {
      // Create a child process
      const childProcess = spawn(this.command, { shell: true });

      // Store the child process
      this._childProcess = childProcess;

      // Event handler for process completion
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        // Clean up event listeners
        this._childProcess?.removeAllListeners();
        this._childProcess = null;
        this._isRunning = false;

        // Check if the process was successful or aborted
        if (code === 0) {
          resolve();
        } else if (signal === 'SIGABRT' || signal === null) {
          reject(new Error(`Process aborted with signal: ${signal}`));
        } else {
          reject(new Error(`Process failed with code ${code}`));
        }
      };

      // Attach event listeners
      childProcess.once('exit', onExit);

      // Attach event listener for abort signal
      if (signal) {
        const onAbort = () => {
          childProcess.kill('SIGABRT');
        };
        signal.addEventListener('abort', onAbort);

        // Remove the abort listener once the process exits
        childProcess.once('exit', () => {
          signal.removeEventListener('abort', onAbort);
        });
      }

      // Event handler for process error
      childProcess.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Returns a memoized version of `PredictedProcess`.
   *
   * Expected behavior:
   * 1. If the `run` method was previously called with the same AbortSignal and completed without errors,
   *    subsequent calls with the same signal should return immediately, bypassing command re-execution.
   * 2. No process should be initiated if the AbortSignal is already aborted before invoking the `run` method.
   * 3. For concurrent invocations with the same AbortSignal, while `run` is in execution,
   *    these calls should await the ongoing process's completion.
   * 4. Results from executions of `run` that encounter errors or are aborted should not be stored in the memoization cache.
   *
   * Note: The uniqueness of a request is determined by the AbortSignal. Each distinct signal is considered a separate request.
   *
   * @example
   * ```ts
   * const process = new PredictedProcess(1, 'sleep 5; echo "Hello, world!"');
   * const memoizedProcess = process.memoize();
   *
   * const signal = new AbortController().signal;
   * memoizedProcess.run(signal).then(() => {
   *   console.log('The process has executed successfully.');
   * }).catch(() => {
   *   console.log('The process execution resulted in an error.');
   * });
   *
   * memoizedProcess.run(signal); // This call will return the cached result if the first call was successful.
   * ```
   */
  public memoize(): PredictedProcess {
    // Create a new instance of PredictedProcess with the same id and command
    const memoizedProcess = new PredictedProcess(this.id, this.command);

    // Reset child process reference and running flag
    memoizedProcess._childProcess = null;
    memoizedProcess._isRunning = false;

    return memoizedProcess;
  }
}
