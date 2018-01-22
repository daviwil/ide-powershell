import { Disposable } from 'atom';
import cp = require('child_process');

export interface ITerminal {
  show(preserveFocus: boolean): boolean
  dispose(): Disposable,
  getProcess(): cp.ChildProcess
}

export interface OpenTerminalOptions {
  shell: string,
  args: string[],
  title?: string
}

export interface ITerminalService {
  openTerminal(options: OpenTerminalOptions): Promise<ITerminal>
}
