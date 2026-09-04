// Vite bundles the stylesheet on the strength of this import and injects
// it when the module loads. The import has no bindings: it is asked for
// because the module cannot be drawn without it, not to be read from.
import "./toolPalette.css";

/**
 * One entry in the palette: what to call it, and what choosing it does.
 *
 * A null `activate` is not an action that does nothing — it says the tool
 * cannot be chosen. The entry keeps its place and shows as unavailable, so
 * a tool that is planned but not built is visible without being pickable.
 */
export interface PaletteItem {
  readonly id: string;
  readonly label: string;
  readonly activate: (() => void) | null;
}

/**
 * The panel of tool buttons over the canvas: shows what can be chosen and
 * marks what is chosen.
 *
 * Knows nothing of tools, the road network or the scene — an entry is a
 * label and a function. What that function does is wired where the layers
 * already meet, in `main.ts`.
 */
export class ToolPalette {
  private readonly buttons = new Map<string, HTMLButtonElement>();

  /** Which tool is chosen. Null before the app has picked one. */
  private selected: string | null = null;

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. The document is taken from `host` rather than reached for
   * globally, so the palette builds into whichever page it was handed.
   */
  constructor(
    host: HTMLElement,
    private readonly items: readonly PaletteItem[],
  ) {
    const doc = host.ownerDocument;

    const root = doc.createElement("div");
    root.className = "tool-palette";

    for (const item of items) {
      const button = doc.createElement("button");
      // A button in HTML defaults to submitting a form, of which there is
      // none here; "button" is the plain one that only fires its handler.
      button.type = "button";
      button.textContent = item.label;
      button.disabled = item.activate === null;

      button.addEventListener("click", () => {
        this.select(item.id);
        // The global key bindings listen on the window, so a button that
        // kept focus would fire again on Space or Enter. Dropping it leaves
        // the keys meaning over the panel what they mean over the canvas.
        button.blur();
      });

      root.append(button);
      this.buttons.set(item.id, button);
    }

    host.append(root);
  }

  /**
   * Chooses a tool: marks its button and runs its action. This is the whole
   * of how a tool becomes the active one, whether the user clicked or the
   * app picked the one to start with.
   *
   * Choosing the tool that is already chosen is not a switch, and does
   * nothing at all. Acting on it would run the entry again, which builds a
   * second tool of the same kind and disposes the one running — ending
   * whatever it had in progress, for a click that asked for no change.
   *
   * An unknown or unavailable id is a mistake in the wiring rather than
   * anything the user did, so it throws instead of being ignored.
   */
  select(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item === undefined) {
      throw new Error(`The palette has no entry named "${id}".`);
    }
    if (item.activate === null) {
      throw new Error(`The palette entry "${id}" cannot be chosen.`);
    }
    if (id === this.selected) return;

    this.selected = id;
    for (const [candidate, button] of this.buttons) {
      button.classList.toggle("is-selected", candidate === id);
    }

    item.activate();
  }
}
