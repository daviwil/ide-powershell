import * as Atom from "atom";
import { LanguageClientConnection } from "atom-languageclient";
import os = require("os");
import { normalize } from "path";
import path = require("path");
import { RequestType } from "vscode-jsonrpc";
import { getInputPrompt } from "./inputPrompt";
import { Logger } from "./logging";
import { getSingleMenuSelection, IMenuItem, InputMenuResultReason } from "./menuSelect";
import { getDebugSessionFilePath } from "./utils";

export class AtomCommandInvocationRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, object, object>(
            "powerShell/atomCommandInvocation");
}

export class ShowChoicePromptRequest {
    public static type =
        new RequestType<IShowChoicePromptRequestArgs, IShowChoicePromptResponseBody, string, void>(
            "powerShell/showChoicePrompt");
}

export class ShowInputPromptRequest {
    public static type =
        new RequestType<IShowInputPromptRequestArgs, IShowInputPromptResponseBody, string, void>(
            "powerShell/showInputPrompt");
}

export class GetEditorContextRequest {
    public static type =
        new RequestType<{}, IEditorContext, void, void>(
            "editor/getEditorContext");
}

export class InsertTextRequest {
    public static type =
        new RequestType<IInsertTextRequestArguments, EditorOperationResponse, void, void>(
            "editor/insertText");
}

export class SetSelectionRequest {
    public static type =
        new RequestType<ISetSelectionRequestArguments, EditorOperationResponse, void, void>(
            "editor/setSelection");
}

export class OpenFileRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/openFile");
}

export class NewFileRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/newFile");
}

export class CloseFileRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/closeFile");
}

export class SaveFileRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/saveFile");
}

export class ShowErrorMessageRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/showErrorMessage");
}

export class ShowWarningMessageRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/showWarningMessage");
}

export class ShowInformationMessageRequest {
    public static type =
        new RequestType<string, EditorOperationResponse, void, void>(
            "editor/showInformationMessage");
}

export class SetStatusBarMessageRequest {
    public static type =
        new RequestType<IStatusBarMessageDetails, EditorOperationResponse, void, void>(
            "editor/setStatusBarMessage");
}

export interface IChoiceDetails {
    label: string;
    helpMessage: string;
}

interface IShowInputPromptRequestArgs {
    name: string;
    label: string;
}

interface IShowInputPromptResponseBody {
    responseText: string;
    promptCancelled: boolean;
}

export interface IShowChoicePromptRequestArgs {
    isMultiChoice: boolean;
    caption: string;
    message: string;
    choices: IChoiceDetails[];
    defaultChoices: number[];
}

export interface IShowChoicePromptResponseBody {
    responseText: string;
    promptCancelled: boolean;
}

export interface IExtensionCommand {
    name: string;
    displayName: string;
}

export interface IRange {
    start: IPosition;
    end: IPosition;
}

export interface IPosition {
    line: number;
    character: number;
}

export interface IEditorContext {
    currentFilePath: string;
    cursorPosition: IPosition;
    selectionRange: IRange;
}

export interface IInsertTextRequestArguments {
    filePath: string;
    insertText: string;
    insertRange: IRange;
}

export interface ISetSelectionRequestArguments {
    selectionRange: IRange;
}

export interface IStatusBarMessageDetails {
    message: string;
    timeout?: number;
}

export enum EditorOperationResponse {
    Unsupported = 0,
    Completed,
}

export class ExtensionCommands {
    private clientConnection: LanguageClientConnection;

    public setLanguageClient(languageClientConnection: LanguageClientConnection, log: Logger) {
        this.clientConnection = languageClientConnection;

        this.clientConnection._onRequest(
            AtomCommandInvocationRequest.type,
            (command) => this.invokeAtomCommand(command));

        this.clientConnection._onRequest(
            ShowInputPromptRequest.type,
            (promptDetails) => this.showInputPrompt(promptDetails));

        this.clientConnection._onRequest(
            ShowChoicePromptRequest.type,
            (promptDetails) => this.showChoicePrompt(promptDetails));

        this.clientConnection._onRequest(
            GetEditorContextRequest.type,
            (details) => this.getEditorContext());

        this.clientConnection._onRequest(
            InsertTextRequest.type,
            (details) => this.insertText(details));

        this.clientConnection._onRequest(
            SetSelectionRequest.type,
            (details) => this.setSelection(details));

        this.clientConnection._onRequest(
            OpenFileRequest.type,
            (filePath) => this.openFile(filePath));

        this.clientConnection._onRequest(
            NewFileRequest.type,
            (filePath) => this.newFile());

        this.clientConnection._onRequest(
            CloseFileRequest.type,
            (filePath) => this.closeFile(filePath));

        this.clientConnection._onRequest(
            SaveFileRequest.type,
            (filePath) => this.saveFile(filePath));

        this.clientConnection._onRequest(
            ShowErrorMessageRequest.type,
            (message) => this.showErrorMessage(message));

        this.clientConnection._onRequest(
            ShowWarningMessageRequest.type,
            (message) => this.showWarningMessage(message));

        this.clientConnection._onRequest(
            ShowInformationMessageRequest.type,
            (message) => this.showInformationMessage(message));
    }

    private invokeAtomCommand(command: string): EditorOperationResponse {
        // TODO: Add arguments/return value/check if registered
        atom.commands.dispatch(
            atom.views.getView(
                atom.workspace.getActiveTextEditor()),
            command);

        return EditorOperationResponse.Completed;
    }

