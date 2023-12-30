import { spawn } from 'child_process';
import type { PredictedProcess } from './PredictedProcess';

export class PredictedProcessesManager {
  private _processes: PredictedProcess[] = [];

  public constructor(processes: readonly PredictedProcess[] = []) {
    this._processes = processes.slice();
  }

  public get processes(): readonly PredictedProcess[] {
    return this._processes.slice();
  }

  public addProcess(process: PredictedProcess): this {
    this._processes.push(process);
    return this;
  }

  public removeProcess(id: number): this {
    this._processes = this._processes.filter((process) => process.id !== id);
    return this;
  }

  public getProcess(id: number): PredictedProcess | undefined {
    return this.processes.find((process) => process.id === id);
  }

  /**
   * Executes multiple predicted processes. If an AbortSignal is provided and triggered,
   * it will attempt to abort the ongoing processes.
   *
   * This function will run all processes asynchronously. Each process is expected to
   * be handled similarly to the `run` method, respecting the abort signal for cancellation,
   * and handling process exits (both success and error cases). The function should resolve/reject
   * after all processes have completed or if an abort signal is triggered.
   *
   * If no signal is provided, the function will simply run all processes to completion or
   * error without any external way to cancel them mid-execution.
   *
   * @example
   * ```ts
   * const signal = new AbortController().signal
   * const processes = [
   *   new PredictedProcess(1, 'sleep 5; echo "Hello, world!"', signal),
   *   new PredictedProcess(2, 'sleep 10; echo "Hello, world!"', signal),
   *   new PredictedProcess(3, 'sleep 15; echo "Hello, world!"', signal),
   * ]
   *
   * const manager = new PredictedProcessesManager(processes)
   *
   * manager.runAll(signal).then(() => {
   *   console.log('All processes have exited successfully.')
   * }).catch(() => {
   *   console.log('At least one process has exited with an error.')
   * })
   *
   * signal.abort() // "Hello, world!" should not be printed.
   *
   * // If no signal is provided, the function should run all processes to completion or error.
   * manager.runAll().then(() => {
   *   console.log('All processes have exited successfully.')
   * }).catch(() => {
   *   console.log('At least one process has exited with an error.')
   * })
   *
   * // "Hello, world!" should be printed.
   * ```
   */
  public async runAll(signal?: AbortSignal): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const process of this._processes) {
      const promise = new Promise<void>(async (resolve, reject) => {
        const spawnedProcess = spawn(process.command, [], { shell: true });

        spawnedProcess.on('close', (code: number) => {
          if (code === 0) {
            resolve(); // Resolve for successful exit
          } else {
            reject(new Error(`Process ${process.id} exited with code ${code}`));
          }
        });

        spawnedProcess.on('error', (err: Error) => {
          reject(err); // Reject for process error
        });

        if (signal) {
          signal.addEventListener('abort', () => {
            spawnedProcess.kill(); // Abort the process on signal
            reject(new Error('AbortSignal triggered'));
          });
        }
      });

      promises.push(promise);
    }

    const errors: Error[] = [];

    await Promise.allSettled(promises.map((promise) => promise.catch((error) => errors.push(error))));

    if (errors.length > 0) {
      const errorMessage = errors.map((error) => error.message).join('\n');
      throw new Error(`At least one process has exited with an error:\n${errorMessage}`);
    }
  }
}
