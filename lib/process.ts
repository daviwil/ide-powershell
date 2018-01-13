import os = require('os');
import fs = require('fs');
import net = require('net');
import path = require('path');
import utils = require('./utils');
import stream = require('stream');
import cp = require('child_process');

import { Logger } from './logging';
import { Disposable } from 'atom';
import { EventEmitter } from 'events';
import { ITerminal, ITerminalService } from './terminalService';

// Represents the interface expected by the atom-languageclient class,
// even though they expect a child_process.ChildProcess instance.
export interface LanguageServerProcess extends EventEmitter {
    stderr: stream.Readable;
    pid: number;

    kill(signal?: string): void;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "exit", listener: (code: number, signal: string) => void): this;
}

export class PowerShellProcess {

    private languageServerProcess: LanguageServerProcess;
    private consoleTerminal: ITerminal = undefined;
    private consoleCloseSubscription: Disposable;
    private sessionDetails: utils.EditorServicesSessionDetails;

    constructor(
        public exePath: string,
        private title: string,
        private log: Logger,
        private startArgs: string,
        private sessionFilePath: string,
        private sessionSettings: any,
        private terminalTabService: ITerminalService) {
    }

    public start(logFileName: string): Promise<utils.EditorServicesSessionDetails> {

        return new Promise<utils.EditorServicesSessionDetails>(
            (resolve, reject) => {
                try {
                    let startScriptPath =
                        path.resolve(
                            __dirname,
                            '../scripts/Start-EditorServices.ps1');

                    var editorServicesLogPath = this.log.getLogFilePath(logFileName);

                    var featureFlags = "";
                        this.sessionSettings.developer.featureFlags !== undefined
                            ? this.sessionSettings.developer.featureFlags.map(f => `'${f}'`).join(', ')
                            : "";

                    this.startArgs +=
                        `-LogPath '${editorServicesLogPath}' ` +
                        `-SessionDetailsPath '${this.sessionFilePath}' ` +
                        `-FeatureFlags @(${featureFlags})`

                    var powerShellArgs = [
                        "-NoProfile",
                        "-NonInteractive"
                    ]

                    // Only add ExecutionPolicy param on Windows
                    if (utils.isWindowsOS()) {
                        powerShellArgs.push("-ExecutionPolicy", "Bypass")
                    }

                    powerShellArgs.push(
                        "-Command",
                        "& '" + startScriptPath + "' " + this.startArgs);

                    var powerShellExePath = this.exePath;

                    this.log.write(
                        "Language server starting --",
                        "    exe: " + powerShellExePath,
                        "    args: " + startScriptPath + ' ' + this.startArgs);

                    // Make sure no old session file exists
                    utils.deleteSessionFile(this.sessionFilePath);

                    // Launch PowerShell in the integrated terminal
                      this.terminalTabService.openTerminal({
                        shell: powerShellExePath,
                        args: powerShellArgs,
                        title: this.title
                      }).then((terminal) => {
                        this.consoleTerminal = terminal;
                        this.languageServerProcess =
                          this.createLanguageServerProcess(
                            this.consoleTerminal.getProcess());

                        // Start the language client
                        utils.waitForSessionFile(
                            this.sessionFilePath,
                            (sessionDetails, error) => {
                                // Clean up the session file
                                utils.deleteSessionFile(this.sessionFilePath);

                                if (error) {
                                    reject(error);
                                }
                                else {
                                    this.sessionDetails = sessionDetails;
                                    resolve(this.sessionDetails);
                                }
                        });
                      });

                // this.consoleCloseSubscription =
                //     vscode.window.onDidCloseTerminal(
                //         terminal => {
                //             if (terminal === this.consoleTerminal) {
                //                 this.log.write("powershell.exe terminated or terminal UI was closed");
                //                 // this.onExitedEmitter.fire();
                //             }
                //         });

                // this.consoleTerminal.processId.then(
                //     pid => { this.log.write(`powershell.exe started, pid: ${pid}`); });
            }
            catch (e) {
              reject(e);
            }
        });
    }

    public getProcess(): LanguageServerProcess {
      return this.languageServerProcess;
    }

    public showConsole(preserveFocus: boolean) {
        if (this.consoleTerminal) {
            this.consoleTerminal.show(preserveFocus);
        }
    }

    public dispose() {

        // Clean up the session file
        utils.deleteSessionFile(this.sessionFilePath);

        if (this.consoleCloseSubscription) {
            this.consoleCloseSubscription.dispose();
            this.consoleCloseSubscription = undefined;
        }

        if (this.consoleTerminal) {
            this.log.write("Terminating PowerShell process...");
            this.consoleTerminal.dispose();
            this.consoleTerminal = undefined;
        }
    }

    private createLanguageServerProcess(pty) {
      class PSLanguageServerProcess extends EventEmitter implements LanguageServerProcess {
        public stderr: stream.Readable;
        public pid: number;

        constructor(private pty, private log: Logger) {
          super();

          // Fake the stderr stream for now
          var Readable = require('stream').Readable;
          this.stderr = new Readable();
          this.stderr._read = function fake() {};

          pty.on('exit', this.handleExit.bind(this));
          pty.on('error', this.handleError.bind(this));
        }

        public kill(signal?: string): void {
          this.pty.kill(signal)
        }

        private handleExit(code: number, signal: string) {
          this.log.write(`powershell.exe exited: code ${code}, signal ${signal}`)
          this.emit('exit', code, signal);
        }

        private handleError(err: Error) {
          if (err.message === 'read EIO') {
            // This shows up when the terminal is killed by the user, ignore it
          }
          else {
            this.log.writeError("powershell.exe exited due to an error:", err.toString());
            this.emit('error', err);
          }
        }
      }

      return new PSLanguageServerProcess(pty, this.log);
    }
}
