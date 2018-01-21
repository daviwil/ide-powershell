import { TextEditor } from 'atom';
import { ServerManager } from './serverManager';

interface EvaluateRequestArguments {
    expression: string;
}

export class IntegratedConsole {

  constructor(private serverManager: ServerManager) {

  }

  public async runSelection(editor: TextEditor) {
    //await
  }
}
