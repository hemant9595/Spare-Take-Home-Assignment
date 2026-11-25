import type { Locator, Page, Response } from "@playwright/test";
import { visit } from "../navigation";

export class ProductPage {
  constructor(private readonly page: Page) {}

  async open(slug: string): Promise<Response | null> {
    return visit(this.page, `/products/${slug}`);
  }

  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1 }).first();
  }

  get upvoteButton(): Locator {
    return this.page.getByRole("button", { name: /upvote/i }).first();
  }

  /** Anonymous users should be routed to sign-in: either a modal or the /login page. */
  get signInPrompt(): Locator {
    return this.page
      .getByRole("dialog")
      .filter({ hasText: /sign (in|up)|log ?in|continue with/i })
      .or(this.page.getByRole("heading", { name: /sign (in|up)|log ?in|welcome/i }));
  }

  meta(name: string): Locator {
    return this.page.locator(`head meta[property="${name}"], head meta[name="${name}"]`).first();
  }

  get canonical(): Locator {
    return this.page.locator('head link[rel="canonical"]');
  }
}
