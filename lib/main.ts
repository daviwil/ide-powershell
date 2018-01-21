import fs = require('fs');
import net = require('net');
import path = require('path');
import utils = require('./utils');
import cp = require('child_process');

import { CompositeDisposable, TextEditor } from 'atom';
import { AutoLanguageClient, DownloadFile } from 'atom-languageclient';
import { PowerShellProcess, LanguageServerProcess } from './process';
import { PlatformDetails, getPlatformDetails, getDefaultPowerShellPath } from './platform';
import { ITerminalService } from './terminalService';
import { ServerManager } from './serverManager';
import { Logger } from './logging';
import { ExtensionCommands } from "./extensionCommands";

// NOTE: We will need to find a better way to deal with the required
//       PS Editor Services version...
const requiredEditorServicesVersion = "1.5.1";

// DESIGN:
// - PowerShellProcess: handles launching PowerShell with correct args, exposing
//   session parameters
// - Session?: Exposes API for sending requests, listening for events
// - SessionManager: handles multiple sessions, if necessary
// - IntegratedConsole: Running files and selections...?  What about debugging?

class PowerShellLanguageClient extends AutoLanguageClient {

  private log: Logger;
  private sessionSettings: any;
  private serverManager: ServerManager;
  private disposables: CompositeDisposable;
  private terminalTabService: ITerminalService;
  private powerShellProcess: PowerShellProcess;
  private dependencyInstallPromise: Promise<any>;
  private terminalTabServiceResolver: (ITerminalService) => void;
  private supportedExtensions = [ ".ps1", ".psm1", ".ps1xml" ];
  private platformDetails: PlatformDetails;
  private extensionCommands: ExtensionCommands;

  // These are defined in the base class, redefined for typings
  public socket: net.Socket;
  private _serverManager: any;

  getGrammarScopes () { return [ 'source.powershell' ] }
  getLanguageName () { return 'PowerShell' }
  getServerName () { return 'PowerShell Editor Services' }
  getConnectionType() { return 'socket' }
  getRootConfigurationKey() { return 'ide-powershell' }

  shouldRestartFailedServer(server: any):  Promise<boolean>{
    return new Promise<boolean>(
      (resolve, reject) => {
        const prompt = atom.notifications.addInfo(
          'The PowerShell session has terminated due to an error, would you like to restart it?',
          {
            buttons: [
              { text: 'Yes', onDidClick() { console.log("dismiss", prompt); prompt.dismiss(); resolve(true) }},
              { text: 'No', onDidClick() { console.log("dismiss", prompt); prompt.dismiss(); resolve(false) }}
            ]
          });
      });
  }

  activate() {
    this.disposables = new CompositeDisposable();

    this.disposables.add(
      atom.commands.add(
        'atom-workspace',
        'powershell:restart-session',
        {
          displayName: "PowerShell: Restart Current Session",
          didDispatch: this.restart.bind(this)
        }
      ));

    this.disposables.add(
      atom.commands.add(
        'atom-text-editor',
        'powershell:run-file',
        {
          displayName: "PowerShell: Run Current File",
          description: "Runs the current file in the PowerShell Integrated Console",
          didDispatch(e) {
            const editor: any = atom.workspace.getActiveTextEditor();
            if (editor && editor.getGrammar().scopeName === "source.powershell") {
              console.log("Run file!", editor.buffer.file.path);
            }
          }
        }));

    this.disposables.add(
      atom.commands.add(
        'atom-text-editor',
        'powershell:run-selection',
        {
          displayName: "PowerShell: Run Selection in Current File",
          description: "Runs the current selection in the PowerShell Integrated Console",
          didDispatch(e) {
            const editor: any = atom.workspace.getActiveTextEditor();
            if (editor && editor.getGrammar().scopeName === "source.powershell") {
              console.log("Run selection!", editor.getSelectedText());
            }
          }
        }));

    // Ensure dependency packages are installed
    this.dependencyInstallPromise =
      require('atom-package-deps').install('ide-powershell', false).then(async () => {
        await this.ensureEditorServicesIsInstalled();
      })

    super.activate();
  }

