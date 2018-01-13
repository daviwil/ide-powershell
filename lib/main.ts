import net = require('net');
import path = require('path');
import utils = require('./utils');
import cp = require('child_process');

import { AutoLanguageClient } from 'atom-languageclient';
import { PowerShellProcess, LanguageServerProcess } from './process';
import { PlatformDetails, getPlatformDetails, getDefaultPowerShellPath } from './platform';
import { ITerminalService } from './terminalService';
import { Logger } from './logging';

// NOTE: We will need to find a better way to deal with the required
//       PS Editor Services version...
const requiredEditorServicesVersion = "1.5.1";

class PowerShellLanguageClient extends AutoLanguageClient {

  private log: Logger;
  private sessionSettings: any;
  private terminalTabService: ITerminalService;
  private powerShellProcess: PowerShellProcess;
  private terminalTabServiceResolver: (ITerminalService) => void;
  private supportedExtensions = [ ".ps1", ".psm1", ".ps1xml" ];
  private platformDetails: PlatformDetails;

  // These are defined in the base class, redefined for typings
  public socket: net.Socket;

  getGrammarScopes () { return [ 'source.powershell' ] }
  getLanguageName () { return 'PowerShell' }
  getServerName () { return 'PowerShell Editor Services' }
  getConnectionType() { return 'socket' }
  getRootConfigurationKey() { return 'ide-powershell' }

  startServerProcess () {
    // TODO: React to setting changes like vscode-powershell
    atom.config.observe('ide-powershell', (settings) => this.sessionSettings = settings);

    this.log = new Logger();
    this.log.startNewLog(this.sessionSettings.developer.editorServicesLogLevel);
    this.log.write("Starting ide-powershell...")

    this.platformDetails = getPlatformDetails();

    var startPromise = undefined;

    if (this.terminalTabService) {
      this.log.writeVerbose("terminal-tab service available, continuing...")
      startPromise = this._startTerminal();
    }
    else {
      this.log.writeVerbose("Waiting for terminal-tab service...")
      startPromise = new Promise(
        (resolve, reject) => {
          this.terminalTabServiceResolver = resolve;
      }).then(() => {
        return this._startTerminal();
      });
    }

    return startPromise;
  }

  _startTerminal() {
    this.log.writeVerbose("Starting PowerShell Editor Services in a terminal...");

    var sessionFilePath =
        utils.getSessionFilePath(
            Math.floor(100000 + Math.random() * 900000));

    // TODO: Download PSES!

    var bundledModulesPath =
      this.sessionSettings.developer.bundledModulesPath ||
      path.resolve(__dirname, "../modules");

    var packageInfo: any = atom.packages.getLoadedPackage('ide-powershell');
    var editorServicesArgs =
      "-EditorServicesVersion '" + requiredEditorServicesVersion + "' " +
      "-HostName 'Atom Host' " +
      "-HostProfileId 'GitHub.Atom' " +
      "-HostVersion '" + packageInfo.metadata.version + "' " +
      "-AdditionalModules @() " + //"@('PowerShellEditorServices.Atom') " +
      "-BundledModulesPath '" + bundledModulesPath + "' " +
      "-EnableConsoleRepl ";

    // if (this.sessionSettings.developer.editorServicesWaitForDebugger) {
    //   editorServicesArgs += '-WaitForDebugger ';
    // }

    if (this.sessionSettings.developer.editorServicesLogLevel) {
      editorServicesArgs += "-LogLevel '" + this.sessionSettings.developer.editorServicesLogLevel + "' "
    }

    const powerShellExePath = getDefaultPowerShellPath(this.platformDetails);

    this.powerShellProcess =
      new PowerShellProcess(
        powerShellExePath,
        "PowerShell Integrated Terminal",
        this.log,
        editorServicesArgs,
        sessionFilePath,
        this.sessionSettings,
        this.terminalTabService);

    return this.powerShellProcess.start("EditorServices").then(
      (sessionDetails) => {
        if (!sessionDetails) {
          throw "Could not start PowerShell Editor Services"
        }

        return new Promise<LanguageServerProcess>(
            (resolve, reject) => {
                var socket = net.connect(sessionDetails.languageServicePort);
                socket.on(
                    'connect',
                    () => {
                        this.log.write("Language service connected.");
                        this.socket = socket;
                        resolve(this.powerShellProcess.getProcess());
                    });
            });
    })
  }

  mapConfigurationObject(config) {
    // Wrap the config object in a 'powershell' key
    return {
      powershell: config
    };
  }

  filterChangeWatchedFiles(filePath) {
    return this.supportedExtensions.indexOf(path.extname(filePath).toLowerCase()) > -1;
  }

  consumeTerminalTabService(terminalTabService) {
    this.terminalTabService = terminalTabService;
    if (this.terminalTabServiceResolver) {
      this.terminalTabServiceResolver(terminalTabService);
    }
  }
}

module.exports = new PowerShellLanguageClient()
