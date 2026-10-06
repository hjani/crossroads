// As in `ToolPalette`: the stylesheet is imported because the panel cannot
// be drawn without it, not to be read from.
import "./sectionSettingsPanel.css";
import type { RoadProfile } from "../core/network/types";
import {
  ONE_LANE_PROFILE,
  TWO_LANE_PROFILE,
  type SectionSettings,
} from "../input/SectionSettings";

/** The profiles the buttons set. */
const PROFILE_CHOICES = [
  { label: "one lane", profile: ONE_LANE_PROFILE },
  { label: "two lanes", profile: TWO_LANE_PROFILE },
] as const;

/**
 * The section tools' settings: which road they build, one lane or two each
 * way. Writes the choice into the shared `SectionSettings`, and tells
 * whoever watches that it changed.
 *
 * Lives exactly as long as the tool that shows it.
 */
export class SectionSettingsPanel {
  private readonly root: HTMLElement;
  private readonly buttons: {
    element: HTMLButtonElement;
    profile: RoadProfile;
  }[] = [];
  private readonly settingsChangedListeners = new Set<() => void>();

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. Shows the profile `settings` already holds as chosen.
   */
  constructor(
    host: HTMLElement,
    private readonly settings: SectionSettings,
  ) {
    const doc = host.ownerDocument;

    this.root = doc.createElement("div");
    this.root.className = "panel section-settings-panel";

    for (const { label, profile } of PROFILE_CHOICES) {
      const element = doc.createElement("button");
      element.type = "button";
      element.textContent = label;
      element.addEventListener("click", () => {
        this.choose(profile);
        // As in the palette: keys mean the same over the panel as over the
        // canvas.
        element.blur();
      });
      this.root.append(element);
      this.buttons.push({ element, profile });
    }

    this.markChosen();
    host.append(this.root);
  }

  /**
   * Watch for the settings changing. Returns the function that stops
   * watching.
   */
  onSettingsChanged(listener: () => void): () => void {
    this.settingsChangedListeners.add(listener);
    return () => this.settingsChangedListeners.delete(listener);
  }

  /** Takes the panel off the page. It is unusable after. */
  dispose(): void {
    this.root.remove();
  }

  /** Choosing the profile already chosen is no change, and says nothing. */
  private choose(profile: RoadProfile): void {
    if (isSameProfile(profile, this.settings.profile)) return;

    this.settings.profile = profile;
    this.markChosen();
    for (const listener of this.settingsChangedListeners) listener();
  }

  private markChosen(): void {
    for (const { element, profile } of this.buttons) {
      element.classList.toggle(
        "is-selected",
        isSameProfile(profile, this.settings.profile),
      );
    }
  }
}

/** Every field equal: profiles are compared by value. */
function isSameProfile(a: RoadProfile, b: RoadProfile): boolean {
  return a.width === b.width && a.lanesPerDirection === b.lanesPerDirection;
}
