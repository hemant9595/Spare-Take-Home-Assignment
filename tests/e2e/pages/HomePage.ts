import type { Locator, Page } from "@playwright/test";
import { visit } from "../navigation";

/** Product detail links, e.g. /products/<slug> (excluding sub-pages like /reviews). */
export const PRODUCT_LINK = 'a[href^="/products/"]:not([href*="/reviews"]):not([href*="/launches"])';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await visit(this.page, "/");
  }

  /** Product links in the main content area (the daily leaderboard). */
  get productLinks(): Locator {
    return this.page.getByRole("main").locator(PRODUCT_LINK);
  }

  /**
   * Open today's top product the way a user does: click it on the leaderboard.
   * (Direct hard loads of /products/<slug> are more aggressively bot-challenged.)
   */
  async openTopProduct(): Promise<{ name: string; slug: string }> {
    await this.open();
    const { link, name, slug } = await this.firstProduct();
    await link.click();
    await this.page.waitForURL(new RegExp(`/products/${slug}`));
    return { name, slug };
  }

  /** First product link that has visible text (its name), with its slug. */
  async firstProduct(): Promise<{ link: Locator; name: string; slug: string }> {
    const link = this.productLinks.filter({ hasText: /\S/ }).first();
    await link.waitFor();
    const name = (await link.innerText()).split("\n")[0]!.replace(/^\d+\.\s*/, "").trim();
    const href = (await link.getAttribute("href"))!;
    const slug = href.split("/")[2]!.split(/[?#]/)[0]!;
    return { link, name, slug };
  }
}