    private showInputPrompt(promptDetails: IShowInputPromptRequestArgs): Thenable<IShowInputPromptResponseBody> {
        return getInputPrompt(promptDetails.name).then(
            (result) => {
                return {
                    promptCancelled: result.reason === InputMenuResultReason.Cancelled,
                    responseText: result.value,
                };
            });
    }

    private showChoicePrompt(promptDetails: IShowChoicePromptRequestArgs): Thenable<IShowChoicePromptResponseBody> {
        if (promptDetails.isMultiChoice) {
            // TODO: Add multi choice select menu.
            return Promise.reject("Multiple select is not currently supported.");
        }

        return getSingleMenuSelection<IChoiceDetails>(promptDetails.message, asSelectMenuItems(promptDetails.choices))
            .then((result) => {
                return {
                    promptCancelled: result.reason === InputMenuResultReason.Cancelled,
                    responseText: result.value.label,
                };
            });
    }

    private getEditorContext(): IEditorContext {
        const editor = atom.workspace.getActiveTextEditor();
        return {
            currentFilePath: editor.getPath(),
            cursorPosition: asPosition(editor.getCursorBufferPosition()),
            selectionRange: asRange(editor.getSelectedBufferRange()),
        };
    }

    private insertText(details: IInsertTextRequestArguments): EditorOperationResponse {
        atom.workspace
            .getActiveTextEditor()
            .setTextInBufferRange(
                asAtomRange(details.insertRange),
                details.insertText);

        return EditorOperationResponse.Completed;
    }

    private setSelection(details: ISetSelectionRequestArguments): EditorOperationResponse {
        atom.workspace
            .getActiveTextEditor()
            .setSelectedBufferRange(
                asAtomRange(details.selectionRange));

        return EditorOperationResponse.Completed;
    }

    private openFile(filePath: string): Thenable<EditorOperationResponse> {
        return atom.workspace
            .open(this.normalizeFilePath(filePath))
            .then(() => EditorOperationResponse.Completed);
    }

    private newFile(): Thenable<EditorOperationResponse> {
        return atom.workspace.open()
            .then(() => EditorOperationResponse.Completed);
    }

    private closeFile(filePath: string): EditorOperationResponse {
        const targetEditor = this.findOpenTextEditor(filePath);
        if (targetEditor === undefined || targetEditor === null) {
            return EditorOperationResponse.Completed;
        }

        // This should either throw, save first, or have a force parameter.
        if (targetEditor.isModified) {
            return EditorOperationResponse.Completed;
        }

        // Better way to close?
        targetEditor.getBuffer().destroy();
        return EditorOperationResponse.Completed;
    }

    private saveFile(filePath: string): Thenable<EditorOperationResponse> {
        const targetEditor = this.findOpenTextEditor(filePath);
        if (targetEditor === undefined || targetEditor === null) {
            return Promise.resolve(EditorOperationResponse.Completed);
        }

        if (!targetEditor.isModified) {
            return Promise.resolve(EditorOperationResponse.Completed);
        }

        return targetEditor
            .save()
            .then(() => EditorOperationResponse.Completed);
    }

    private showErrorMessage(message: string): EditorOperationResponse {
        atom.notifications.addError(message);
        return EditorOperationResponse.Completed;
    }

    private showWarningMessage(message: string): EditorOperationResponse {
        atom.notifications.addWarning(message);
        return EditorOperationResponse.Completed;
    }

    private showInformationMessage(message: string): EditorOperationResponse {
        atom.notifications.addInfo(message);
        return EditorOperationResponse.Completed;
    }

    private setStatusBarMessage(details: IStatusBarMessageDetails): EditorOperationResponse {
        // TODO: Add support for this. Should be pretty easy.
        return EditorOperationResponse.Unsupported;
    }

    private findOpenTextEditor(filePath: string): Atom.TextEditor {
        filePath = this.normalizeFilePath(filePath);
        return atom.workspace
            .getTextEditors()
            .find((editor) => this.normalizeFilePath(editor.getPath()) === filePath);
    }

    private normalizeFilePath(filePath: string): string {
        const platform = os.platform();
        if (platform === "win32") {
            // Make sure the file path is absolute
            if (!path.win32.isAbsolute(filePath)) {
                filePath = path.win32.resolve(
                    atom.project.getPaths()[0],
                    filePath);
            }

            // Normalize file path case for comparison for Windows
            return filePath.toLowerCase();
        } else {
            // Make sure the file path is absolute
            if (!path.isAbsolute(filePath)) {
                filePath = path.resolve(
                    atom.project.getPaths()[0],
                    filePath);
            }

            // macOS is case-insensitive
            if (platform === "darwin") {
                filePath = filePath.toLowerCase();
            }

            return  filePath;
        }
    }
}

function asSelectMenuItems(choices: IChoiceDetails[]): Array<IMenuItem<IChoiceDetails>> {
    return choices.map((choice) => {
        return {
            display: choice.helpMessage,
            name: choice.label,
            value: choice,
        };
    });
}

function asPosition(value: Atom.Point): IPosition {
    if (value === undefined) {
        return undefined;
    } else if (value === null) {
        return null;
    }

    return {
        character: value.column,
        line: value.row,
    };
}

function asRange(value: Atom.Range): IRange {
    if (value === undefined) {
        return undefined;
    } else if (value === null) {
        return null;
    }

    return {
        end: asPosition(value.end),
        start: asPosition(value.start),
    };
}

function asAtomPoint(value: IPosition): Atom.Point {
    return new Atom.Point(value.line, value.character);
}

function asAtomRange(value: IRange): Atom.Range {
    if (value === undefined) {
        return undefined;
    } else if (value === null) {
        return null;
    }

    return new Atom.Range(
        asAtomPoint(value.start),
        asAtomPoint(value.end));
}
