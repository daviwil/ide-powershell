import { CompositeDisposable, Panel, TextEditor, TextEditorElement } from "atom";
import { EventEmitter } from "events";
import { IInputMenuResult, InputMenuResultReason } from "./menuSelect";
/**
 * Creates an input prompt and presents it to the user.
 * @export
 * @param {string} message - The message to be displayed under the prompt describing the prompt's purpose.
 * @returns {Promise<IInputMenuResult<string>>} - The text input by the user.
 */
export async function getInputPrompt(message: string): Promise<IInputMenuResult<string>> {
    return await new InputPrompt(message).getResult();
}

class InputPrompt {
    public element: HTMLElement;

    private editor: TextEditor;
    private emitter: EventEmitter;
    private disposables: CompositeDisposable;
    private activePanel: Panel;
    private previouslyFocusedElement: HTMLElement;
    private editorElement: TextEditorElement;

    constructor(message: string) {
        this.disposables = new CompositeDisposable();
        this.emitter = new EventEmitter();
        this.editor = new TextEditor({ mini: true });

        this.element = document.createElement("div");
        this.editorElement = atom.views.getView(this.editor);
        this.element.appendChild(this.editorElement);

        const messageElement = document.createElement("div");
        messageElement.textContent = message;
        messageElement.style.fontWeight = "bold";

        this.element.appendChild(messageElement);
    }

    public async getResult(): Promise<IInputMenuResult<string>> {
        this.show();
        try {
            return await this.waitForConfirmation();
        } finally {
            this.dispose();
        }
    }

    private dispose(): void {
        this.disposables.dispose();
        if (this.previouslyFocusedElement !== null) {
            this.previouslyFocusedElement.focus();
            this.previouslyFocusedElement = null;
        }

        if (this.activePanel === null) {
            return;
        }

        this.activePanel.destroy();
    }

    private waitForConfirmation(): Thenable<IInputMenuResult<string>> {
        return new Promise((resolve, reject) => {
            this.emitter.once(
                "inputPromptCompleted",
                (result: IInputMenuResult<string>) => resolve(result));
        });
    }

    private show() {
        this.previouslyFocusedElement = document.activeElement as HTMLElement;
        this.activePanel = atom.workspace.addModalPanel({ item: this });
        this.disposables.add(
            atom.commands.add(this.element, {
                "core:cancel": (event) => {
                    this.cancel();
                    event.stopPropagation();
                },
                "core:confirm": (event) => {
                    this.confirm();
                    event.stopPropagation();
                },
            }));

        this.editorElement.focus();
        this.editorElement.addEventListener("blur", () => this.cancel());
    }

    private confirm(): void {
        this.emitter.emit("inputPromptCompleted", {
            reason: InputMenuResultReason.Completed,
            value: this.editor.getText(),
        } as IInputMenuResult<string>);
    }

    private cancel(): void {
        this.emitter.emit("inputPromptCompleted", {
            reason: InputMenuResultReason.Cancelled,
            value: "",
        } as IInputMenuResult<string>);
    }
}
