import { TextEditor } from 'atom';

export class SessionManager {
  private activeServer: any;

  constructor(private serverManager: any) {
  }

  public setActiveServer(server: any) {
    this.activeServer = server;
  }

  public sendRequest<T>(method: string, params: any): Promise<T>
  public sendRequest<T>(method: string, params: any, editor?: TextEditor): Promise<T>
  public async sendRequest<T>(method: string, params: any, server?: any): Promise<T> {
    let realServer = server;
    if (!server) {
      server = this.activeServer;
    }
    else if (server.buffer) {
      // server is a TextEditor
      realServer = await this.serverManager.getServer(server)
    }

    if (realServer) {
      return await realServer.sendRequest(method, params);
    }
    else {
      throw 'No language server is available'
    }
  }
}