  async startServerProcess (projectPath: string) {
    await this.dependencyInstallPromise;
    this.dependencyInstallPromise = null;

    if (!this.serverManager) {
            buttons: [
              { text: 'Yes', onDidClick() { console.log("dismiss", prompt); prompt.dismiss(); resolve(true) }},
              { text: 'No', onDidClick() { console.log("dismiss", prompt); prompt.dismiss(); resolve(false) }}
            ]
          });

      this.serverManager = new ServerManager(this._serverManager);
    }

    // TODO: React to setting changes like vscode-powershell
    atom.config.observe('ide-powershell', (settings) => this.sessionSettings = settings);

    this.log = new Logger();
    this.log.startNewLog(this.sessionSettings.developer.editorServicesLogLevel);
    this.log.write("Starting ide-powershell...")

    this.platformDetails = getPlatformDetails();

    if (this.terminalTabService) {
      this.log.writeVerbose("terminal-tab service available, continuing...")
      return await this.startTerminal(projectPath);
    }
    else {
      this.log.writeVerbose("Waiting for terminal-tab service...")
      await new Promise(
        (resolve, reject) => {
          this.terminalTabServiceResolver = resolve;
      });

      return await this.startTerminal(projectPath);
    }
  }

  public postInitialization(server) {
    // Set the active server as the most recent one to appear
    this.serverManager.setActiveServer(server);
    
    this.extensionCommands = new ExtensionCommands();
    this.extensionCommands.setLanguageClient(server.connection, this.log);
  }

  private async ensureEditorServicesIsInstalled() {
    const modulesPath = path.resolve(__dirname, "../modules/");
    const zipPath = path.resolve(modulesPath, "PowerShellEditorServices.zip");

    if (!fs.existsSync(path.resolve(modulesPath, "PowerShellEditorServices/"))) {
      atom.notifications.addInfo('Downloading PowerShell Editor Services...');

      await DownloadFile(
        "https://github.com/PowerShell/PowerShellEditorServices/releases/download/v1.5.0/PowerShellEditorServices.zip",
        zipPath,
        (bytes, percent) => { /*console.log(`${percent}% downloaded`) */},
        2103461 /* Known byte size of PowerShellEditorServices.zip */);

      const decompress = require('decompress');
      await decompress(zipPath, modulesPath);
      fs.unlinkSync(zipPath);

      atom.notifications.addSuccess('PowerShell Editor Services installed!');
    }
  }

  private async startTerminal(projectPath: string) {
    this.log.writeVerbose("Starting PowerShell Editor Services in a terminal...");

    var sessionFilePath =
        utils.getSessionFilePath(
            Math.floor(100000 + Math.random() * 900000));

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

    const subTitle = projectPath ? ` - ${path.basename(projectPath)}` : '';

    this.powerShellProcess =
      new PowerShellProcess(
        powerShellExePath,
        "PowerShell Integrated Console" + subTitle,
        this.log,
        editorServicesArgs,
        sessionFilePath,
        this.sessionSettings,
        this.terminalTabService);

    var sessionDetails = await this.powerShellProcess.start("EditorServices");
    if (!sessionDetails) {
      throw "Could not start PowerShell Editor Services"
    }

    await this.connectToLanguageService(sessionDetails);
    return this.powerShellProcess.getProcess();
  }

  connectToLanguageService(sessionDetails: utils.EditorServicesSessionDetails) {
    return new Promise(
        (resolve, reject) => {
            var socket = net.connect(sessionDetails.languageServicePort);
            socket.on(
                'connect',
                () => {
                    this.log.write("Language service connected.");
                    this.socket = socket;
                    resolve();
                });
        });
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
