import type { Locator, Page } from "@playwright/test";
import { visit } from "../navigation";

export class SearchPage {
  constructor(private readonly page: Page) {}

  async open(query: string): Promise<void> {
    await visit(this.page, `/search?q=${encodeURIComponent(query)}`);
  }

  /**
   * Results are rendered as <button>s, not links (see FINDINGS F-W2), so we
   * locate them by role + accessible name, which matches how users perceive them.
   */
  result(name: RegExp): Locator {
    return this.page.getByRole("main").getByRole("button", { name });
  }

  get searchBox(): Locator {
    return this.page.getByRole("main").getByRole("textbox", { name: "Search" });
  }
}
