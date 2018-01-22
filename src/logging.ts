import fs = require('fs');
import os = require('os');
import path = require('path');
import utils = require('./utils');
import jsonrpc = require('vscode-jsonrpc');

import { NotificationManager } from "atom";

export enum LogLevel {
    Verbose,
    Normal,
    Warning,
    Error
}

export class Logger {

    private logFilePath: string;

    public logBasePath: string;
    public logSessionPath: string;
    public MinimumLogLevel: LogLevel = LogLevel.Normal;

    constructor() {
        this.logBasePath = path.resolve(__dirname, "../logs");
        utils.ensurePathExists(this.logBasePath);

        // this.commands = [
        //     vscode.commands.registerCommand(
        //         'PowerShell.ShowLogs',
        //         () => { this.showLogPanel(); }),
        //
        //     vscode.commands.registerCommand(
        //         'PowerShell.OpenLogFolder',
        //         () => { this.openLogFolder(); })
        // ]
    }

    public getLogFilePath(baseName: string): string {
        return path.resolve(this.logSessionPath, `${baseName}.log`);
    }

    public writeAtLevel(logLevel: LogLevel, message: string, ...additionalMessages: string[]) {
        if (logLevel >= this.MinimumLogLevel) {
            this.writeLine(message, logLevel)

            additionalMessages.forEach((line) => {
                this.writeLine(line, logLevel);
            });
        }
    }

    public write(message: string, ...additionalMessages: string[]) {
        this.writeAtLevel(LogLevel.Normal, message, ...additionalMessages);
    }

    public writeVerbose(message: string, ...additionalMessages: string[]) {
        this.writeAtLevel(LogLevel.Verbose, message, ...additionalMessages);
    }

    public writeWarning(message: string, ...additionalMessages: string[]) {
        this.writeAtLevel(LogLevel.Warning, message, ...additionalMessages);
    }

    public writeAndShowWarning(message: string, ...additionalMessages: string[]) {
        this.writeWarning(message, ...additionalMessages);

        atom.notifications.addWarning(message);
    }

    public writeError(message: string, ...additionalMessages: string[]) {
        this.writeAtLevel(LogLevel.Error, message, ...additionalMessages);
    }

    public writeAndShowError(message: string, ...additionalMessages: string[]) {
        this.writeError(message, ...additionalMessages);

        atom.notifications.addError(message);
    }

    public startNewLog(minimumLogLevel: string = "Normal") {
        this.MinimumLogLevel = this.logLevelNameToValue(minimumLogLevel.trim());

        this.logSessionPath =
            path.resolve(
                this.logBasePath,
                `${Math.floor(Date.now() / 1000)}-${process.pid}`);

        this.logFilePath = this.getLogFilePath("ide-powershell");

        utils.ensurePathExists(this.logSessionPath);
    }

    private logLevelNameToValue(logLevelName: string): LogLevel {
        switch (logLevelName.toLowerCase()) {
            case "normal": return LogLevel.Normal;
            case "verbose": return LogLevel.Verbose;
            case "warning": return LogLevel.Warning;
            case "error": return LogLevel.Error;
            default: return LogLevel.Normal;
        }
    }

    public dispose() {
        // this.commands.forEach((command) => { command.dispose() });
    }

    // private openLogFolder() {
    //     if (this.logSessionPath) {
    //         // Open the folder in VS Code since there isn't an easy way to
    //         // open the folder in the platform's file browser
    //         vscode.commands.executeCommand(
    //             'vscode.openFolder',
    //             vscode.Uri.file(this.logSessionPath),
    //             true);
    //     }
    // }

    private writeLine(message: string, level: LogLevel = LogLevel.Normal) {
        let now = new Date();
        let timestampedMessage = `${now.toLocaleDateString()} ${now.toLocaleTimeString()} [${LogLevel[level].toUpperCase()}] - ${message}`

        console.log(timestampedMessage);
        if (this.logFilePath) {
            fs.appendFile(
                this.logFilePath,
                timestampedMessage + os.EOL,
                err => {
                    if (err) {
                        console.log(`Error writing to vscode-powershell log file: ${err}`)
                    }
                });
        }
    }
}