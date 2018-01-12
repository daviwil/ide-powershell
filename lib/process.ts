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

export class PowerShellProcess {

    private childProcess: cp.ChildProcess;
    private consoleTerminal: ITerminal = undefined;
    private consoleCloseSubscription: Disposable;
    private sessionDetails: utils.EditorServicesSessionDetails;

    // private onExitedEmitter = new vscode.EventEmitter<void>();
    // public onExited: vscode.Event<void> = this.onExitedEmitter.event;

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
                        this.childProcess =
                          this.createFakeChildProcess(
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

    public getProcess(): cp.ChildProcess {
      // TODO: Find a better way to do this
      // TODO: Filter 'error' events
      let terminalProcess = this.consoleTerminal.getProcess();
      var Readable = require('stream').Readable;
      terminalProcess.stderr = new Readable();
      terminalProcess.stderr._read = function fake() {};
      return terminalProcess;
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

      private createFakeChildProcess(pty: any): cp.ChildProcess {
      class FakeChildProcess extends EventEmitter {
        public stdio: [stream.Writable, stream.Readable, stream.Readable];
        public stdin: stream.Writable;
        public stdout: stream.Readable;
        public stderr: stream.Readable;
        public killed: boolean;
        public pid: number;
        public connected: boolean;

        public kill(signal?: string) {

        }

        public send(message: any, callback?: (error: Error) => void): boolean;
        public send(message: any, sendHandle?: net.Socket | net.Server, callback?: (error: Error) => void): boolean;
        public send(message: any, sendHandle?: net.Socket | net.Server, options?: cp.MessageOptions, callback?: (error: Error) => void): boolean {
          return false;
        }

        public disconnect() {

        }

        public unref() {

        }

        public ref() {

        }
      }

      return new FakeChildProcess();
    }
}
