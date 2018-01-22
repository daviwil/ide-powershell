import { Panel } from "atom";
import * as SelectListView from "atom-select-list";
import { EventEmitter } from "events";

/**
 * Creates a selection menu from the supplied items and presents it to the user.
 * @export
 * @template TItem - The menu item value type.
 * @param {string} message - The message to display under the query prompt describing the menu's purpose.
 * @param {Array<IMenuItem<TItem>>} items - The items to display.
 * @param {number} [defaultIndex=null] - The index of the value to return if the user does not select an item.
 * @returns {Promise<IInputMenuResult<TItem>>} - The value of the item selected.
 */
export async function getSingleMenuSelection<TItem>(
    message: string,
    items: Array<IMenuItem<TItem>>,
    defaultIndex: number = null)
    : Promise<IInputMenuResult<TItem>> {

    if (defaultIndex !== null && (defaultIndex > items.length - 1 || defaultIndex < 0)) {
        throw new RangeError();
    }

    const result = await new SingleItemSelectMenu<TItem>(message, items).getResult();
    if (result.reason === InputMenuResultReason.Cancelled) {
        return result;
    }

    if (defaultIndex === null) {
        return result;
    }

    if (result.value === null || result.value === undefined) {
        result.value = items[defaultIndex].value;
    }

    return result;
}

/**
 * Represents an item in the menu.
 * @export
 * @interface IMenuItem
 * @template TItem - The type of value stored by this item.
 */
export interface IMenuItem<TItem> {
    value: TItem;
    name: string;
    display: string;
}

/**
 * Represents the result of a selection menu.
 * @export
 * @interface IItemSelectMenuResult
 * @template TItem - The menu item value type.
 */
export interface IInputMenuResult<TItem> {
    reason: InputMenuResultReason;
    value: TItem;
}

/**
 * Represents the reason the menu closed.
 * @export
 * @enum {number}
 */
export enum InputMenuResultReason {
    Completed,
    Cancelled,
}

/**
 * Represents a common base for menu selection classes.
 * @abstract
 * @class ItemSelectMenuBase
 * @template TItem - The menu item value type.
 * @template TResult - The type of the return value.
 */
abstract class ItemSelectMenuBase<TItem, TResult> {
    protected panel: ItemSelectMenuPanel<TItem>;
    protected transformElement: (element: HTMLElement, item: IMenuItem<TItem>) => HTMLElement;
    private emitter: EventEmitter;

    constructor(message: string, items: Array<IMenuItem<TItem>>) {
        this.emitter = new EventEmitter();
        this.panel = new ItemSelectMenuPanel<TItem>({
            didCancelSelection: () => this.cancel(),
            didConfirmSelection: (item) => this.onItemSelected(item),
            elementForItem: (item) => this.createElementForItem(item),
            infoMessage: message,
            items,
        });
    }

    /**
     * Presents the menu to the user and waits for a selection.
     * @returns {Promise<IInputMenuResult<TResult>>} The value of the selected item.
     * @memberof ItemSelectMenuBase
     */
    public async getResult(): Promise<IInputMenuResult<TResult>> {
        try {
            this.panel.attach();
            return await this.waitForCompletion();
        } finally {
            this.closeMenu();
        }
    }

    /**
     * Called when an item is selected by the user. Implementations should store the result
     * or call the complete method.
     * @protected
     * @abstract
     * @param {IMenuItem<TItem>} item - The item selected.
     * @memberof ItemSelectMenuBase
     */
    protected abstract onItemSelected(item: IMenuItem<TItem>): void;

    /**
     * Signals that the result is ready to be returned and the menu can be closed.
     * @protected
     * @param {TResult} result - The raw result value of the menu selection(s).
     * @memberof ItemSelectMenuBase
     */
    protected complete(result: TResult) {
        this.emitter.emit("menuSelectCompleted", {
            reason: InputMenuResultReason.Completed,
            value: result,
        } as IInputMenuResult<TResult>);
    }

    /**
     * Signals that the menu should be canceled.
     * @protected
     * @memberof ItemSelectMenuBase
     */
    protected cancel() {
        this.emitter.emit("menuSelectCompleted", {
            reason: InputMenuResultReason.Cancelled,
            result: null,
        });
    }

    private closeMenu() {
        this.panel.dispose();
    }

    private maybeTransformElement(element: HTMLElement, item: IMenuItem<TItem>): HTMLElement {
        if (this.transformElement === null || this.transformElement === undefined) {
            return element;
        }

        return this.transformElement(element, item);
    }

    private createElementForItem(item: IMenuItem<TItem>) {
        const listItem = document.createElement("li");

        const key = document.createElement("span");
        const keyContent = document.createElement("strong");
        keyContent.textContent = item.name;

        key.appendChild(keyContent);
        listItem.appendChild(key);
        if (item.display === null || item.display === undefined || item.display === "") {
            return this.maybeTransformElement(listItem, item);
        }

        const description = document.createElement("span");
        const descriptionContent = document.createElement("small");
        descriptionContent.textContent = " " + item.display;

        description.appendChild(descriptionContent);
        listItem.appendChild(description);
        return this.maybeTransformElement(listItem, item);
    }

    private waitForCompletion(): Thenable<IInputMenuResult<TResult>> {
        return new Promise((resolve, reject) => {
            this.emitter.once(
                "menuSelectCompleted",
                (result: IInputMenuResult<TResult>) => resolve(result));
        });
    }
}

/**
 * Represents a selection menu that closes after the first selection and returns the value stored
 * in the menu item.
 * @class SingleItemSelectMenu
 * @extends {ItemSelectMenuBase<TItem, TItem>}
 * @template TItem - The menu item value type.
 */
class SingleItemSelectMenu<TItem> extends ItemSelectMenuBase<TItem, TItem> {
    /**
     * An implementation of onItemSelected that completes the menu after the first selection.
     * @protected
     * @param {IMenuItem<TItem>} item - The item selected.
     * @memberof SingleItemSelectMenu
     */
    protected onItemSelected(item: IMenuItem<TItem>) {
        this.complete(item.value);
    }
}

/**
 * Represents the arguments required to create a ItemSelectMenuPanel.
 * @interface IItemSelectMenuPanelArguments
 * @template TItem - The menu item value type
 */
interface IItemSelectMenuPanelArguments<TItem> {
    didCancelSelection: () => void;
    didConfirmSelection: (item: IMenuItem<TItem>) => void;
    elementForItem: (item: IMenuItem<TItem>) => HTMLElement;
    infoMessage: string;
    items: Array<IMenuItem<TItem>>;
}

/**
 * Represents the panel element used for menu selections.
 * @class ItemSelectMenuPanel
 * @template TItem - The menu item value type.
 */
class ItemSelectMenuPanel<TItem> {
    private view: SelectListView;
    private activePanel: Panel;
    private previouslyFocusedElement: HTMLElement;

    constructor(args: IItemSelectMenuPanelArguments<TItem>) {
        args = Object.assign(args, {
            filterKeyForItem: (item: IMenuItem<TItem>) => item.name + item.display,
        });

        this.view = new SelectListView(args);
    }

    public get element(): HTMLElement {
        return this.view.element;
    }

    public dispose() {
        this.activePanel.destroy();
        this.view.destroy();
        if (this.previouslyFocusedElement !== null) {
            this.previouslyFocusedElement.focus();
            this.previouslyFocusedElement = null;
        }
    }

    public attach() {
        this.previouslyFocusedElement = document.activeElement as HTMLElement;
        this.activePanel = atom.workspace.addModalPanel<ItemSelectMenuPanel<TItem>>({ item: this });
        this.view.focus();
    }
}
